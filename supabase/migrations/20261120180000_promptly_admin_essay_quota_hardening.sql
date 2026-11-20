-- Harden the separate admin/Pro essay quotas without editing prior migrations.
-- All daily accounting uses UTC day boundaries. Historical attempts remain in essay_attempts.

-- Keep bounded counters representable even when legacy history already exceeds 15.
-- The RPCs below enforce the combined role-specific limit under a per-user lock.
alter table public.essay_usage_limits
  drop constraint if exists essay_usage_limits_admin_daily_limit_check;
alter table public.essay_usage_limits
  add constraint essay_usage_limits_admin_daily_limit_check
  check (attempts between 0 and 15 and reserved between 0 and 15);

-- This server-only helper checks the same protected profile role and subscription facts
-- used by is_promptly_admin() and is_promptly_pro(). Row locks keep them stable while a
-- successful evaluation is finalized. No client may call it with another user's ID.
create or replace function public.promptly_essay_daily_limit_for_user(p_user_id uuid)
returns integer language plpgsql volatile security definer
set search_path = pg_catalog
set timezone = 'UTC'
as $$
declare
  v_role text;
  v_status text;
  v_current_period_end timestamptz;
begin
  if p_user_id is null then return 0; end if;
  select role into v_role from public.profiles where id = p_user_id for share;
  if v_role = 'admin' then return 15; end if;
  select status, current_period_end into v_status, v_current_period_end
  from public.subscriptions where user_id = p_user_id for share;
  if v_status in ('active', 'trialing') and v_current_period_end > clock_timestamp() then return 3; end if;
  return 0;
end;
$$;
revoke all on function public.promptly_essay_daily_limit_for_user(uuid) from public, anon, authenticated;
grant execute on function public.promptly_essay_daily_limit_for_user(uuid) to service_role;

