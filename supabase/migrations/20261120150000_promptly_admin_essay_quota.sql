-- Give canonical Promptly admins 15 successful essay evaluations per day.
-- Existing essay attempts and usage rows are retained; successful rows remain the source of truth.

alter table public.essay_usage_limits
  drop constraint if exists essay_usage_limits_attempts_check,
  drop constraint if exists essay_usage_limits_attempts_reserved_check,
  drop constraint if exists essay_usage_limits_admin_daily_limit_check;

alter table public.essay_usage_limits
  add constraint essay_usage_limits_admin_daily_limit_check
  check (attempts between 0 and 15 and reserved between 0 and 15 and attempts + reserved <= 15);

create or replace function public.reserve_promptly_essay_attempt(p_request_id uuid, p_lease_token uuid)
returns text language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_daily_limit integer;
  v_attempts integer;
  v_successful_attempts integer;
  v_reserved integer;
  v_last_attempt_at timestamptz;
  v_status text;
  v_stale_usage_date date;
  v_stale_group_count integer;
  v_reconciled_group_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'Request ID required.' using errcode = '22023'; end if;
  if p_lease_token is null then raise exception 'Lease token required.' using errcode = '22023'; end if;

  -- Admin status comes from the protected canonical RPC, never from editable profile/request data.
  v_is_admin := coalesce(public.is_promptly_admin(), false);
  if v_is_admin then
    v_daily_limit := 15;
  elsif coalesce(public.is_promptly_pro(), false) then
    v_daily_limit := 3;
  else
    raise exception 'Promptly Pro access required.' using errcode = '42501';
  end if;

  -- Serialize reservations for this user across challenge slugs, request IDs, and midnight.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  insert into public.essay_usage_limits (user_id, usage_date, attempts, reserved, last_attempt_at)
  values (v_user_id, current_date, 0, 0, null)
  on conflict (user_id, usage_date) do nothing;
  perform 1 from public.essay_usage_limits
  where user_id = v_user_id and usage_date = current_date
  for update;

  -- Reconcile reservations from every day before releasing them, retaining each original counter date.
  for v_stale_usage_date in
    select distinct usage_date
    from public.essay_attempt_reservations
    where user_id = v_user_id and status = 'reserved'
      and reserved_at < now() - interval '5 minutes'
    order by usage_date
  loop
    if v_stale_usage_date <> current_date then
      perform 1 from public.essay_usage_limits
      where user_id = v_user_id and usage_date = v_stale_usage_date
      for update;
    end if;
  end loop;

  select count(distinct usage_date)::integer into v_stale_group_count
  from public.essay_attempt_reservations
  where user_id = v_user_id and status = 'reserved'
    and reserved_at < now() - interval '5 minutes';
  if v_stale_group_count > 0 then
    with expired as (
      update public.essay_attempt_reservations
      set status = 'released', finalized_at = now()
      where user_id = v_user_id and status = 'reserved'
        and reserved_at < now() - interval '5 minutes'
      returning usage_date
    ), expired_by_date as (
      select usage_date, count(*)::integer as reservation_count
      from expired group by usage_date
    )
    update public.essay_usage_limits limits
    set reserved = limits.reserved - expired_by_date.reservation_count
    from expired_by_date
    where limits.user_id = v_user_id
      and limits.usage_date = expired_by_date.usage_date
      and limits.reserved >= expired_by_date.reservation_count;
    get diagnostics v_reconciled_group_count = row_count;
    if v_reconciled_group_count <> v_stale_group_count then
      raise exception 'Essay quota reservation counters are inconsistent.' using errcode = '55000';
    end if;
  end if;

  select attempts, reserved into v_attempts, v_reserved
  from public.essay_usage_limits
  where user_id = v_user_id and usage_date = current_date;
  -- Preserve and count successful evaluations already in history before granting new admin capacity.
  select count(*)::integer into v_successful_attempts
  from public.essay_attempts
  where user_id = v_user_id and submitted_at::date = current_date;
  if v_attempts is distinct from v_successful_attempts then
    update public.essay_usage_limits
    set attempts = v_successful_attempts
    where user_id = v_user_id and usage_date = current_date;
    v_attempts := v_successful_attempts;
  end if;
  select max(last_attempt_at) into v_last_attempt_at
  from public.essay_usage_limits where user_id = v_user_id;

  select status into v_status from public.essay_attempt_reservations
  where user_id = v_user_id and request_id = p_request_id for update;
  if found and v_status = 'reserved' then return 'in_progress'; end if;
  if found and v_status = 'succeeded' then return 'already_succeeded'; end if;
  if v_attempts + v_reserved >= v_daily_limit then return 'daily_limit'; end if;
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

