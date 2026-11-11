-- Promptly Pro essay challenges. Additive migration; existing quiz and account data remain untouched.
create table if not exists public.essay_challenges (
  slug text primary key,
  topic text not null check (topic in (
    'Prompting', 'Critical Thinking', 'Fact Checking', 'AI Knowledge',
    'Practical Application', 'Responsible AI', 'AI for Research'
  )),
  title text not null check (length(trim(title)) between 1 and 120),
  instructions text not null check (length(trim(instructions)) between 1 and 2000),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.essay_challenges (slug, topic, title, instructions, published)
values (
  'academic-research-assistant',
  'Prompting',
  'Academic Research Assistant',
  'Write an effective prompt that instructs an AI assistant to summarize a research paper, identify its key findings, and explain its limitations. The AI must not invent citations or unsupported claims.',
  true
)
on conflict (slug) do nothing;

create table if not exists public.essay_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_slug text not null references public.essay_challenges(slug),
  answer text not null check (length(trim(answer)) between 20 and 5000),
  criteria_scores jsonb not null check (jsonb_typeof(criteria_scores) = 'object'),
  total_score integer not null check (total_score between 0 and 100),
  feedback jsonb not null check (jsonb_typeof(feedback) = 'object'),
  submitted_at timestamptz not null default now()
);
create index if not exists essay_attempts_user_submitted_at
  on public.essay_attempts (user_id, submitted_at desc);

create table if not exists public.essay_usage_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  attempts integer not null default 0 check (attempts between 0 and 3),
  last_attempt_at timestamptz,
  primary key (user_id, usage_date)
);

create or replace function public.is_promptly_pro()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid()
      and s.status in ('active', 'trialing')
      and s.current_period_end > now()
  );
$$;
revoke all on function public.is_promptly_pro() from public, anon;
grant execute on function public.is_promptly_pro() to authenticated;

create or replace function public.consume_promptly_essay_attempt()
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempts integer;
  v_last_attempt_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not public.is_promptly_admin() and not public.is_promptly_pro() then
    raise exception 'Promptly Pro access required.' using errcode = '42501';
  end if;

  insert into public.essay_usage_limits (user_id, usage_date, attempts, last_attempt_at)
  values (v_user_id, current_date, 1, now())
  on conflict (user_id, usage_date) do update set
    attempts = public.essay_usage_limits.attempts + 1,
    last_attempt_at = now()
  where public.essay_usage_limits.attempts < 3
    and (public.essay_usage_limits.last_attempt_at is null
      or public.essay_usage_limits.last_attempt_at <= now() - interval '30 seconds')
  returning attempts into v_attempts;

  if v_attempts is not null then return 'allowed'; end if;
  select attempts, last_attempt_at into v_attempts, v_last_attempt_at
  from public.essay_usage_limits
  where user_id = v_user_id and usage_date = current_date;
  if v_attempts >= 3 then return 'daily_limit'; end if;
  return 'rate_limited';
end;
$$;
revoke all on function public.consume_promptly_essay_attempt() from public, anon;
grant execute on function public.consume_promptly_essay_attempt() to authenticated;

alter table public.essay_challenges enable row level security;
alter table public.essay_attempts enable row level security;
alter table public.essay_usage_limits enable row level security;
drop policy if exists "Pro users read published essay challenges" on public.essay_challenges;
create policy "Pro users read published essay challenges" on public.essay_challenges
  for select to authenticated
  using (published and (public.is_promptly_admin() or public.is_promptly_pro()));
drop policy if exists "Users read own essay attempts" on public.essay_attempts;
create policy "Users read own essay attempts" on public.essay_attempts
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.essay_challenges, public.essay_attempts, public.essay_usage_limits from public, anon, authenticated;
grant select on public.essay_challenges, public.essay_attempts to authenticated;
grant all on public.essay_challenges, public.essay_attempts, public.essay_usage_limits to service_role;