create or replace function public.reserve_promptly_essay_attempt(p_request_id uuid, p_lease_token uuid)
returns text language plpgsql security definer
set search_path = pg_catalog
set timezone = 'UTC'
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_today date;
  v_date_start timestamptz;
  v_date_end timestamptz;
  v_is_admin boolean;
  v_daily_limit integer;
  v_successful_attempts bigint;
  v_reserved bigint;
  v_active_reservations bigint;
  v_last_attempt_at timestamptz;
  v_status text;
  v_stale_usage_date date;
  v_stale_group_count integer;
  v_reconciled_group_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'Request ID required.' using errcode = '22023'; end if;
  if p_lease_token is null then raise exception 'Lease token required.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  -- Choose one UTC accounting date after obtaining the per-user lock, even if lock waiting crosses midnight.
  v_now := clock_timestamp();
  v_today := (v_now at time zone 'UTC')::date;
  v_date_start := v_today::timestamp at time zone 'UTC';
  v_date_end := (v_today + 1)::timestamp at time zone 'UTC';

  -- Use the existing authenticated checks; admin status is never taken from client data.
  v_is_admin := coalesce(public.is_promptly_admin(), false);
  if v_is_admin then
    v_daily_limit := 15;
  elsif coalesce(public.is_promptly_pro(), false) then
    v_daily_limit := 3;
  else
    raise exception 'Promptly Pro access required.' using errcode = '42501';
  end if;

  insert into public.essay_usage_limits (user_id, usage_date, attempts, reserved, last_attempt_at)
  values (v_user_id, v_today, 0, 0, null)
  on conflict (user_id, usage_date) do nothing;
  perform 1 from public.essay_usage_limits
  where user_id = v_user_id and usage_date = v_today for update;

  -- Expire reservations by their original usage_date, with all affected counter rows locked first.
  for v_stale_usage_date in
    select distinct usage_date from public.essay_attempt_reservations
    where user_id = v_user_id and status = 'reserved'
      and reserved_at < v_now - interval '5 minutes'
    order by usage_date
  loop
    if v_stale_usage_date <> v_today then
      perform 1 from public.essay_usage_limits
      where user_id = v_user_id and usage_date = v_stale_usage_date for update;
    end if;
  end loop;
  select count(distinct usage_date)::integer into v_stale_group_count
  from public.essay_attempt_reservations
  where user_id = v_user_id and status = 'reserved'
    and reserved_at < v_now - interval '5 minutes';
  if v_stale_group_count > 0 then
    with expired as (
      update public.essay_attempt_reservations
      set status = 'released', finalized_at = v_now
      where user_id = v_user_id and status = 'reserved'
        and reserved_at < v_now - interval '5 minutes'
      returning usage_date
    ), expired_by_date as (
      select usage_date, count(*)::integer as reservation_count from expired group by usage_date
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

  select count(*) into v_successful_attempts from public.essay_attempts
  where user_id = v_user_id and submitted_at >= v_date_start and submitted_at < v_date_end;
  select count(*) into v_active_reservations from public.essay_attempt_reservations
  where user_id = v_user_id and usage_date = v_today and status = 'reserved';
  -- Physical counters stay within their column bounds; uncapped authoritative counts gate access.
  update public.essay_usage_limits
  set attempts = least(15::bigint, v_successful_attempts)::integer,
      reserved = least(15::bigint, v_active_reservations)::integer
  where user_id = v_user_id and usage_date = v_today;
  v_reserved := v_active_reservations;
  select max(last_attempt_at) into v_last_attempt_at
  from public.essay_usage_limits where user_id = v_user_id;

  select status into v_status from public.essay_attempt_reservations
  where user_id = v_user_id and request_id = p_request_id for update;
  if found and v_status = 'reserved' then return 'in_progress'; end if;
  if found and v_status = 'succeeded' then return 'already_succeeded'; end if;
  if v_successful_attempts + v_reserved >= v_daily_limit then return 'daily_limit'; end if;
  if v_last_attempt_at is not null and v_last_attempt_at > v_now - interval '30 seconds' then return 'rate_limited'; end if;

  if found and v_status = 'released' then
    update public.essay_attempt_reservations
    set status = 'reserved', usage_date = v_today, reserved_at = v_now, finalized_at = null,
        lease_token = p_lease_token
    where user_id = v_user_id and request_id = p_request_id;
  else
    insert into public.essay_attempt_reservations (user_id, request_id, lease_token, usage_date, status, reserved_at)
    values (v_user_id, p_request_id, p_lease_token, v_today, 'reserved', v_now);
  end if;
  update public.essay_usage_limits
  set reserved = reserved + 1, last_attempt_at = v_now
  where user_id = v_user_id and usage_date = v_today;
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
set timezone = 'UTC'
as $$
declare
  v_now timestamptz;
  v_usage_date date;
  v_date_start timestamptz;
  v_date_end timestamptz;
  v_reserved_at timestamptz;
  v_status text;
  v_current_lease_token uuid;
  v_attempt_id uuid;
  v_daily_limit integer;
  v_successful_attempts bigint;
  v_score_sum integer;
  v_criteria_key_count integer;
  v_key text;
  v_score integer;
begin
  if p_user_id is null or p_request_id is null then raise exception 'Essay reservation identity is required.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  v_now := clock_timestamp();
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
  -- Keep lease fencing before the idempotent-success path.
  if v_current_lease_token is distinct from p_lease_token then raise exception 'Essay reservation lease is stale.' using errcode = '55000'; end if;
  if v_status = 'succeeded' then
    select id into v_attempt_id from public.essay_attempts
    where user_id = p_user_id and request_id = p_request_id;
    return v_attempt_id;
  end if;
  if v_status is distinct from 'reserved' then raise exception 'Essay reservation is not active.' using errcode = '55000'; end if;

  -- Re-check current role and subscription while locking those rows through commit.
  v_daily_limit := public.promptly_essay_daily_limit_for_user(p_user_id);
  if v_daily_limit = 0 then raise exception 'Essay access changed before finalization.' using errcode = '42501'; end if;
  v_date_start := v_usage_date::timestamp at time zone 'UTC';
  v_date_end := (v_usage_date + 1)::timestamp at time zone 'UTC';
  select count(*) into v_successful_attempts from public.essay_attempts
  where user_id = p_user_id and submitted_at >= v_date_start and submitted_at < v_date_end;
  if v_successful_attempts >= v_daily_limit then
    raise exception 'Essay daily limit changed before finalization.' using errcode = 'P0001';
  end if;
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
  set reserved = reserved - 1, attempts = least(15::bigint, v_successful_attempts + 1)::integer
  where user_id = p_user_id and usage_date = v_usage_date and reserved > 0;
  if not found then raise exception 'Essay quota reservation could not be finalized.' using errcode = '55000'; end if;
  update public.essay_attempt_reservations set status = 'succeeded', finalized_at = v_now
  where user_id = p_user_id and request_id = p_request_id;
  return v_attempt_id;
end;
$$;

create or replace function public.get_promptly_essay_quota()
returns table (successful_attempts integer, reserved_attempts integer, daily_limit integer)
language plpgsql stable security definer
set search_path = pg_catalog
set timezone = 'UTC'
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_today date;
  v_date_start timestamptz;
  v_date_end timestamptz;
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
  v_today := (v_now at time zone 'UTC')::date;
  v_date_start := v_today::timestamp at time zone 'UTC';
  v_date_end := (v_today + 1)::timestamp at time zone 'UTC';
  return query
  select
    (select count(*)::integer from public.essay_attempts a
     where a.user_id = v_user_id and a.submitted_at >= v_date_start and a.submitted_at < v_date_end),
    (select count(*)::integer from public.essay_attempt_reservations r
     where r.user_id = v_user_id and r.usage_date = v_today and r.status = 'reserved'
       and r.reserved_at >= v_now - interval '5 minutes'),
    v_daily_limit;
end;
$$;

revoke all on function public.reserve_promptly_essay_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_promptly_essay_attempt(uuid, uuid) to authenticated;
revoke all on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) to service_role;
revoke all on function public.get_promptly_essay_quota() from public, anon, authenticated;
grant execute on function public.get_promptly_essay_quota() to authenticated;