create or replace function public.finalize_promptly_essay_attempt(
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
  v_reserved_at timestamptz;
  v_status text;
  v_current_lease_token uuid;
  v_attempt_id uuid;
  v_score_sum integer;
  v_criteria_key_count integer;
  v_key text;
  v_score integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select usage_date, reserved_at into v_usage_date, v_reserved_at
  from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id;
  if not found then raise exception 'Essay reservation not found.' using errcode = 'P0002'; end if;
  if p_lease_token is null then raise exception 'Essay lease token is required.' using errcode = '22023'; end if;

  perform 1 from public.essay_usage_limits
  where user_id = p_user_id and usage_date = v_usage_date for update;
  select status, lease_token into v_status, v_current_lease_token
  from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id for update;
  if v_current_lease_token is distinct from p_lease_token then
    raise exception 'Essay reservation lease is stale.' using errcode = '55000';
  end if;
  if v_status = 'succeeded' then
    select id into v_attempt_id from public.essay_attempts
    where user_id = p_user_id and request_id = p_request_id;
    return v_attempt_id;
  end if;
  if v_status is distinct from 'reserved' then raise exception 'Essay reservation is not active.' using errcode = '55000'; end if;
  if p_challenge_slug is null
     or p_challenge_slug not in ('academic-research-assistant', 'data-analysis-assistant', 'professional-writing')
     or not exists (select 1 from public.essay_challenges where slug = p_challenge_slug and published = true)
     or p_answer is null or length(trim(p_answer)) < 20 or length(trim(p_answer)) > 5000
     or jsonb_typeof(p_criteria_scores) is distinct from 'object'
     or jsonb_typeof(p_feedback) is distinct from 'object'
     or p_total_score is null then
    raise exception 'Essay result payload is invalid.' using errcode = '22023';
  end if;

  select count(*)::integer into v_criteria_key_count from jsonb_object_keys(p_criteria_scores);
  if v_criteria_key_count <> 4 then raise exception 'Essay result must contain exactly four criteria.' using errcode = '22023'; end if;
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

  insert into public.essay_attempts (user_id, request_id, challenge_slug, answer, criteria_scores, total_score, feedback, submitted_at)
  values (p_user_id, p_request_id, p_challenge_slug, p_answer, p_criteria_scores, p_total_score, p_feedback, v_reserved_at)
  returning id into v_attempt_id;
  update public.essay_usage_limits
  set reserved = reserved - 1, attempts = attempts + 1
  where user_id = p_user_id and usage_date = v_usage_date and reserved > 0 and attempts < 15;
  if not found then raise exception 'Essay quota reservation could not be finalized.' using errcode = '55000'; end if;
  update public.essay_attempt_reservations set status = 'succeeded', finalized_at = now()
  where user_id = p_user_id and request_id = p_request_id;
  return v_attempt_id;
end;
$$;

-- Authenticated users may inspect only their own server-derived quota. The caller cannot select a user ID.
create or replace function public.get_promptly_essay_quota()
returns table (successful_attempts integer, reserved_attempts integer, daily_limit integer)
language plpgsql stable security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_daily_limit integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if coalesce(public.is_promptly_admin(), false) then
    v_daily_limit := 15;
  elsif coalesce(public.is_promptly_pro(), false) then
    v_daily_limit := 3;
  else
    raise exception 'Promptly Pro access required.' using errcode = '42501';
  end if;
  return query
  select
    (select count(*)::integer from public.essay_attempts a
     where a.user_id = v_user_id and a.submitted_at::date = current_date),
    (select count(*)::integer from public.essay_attempt_reservations r
     where r.user_id = v_user_id and r.usage_date = current_date and r.status = 'reserved'
       and r.reserved_at >= now() - interval '5 minutes'),
    v_daily_limit;
end;
$$;

revoke all on function public.reserve_promptly_essay_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_promptly_essay_attempt(uuid, uuid) to authenticated;
revoke all on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) to service_role;
revoke all on function public.get_promptly_essay_quota() from public, anon, authenticated;
grant execute on function public.get_promptly_essay_quota() to authenticated;
