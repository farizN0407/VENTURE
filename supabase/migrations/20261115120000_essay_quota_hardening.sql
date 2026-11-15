-- Harden essay quota reservations without changing stored attempts or the active RPC signatures.
-- Apply after 20261115_essay_quota_reservations.sql.

-- Both helpers use schema-qualified objects; keep public objects out of their definer search path.
alter function public.is_promptly_admin() set search_path = pg_catalog;
alter function public.is_promptly_pro() set search_path = pg_catalog;

create or replace function public.reserve_promptly_essay_attempt(p_request_id uuid, p_lease_token uuid)
returns text language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempts integer;
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

  -- Match the canonical admin check; user-editable profile fields cannot grant admin access.
  if not public.is_promptly_admin() and not public.is_promptly_pro() then
    raise exception 'Promptly Pro access required.' using errcode = '42501';
  end if;

  -- Serialize a user's reservations across dates as well as across concurrent request IDs.
  -- This keeps both idempotency and the 30-second cost throttle correct at midnight.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  insert into public.essay_usage_limits (user_id, usage_date, attempts, reserved, last_attempt_at)
  values (v_user_id, current_date, 0, 0, null)
  on conflict (user_id, usage_date) do nothing;
  perform 1 from public.essay_usage_limits
  where user_id = v_user_id and usage_date = current_date
  for update;

  -- Lock every affected daily counter before updating stale reservation rows.
  -- The date remains attached to each stale row until its exact counter is decremented.
  for v_stale_usage_date in
    select distinct usage_date
    from public.essay_attempt_reservations
    where user_id = v_user_id
      and status = 'reserved'
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
  where user_id = v_user_id
    and status = 'reserved'
    and reserved_at < now() - interval '5 minutes';

  if v_stale_group_count > 0 then
    with expired as (
      update public.essay_attempt_reservations
      set status = 'released', finalized_at = now()
      where user_id = v_user_id
        and status = 'reserved'
        and reserved_at < now() - interval '5 minutes'
      returning usage_date
    ), expired_by_date as (
      select usage_date, count(*)::integer as reservation_count
      from expired
      group by usage_date
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
  select max(last_attempt_at) into v_last_attempt_at
  from public.essay_usage_limits
  where user_id = v_user_id;

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

create or replace function public.release_promptly_essay_attempt(p_user_id uuid, p_request_id uuid, p_lease_token uuid)
returns text language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_usage_date date;
  v_status text;
  v_lease_token uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select usage_date into v_usage_date from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id;
  if not found then return 'not_found'; end if;
  if p_lease_token is null then return 'stale_lease'; end if;

  perform 1 from public.essay_usage_limits
  where user_id = p_user_id and usage_date = v_usage_date for update;
  select status, lease_token into v_status, v_lease_token
  from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id for update;
  if v_lease_token is distinct from p_lease_token then return 'stale_lease'; end if;
  if v_status = 'succeeded' then return 'already_succeeded'; end if;
  if v_status = 'released' then return 'already_released'; end if;

  update public.essay_attempt_reservations set status = 'released', finalized_at = now()
  where user_id = p_user_id and request_id = p_request_id;
  update public.essay_usage_limits
  set reserved = reserved - 1
  where user_id = p_user_id and usage_date = v_usage_date and reserved > 0;
  if not found then raise exception 'Essay quota reservation counter is inconsistent.' using errcode = '55000'; end if;
  return 'released';
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
  select usage_date, reserved_at into v_usage_date, v_reserved_at from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id;
  if not found then raise exception 'Essay reservation not found.' using errcode = 'P0002'; end if;
  if p_lease_token is null then raise exception 'Essay lease token is required.' using errcode = '22023'; end if;

  -- All writers lock the daily quota row before the reservation row.
  perform 1 from public.essay_usage_limits
  where user_id = p_user_id and usage_date = v_usage_date for update;
  select status, lease_token into v_status, v_current_lease_token
  from public.essay_attempt_reservations
  where user_id = p_user_id and request_id = p_request_id for update;

  -- Check fencing before the idempotent-success path; a stale lease cannot retrieve a result.
  if v_current_lease_token is distinct from p_lease_token then
    raise exception 'Essay reservation lease is stale.' using errcode = '55000';
  end if;
  if v_status = 'succeeded' then
    select id into v_attempt_id from public.essay_attempts
    where user_id = p_user_id and request_id = p_request_id;
    return v_attempt_id;
  end if;
  if v_status is distinct from 'reserved' then raise exception 'Essay reservation is not active.' using errcode = '55000'; end if;
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

  -- Quota day is the day the user submitted (reserved_at), even if evaluation finishes after midnight.
  insert into public.essay_attempts (user_id, request_id, challenge_slug, answer, criteria_scores, total_score, feedback, submitted_at)
  values (p_user_id, p_request_id, p_challenge_slug, p_answer, p_criteria_scores, p_total_score, p_feedback, v_reserved_at)
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

-- CREATE OR REPLACE preserves the grants installed by 20261115; reassert least privilege explicitly.
revoke all on function public.reserve_promptly_essay_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_promptly_essay_attempt(uuid, uuid) to authenticated;
revoke all on function public.release_promptly_essay_attempt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_promptly_essay_attempt(uuid, uuid, uuid) to service_role;
revoke all on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) to service_role;
