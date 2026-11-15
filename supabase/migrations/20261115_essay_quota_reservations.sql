-- Reserve daily essay capacity before calling OpenAI; finalize only after result storage.
-- Existing attempts remain intact; counters are reconciled from successfully stored results.
alter table public.essay_usage_limits
  add column if not exists reserved integer not null default 0;

alter table public.essay_attempts add column if not exists request_id uuid;
update public.essay_attempts set request_id = gen_random_uuid() where request_id is null;
alter table public.essay_attempts alter column request_id set default gen_random_uuid();
alter table public.essay_attempts alter column request_id set not null;
create unique index if not exists essay_attempts_user_request_uidx
  on public.essay_attempts (user_id, request_id);

-- The old counter included failed OpenAI calls. Recount successful, persisted results only.
update public.essay_usage_limits l
set attempts = least(3, (
  select count(*)::integer from public.essay_attempts a
  where a.user_id = l.user_id and a.submitted_at::date = l.usage_date
));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'essay_usage_limits_attempts_reserved_check'
      and conrelid = 'public.essay_usage_limits'::regclass
  ) then
    alter table public.essay_usage_limits
      add constraint essay_usage_limits_attempts_reserved_check
      check (attempts between 0 and 3 and reserved between 0 and 3 and attempts + reserved <= 3);
  end if;
end;
$$;

create table if not exists public.essay_attempt_reservations (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  lease_token uuid not null default gen_random_uuid(),
  usage_date date not null,
  status text not null check (status in ('reserved', 'succeeded', 'released')),
  reserved_at timestamptz not null default now(),
  finalized_at timestamptz,
  primary key (user_id, request_id)
);
-- Also supports an installation that created the table before lease fencing was added.
alter table public.essay_attempt_reservations
  add column if not exists lease_token uuid;
update public.essay_attempt_reservations
set lease_token = gen_random_uuid()
where lease_token is null;
alter table public.essay_attempt_reservations
  alter column lease_token set default gen_random_uuid(),
  alter column lease_token set not null;
create index if not exists essay_attempt_reservations_user_date_idx
  on public.essay_attempt_reservations (user_id, usage_date, status);

alter table public.essay_attempt_reservations enable row level security;
revoke all on public.essay_attempt_reservations from public, anon, authenticated;
grant all on public.essay_attempt_reservations to service_role;

-- The old function counted before evaluation. Keep it for migration compatibility but disable it.
revoke all on function public.consume_promptly_essay_attempt() from public, anon, authenticated;
-- The Pro helper uses fully qualified objects, so it does not need public in its definer search path.
alter function public.is_promptly_pro() set search_path = pg_catalog;

drop function if exists public.reserve_promptly_essay_attempt(uuid);
create function public.reserve_promptly_essay_attempt(p_request_id uuid, p_lease_token uuid)
returns text language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_attempts integer;
  v_reserved integer;
  v_last_attempt_at timestamptz;
  v_status text;
  v_stale_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'Request ID required.' using errcode = '22023'; end if;
  if p_lease_token is null then raise exception 'Lease token required.' using errcode = '22023'; end if;

  select role into v_role from public.profiles where id = v_user_id;
  if coalesce(v_role, 'user') <> 'admin' and not public.is_promptly_pro() then
    raise exception 'Promptly Pro access required.' using errcode = '42501';
  end if;

  insert into public.essay_usage_limits (user_id, usage_date, attempts, reserved, last_attempt_at)
  values (v_user_id, current_date, 0, 0, null)
  on conflict (user_id, usage_date) do nothing;
  select attempts, reserved, last_attempt_at into v_attempts, v_reserved, v_last_attempt_at
  from public.essay_usage_limits
  where user_id = v_user_id and usage_date = current_date
  for update;

  -- Release abandoned reservations after five minutes.
  update public.essay_attempt_reservations
  set status = 'released', finalized_at = now()
  where user_id = v_user_id and usage_date = current_date and status = 'reserved'
    and reserved_at < now() - interval '5 minutes';
  get diagnostics v_stale_count = row_count;
  if v_stale_count > 0 then
    update public.essay_usage_limits
    set reserved = greatest(0, reserved - v_stale_count)
    where user_id = v_user_id and usage_date = current_date;
    select attempts, reserved, last_attempt_at into v_attempts, v_reserved, v_last_attempt_at
    from public.essay_usage_limits
    where user_id = v_user_id and usage_date = current_date;
  end if;

  select status into v_status from public.essay_attempt_reservations
  where user_id = v_user_id and request_id = p_request_id
  for update;
  if found and v_status = 'reserved' then return 'in_progress'; end if;
  if found and v_status = 'succeeded' then return 'already_succeeded'; end if;

  if v_attempts + v_reserved >= 3 then return 'daily_limit'; end if;
  if v_last_attempt_at is not null and v_last_attempt_at > now() - interval '30 seconds' then
    return 'rate_limited';
  end if;

  if found and v_status = 'released' then
    update public.essay_attempt_reservations
    set status = 'reserved', usage_date = current_date, reserved_at = now(), finalized_at = null,
        lease_token = p_lease_token
    where user_id = v_user_id and request_id = p_request_id;
  else
    insert into public.essay_attempt_reservations (user_id, request_id, lease_token, usage_date, status)
    values (v_user_id, p_request_id, p_lease_token, current_date, 'reserved');
  end if;
  update public.essay_usage_limits
  set reserved = reserved + 1, last_attempt_at = now()
  where user_id = v_user_id and usage_date = current_date;
  return 'reserved';
