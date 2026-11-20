-- Add two Pro essay challenges and extend the existing server-only finalization RPC.
-- Additive migration: keeps all existing attempts, quota counters, and reservation leases.

insert into public.essay_challenges (slug, topic, title, instructions, published)
values
  (
    'data-analysis-assistant',
    'AI for Research',
    'Data Analysis Assistant',
    'Write a prompt instructing AI to analyze a provided dataset, identify trends, anomalies, and key insights, explain limitations, and present findings clearly without inventing data.',
    true
  ),
  (
    'professional-writing',
    'Practical Application',
    'Professional Writing',
    'Write a prompt instructing AI to draft a professional email or report for a specified audience and purpose, with appropriate tone, clear structure, and no fabricated facts.',
    true
  )
on conflict (slug) do update
set topic = excluded.topic,
    title = excluded.title,
    instructions = excluded.instructions,
    published = true;

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

  -- Lock order and lease fencing match the deployed quota hardening RPC.
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
     or not exists (
       select 1 from public.essay_challenges
       where slug = p_challenge_slug and published = true
     )
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

  -- The request's quota day remains the reservation day, including evaluations across midnight.
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

-- CREATE OR REPLACE retains ACLs; explicitly restate least privilege for production clarity.
revoke all on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_promptly_essay_attempt(uuid, uuid, uuid, text, text, jsonb, integer, jsonb) to service_role;