end;
$$;
revoke all on function public.reserve_promptly_essay_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_promptly_essay_attempt(uuid, uuid) to authenticated;

drop function if exists public.release_promptly_essay_attempt(uuid, uuid);
create function public.release_promptly_essay_attempt(p_user_id uuid, p_request_id uuid, p_lease_token uuid)
returns text language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_usage_date date;
  v_status text;
begin
  select usage_date into v_usage_date from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id;
  if not found then return 'not_found'; end if;
  if p_lease_token is null then return 'stale_lease'; end if;

  perform 1 from public.essay_usage_limits
  where user_id = p_user_id and usage_date = v_usage_date for update;
  select status into v_status from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id for update;
  if not exists (
    select 1 from public.essay_attempt_reservations
    where user_id = p_user_id and request_id = p_request_id and lease_token = p_lease_token
  ) then return 'stale_lease'; end if;
  if v_status = 'succeeded' then return 'already_succeeded'; end if;
  if v_status = 'released' then return 'already_released'; end if;

  update public.essay_attempt_reservations set status = 'released', finalized_at = now()
  where user_id = p_user_id and request_id = p_request_id;
  update public.essay_usage_limits set reserved = greatest(0, reserved - 1)
  where user_id = p_user_id and usage_date = v_usage_date;
  return 'released';
end;
$$;
revoke all on function public.release_promptly_essay_attempt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_promptly_essay_attempt(uuid, uuid, uuid) to service_role;

drop function if exists public.finalize_promptly_essay_attempt(uuid, uuid, text, text, jsonb, integer, jsonb);
create function public.finalize_promptly_essay_attempt(
  p_user_id uuid,
  p_request_id uuid,
  p_lease_token uuid,
  p_challenge_slug text,
  p_answer text,
  p_criteria_scores jsonb,
  p_total_score integer,
  p_feedback jsonb
)
returns uuid language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_usage_date date;
  v_status text;
  v_attempt_id uuid;
  v_score_sum integer;
  v_criteria_key_count integer;
  v_key text;
  v_score integer;
begin
  select usage_date into v_usage_date from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id;
  if not found then raise exception 'Essay reservation not found.' using errcode = 'P0002'; end if;
  if p_lease_token is null then raise exception 'Essay lease token is required.' using errcode = '22023'; end if;

  -- Every quota mutation locks the usage row before its reservation.
  perform 1 from public.essay_usage_limits
  where user_id = p_user_id and usage_date = v_usage_date for update;
  select status into v_status from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id for update;
  if v_status = 'succeeded' then
    select id into v_attempt_id from public.essay_attempts
    where user_id = p_user_id and request_id = p_request_id;
    return v_attempt_id;
  end if;
  if not exists (
    select 1 from public.essay_attempt_reservations
    where user_id = p_user_id and request_id = p_request_id and lease_token = p_lease_token
  ) then raise exception 'Essay reservation lease is stale.' using errcode = '55000'; end if;
  if v_status <> 'reserved' then raise exception 'Essay reservation is not active.' using errcode = '55000'; end if;
  if p_challenge_slug is distinct from 'academic-research-assistant'
     or p_answer is null or length(trim(p_answer)) < 20 or length(trim(p_answer)) > 5000
     or jsonb_typeof(p_criteria_scores) is distinct from 'object'
     or jsonb_typeof(p_feedback) is distinct from 'object'
     or p_total_score is null then
    raise exception 'Essay result payload is invalid.' using errcode = '22023';
  end if;

  select count(*)::integer into v_criteria_key_count
  from jsonb_object_keys(p_criteria_scores);
  if v_criteria_key_count <> 4 then
    raise exception 'Essay result must contain exactly four criteria.' using errcode = '22023';
  end if;

  v_score_sum := 0;
  foreach v_key in array array['clarityInstructions','contextRelevance','outputStructure','accuracyResponsibleAI'] loop
    if jsonb_typeof(p_criteria_scores->v_key) is distinct from 'object'
       or coalesce(p_criteria_scores->v_key->>'score', '') !~ '^[0-9]{1,2}$' then
      raise exception 'Essay criterion score is invalid.' using errcode = '22023';
    end if;
    v_score := (p_criteria_scores->v_key->>'score')::integer;
    if v_score < 0 or v_score > 25 then raise exception 'Essay criterion score is out of range.' using errcode = '22023'; end if;
    v_score_sum := v_score_sum + v_score;
  end loop;
  if v_score_sum <> p_total_score then raise exception 'Essay total does not match criterion scores.' using errcode = '22023'; end if;

  insert into public.essay_attempts (user_id, request_id, challenge_slug, answer, criteria_scores, total_score, feedback)
  values (p_user_id, p_request_id, p_challenge_slug, p_answer, p_criteria_scores, p_total_score, p_feedback)
  returning id into v_attempt_id;

  update public.essay_usage_limits
  set reserved = reserved - 1, attempts = attempts + 1
  where user_id = p_user_id and usage_date = v_usage_date and reserved > 0 and attempts < 3;
  if not found then raise exception 'Essay quota reservation could not be finalized.' using errcode = '55000'; end if;
  update public.essay_attempt_reservations set status = 'succeeded', finalized_at = now()
  where user_id = p_user_id and request_id = p_request_id;
  return v_attempt_id;
end;
$$;
revoke all on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) to service_role;
