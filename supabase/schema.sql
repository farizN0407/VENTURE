-- Promptly schema. Apply with the Supabase SQL editor as the project owner.
-- Public registration creates regular users only. Provision the single admin
-- with public.provision_designated_admin(user_uuid) from the SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists role text not null default 'user';
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;
create unique index if not exists profiles_only_one_admin on public.profiles (role) where role = 'admin';
insert into public.profiles (id,role)
select id,'user' from auth.users on conflict (id) do nothing;

create table if not exists public.quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_slug text not null,
  topic_slug text,
  content_domain text not null default 'unclassified' check (content_domain in ('unclassified','ai_literacy','cybersecurity')),
  attempt_id uuid,
  score integer not null check (score between 0 and 100),
  correct_answers integer not null check (correct_answers between 0 and total_questions),
  total_questions integer not null check (total_questions > 0),
  skill_results jsonb not null default '[]'::jsonb,
  answer_details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.quiz_attempts add column if not exists skill_results jsonb not null default '[]'::jsonb;
alter table public.quiz_attempts add column if not exists answer_details jsonb not null default '[]'::jsonb;
alter table public.quiz_attempts add column if not exists topic_slug text;
alter table public.quiz_attempts add column if not exists content_domain text not null default 'unclassified';
alter table public.quiz_attempts add column if not exists attempt_id uuid;
create index if not exists quiz_attempts_user_created_at on public.quiz_attempts (user_id,created_at desc);
create index if not exists quiz_attempts_user_domain_created_at on public.quiz_attempts (user_id,content_domain,created_at desc);
create unique index if not exists quiz_attempts_user_attempt_id on public.quiz_attempts (user_id,attempt_id) where attempt_id is not null;

create table if not exists public.module_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_slug text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, module_slug)
);
create index if not exists module_completions_user_completed_at on public.module_completions (user_id,completed_at desc);

create table if not exists public.learning_modules (
  slug text primary key check (slug ~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 1 and 120),
  summary text not null check (length(trim(summary)) between 1 and 500),
  principle text not null check (length(trim(principle)) between 1 and 5000),
  example text not null check (length(trim(example)) between 1 and 5000),
  practice text not null check (length(trim(practice)) between 1 and 5000),
  content_domain text not null default 'unclassified' check (content_domain in ('unclassified','ai_literacy','cybersecurity')),
  challenge_slug text,
  next_slug text,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.challenges (
  slug text primary key check (slug ~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 80),
  description text not null check (length(trim(description)) between 1 and 500),
  learning_objective text not null default '' check (length(learning_objective) <= 1000),
  difficulty text not null check (difficulty in ('Pemula', 'Menengah', 'Lanjutan')),
  content_domain text not null default 'unclassified' check (content_domain in ('unclassified','ai_literacy','cybersecurity')),
  module_slug text references public.learning_modules(slug) on delete set null,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.challenges add column if not exists learning_objective text not null default '';
alter table public.learning_modules add column if not exists content_domain text not null default 'unclassified';
alter table public.challenges add column if not exists content_domain text not null default 'unclassified';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='quiz_attempts_content_domain_check' and conrelid='public.quiz_attempts'::regclass) then
    alter table public.quiz_attempts add constraint quiz_attempts_content_domain_check check (content_domain in ('unclassified','ai_literacy','cybersecurity'));
  end if;
  if not exists (select 1 from pg_constraint where conname='learning_modules_content_domain_check' and conrelid='public.learning_modules'::regclass) then
    alter table public.learning_modules add constraint learning_modules_content_domain_check check (content_domain in ('unclassified','ai_literacy','cybersecurity'));
  end if;
  if not exists (select 1 from pg_constraint where conname='challenges_content_domain_check' and conrelid='public.challenges'::regclass) then
    alter table public.challenges add constraint challenges_content_domain_check check (content_domain in ('unclassified','ai_literacy','cybersecurity'));
  end if;
end $$;

create table if not exists public.challenge_questions (
  id uuid primary key default gen_random_uuid(),
  challenge_slug text not null references public.challenges(slug) on delete cascade,
  position integer not null check (position between 1 and 50),
  prompt text not null check (length(trim(prompt)) between 1 and 2000),
  skill text not null check (length(trim(skill)) between 1 and 80),
  unique (challenge_slug, position)
);

create table if not exists public.challenge_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.challenge_questions(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  body text not null check (length(trim(body)) between 1 and 1000),
  unique (question_id, position),
  unique (id, question_id)
);

-- Correct options and explanations are kept out of public question/option tables.
create table if not exists public.quiz_answer_keys (
  question_id uuid primary key references public.challenge_questions(id) on delete cascade,
  correct_option_id uuid not null,
  explanation text not null check (length(trim(explanation)) between 1 and 3000),
  foreign key (correct_option_id, question_id) references public.challenge_options(id, question_id) on delete cascade
);

create table if not exists public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  last_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions add column if not exists last_event_created bigint not null default 0;

create or replace function public.is_promptly_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_promptly_admin() from public;
grant execute on function public.is_promptly_admin() to anon, authenticated;

create or replace function public.handle_new_promptly_user()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  -- Ignore auth metadata supplied by a registrant; all signups receive user.
  insert into public.profiles (id, role) values (new.id, 'user') on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_promptly on auth.users;
create trigger on_auth_user_created_promptly after insert on auth.users
for each row execute function public.handle_new_promptly_user();

create or replace function public.provision_designated_admin(p_user_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.profiles where role = 'admin' and id <> p_user_id) then
    raise exception 'A designated Promptly admin already exists.';
  end if;
  update public.profiles set role = 'admin' where id = p_user_id;
  if not found then raise exception 'Create the account first, then use its auth.users UUID.'; end if;
end;
$$;
revoke all on function public.provision_designated_admin(uuid) from public, anon, authenticated, service_role;

create or replace function public.sync_stripe_subscription_event(p_user_id uuid,p_customer_id text,p_subscription_id text,p_status text,p_period_end timestamptz,p_event_created bigint)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused') then raise exception 'Invalid Stripe subscription status.'; end if;
  insert into public.subscriptions (user_id,stripe_customer_id,stripe_subscription_id,status,current_period_end,last_event_created,updated_at)
  values (p_user_id,p_customer_id,p_subscription_id,p_status,p_period_end,p_event_created,now())
  on conflict (user_id) do update set stripe_customer_id=excluded.stripe_customer_id,
    stripe_subscription_id=excluded.stripe_subscription_id,status=excluded.status,
    current_period_end=excluded.current_period_end,last_event_created=excluded.last_event_created,updated_at=now()
    where public.subscriptions.last_event_created < excluded.last_event_created;
end;
$$;
revoke all on function public.sync_stripe_subscription_event(uuid,text,text,text,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.sync_stripe_subscription_event(uuid,text,text,text,timestamptz,bigint) to service_role;

create or replace function public.admin_save_challenge(p_payload jsonb)
returns void language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  v_slug text := p_payload->>'slug';
  v_content_domain text := p_payload->>'content_domain';
  v_question jsonb;
  v_option jsonb;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_id uuid;
  v_question_position bigint;
  v_option_position bigint;
  v_correct_index integer;
begin
  if not public.is_promptly_admin() then raise exception 'Admin access required.'; end if;
  if v_content_domain is null or v_content_domain not in ('ai_literacy','cybersecurity') then raise exception 'A valid content domain is required.'; end if;
  if nullif(p_payload->>'module_slug','') is not null and not exists (select 1 from public.learning_modules m where m.slug=p_payload->>'module_slug' and m.content_domain=v_content_domain) then raise exception 'Related module must exist in the same content domain.'; end if;
  if v_slug is null or v_slug !~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Custom challenge slugs must start with custom-.'; end if;
  if jsonb_typeof(p_payload->'questions') is distinct from 'array' then raise exception 'Questions must be an array.'; end if;
  if jsonb_array_length(p_payload->'questions') not between 1 and 50 then raise exception 'Add between 1 and 50 questions.'; end if;
  insert into public.challenges (slug,title,category,description,learning_objective,difficulty,content_domain,module_slug,published,created_by,updated_at)
  values (v_slug,trim(p_payload->>'title'),trim(p_payload->>'category'),trim(p_payload->>'description'),trim(p_payload->>'learning_objective'),p_payload->>'difficulty',v_content_domain,nullif(p_payload->>'module_slug',''),coalesce((p_payload->>'published')::boolean,false),auth.uid(),now())
  on conflict (slug) do update set title=excluded.title, category=excluded.category, description=excluded.description,learning_objective=excluded.learning_objective,
    difficulty=excluded.difficulty, content_domain=excluded.content_domain, module_slug=excluded.module_slug, published=excluded.published, updated_at=now();
  delete from public.challenge_questions where challenge_slug=v_slug;
  for v_question, v_question_position in select value,ordinality from jsonb_array_elements(p_payload->'questions') with ordinality loop
    if jsonb_typeof(v_question->'options') is distinct from 'array' then raise exception 'Question options must be an array.'; end if;
    if jsonb_array_length(v_question->'options') not between 2 and 10 then raise exception 'Each question needs 2 to 10 options.'; end if;
    v_correct_index := (v_question->>'correctIndex')::integer;
    if v_correct_index < 0 or v_correct_index >= jsonb_array_length(v_question->'options') then raise exception 'A correct option index is invalid.'; end if;
    insert into public.challenge_questions (challenge_slug,position,prompt,skill)
    values (v_slug,v_question_position,trim(v_question->>'prompt'),trim(v_question->>'skill')) returning id into v_question_id;
    v_correct_id := null;
    for v_option, v_option_position in select value,ordinality from jsonb_array_elements(v_question->'options') with ordinality loop
      insert into public.challenge_options (question_id,position,body)
      values (v_question_id,v_option_position,trim(v_option#>>'{}')) returning id into v_option_id;
      if v_option_position - 1 = v_correct_index then v_correct_id := v_option_id; end if;
    end loop;
    insert into public.quiz_answer_keys (question_id,correct_option_id,explanation)
    values (v_question_id,v_correct_id,trim(v_question->>'explanation'));
  end loop;
end;
$$;
revoke all on function public.admin_save_challenge(jsonb) from public,anon;
grant execute on function public.admin_save_challenge(jsonb) to authenticated;

create or replace function public.grade_quiz_question(p_challenge_slug text,p_position integer,p_option_position integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  select jsonb_build_object('is_correct',(correct.position=selected.position),'explanation',ak.explanation)
  into v_result
  from public.challenges c
  join public.challenge_questions q on q.challenge_slug=c.slug and q.position=p_position
  join public.quiz_answer_keys ak on ak.question_id=q.id
  join public.challenge_options correct on correct.id=ak.correct_option_id
  join public.challenge_options selected on selected.question_id=q.id and selected.position=p_option_position+1
  where c.slug=p_challenge_slug and (c.published or public.is_promptly_admin());
  if v_result is null then raise exception 'Question is unavailable.'; end if;
  return v_result;
end;
$$;
-- Per-question grading exposes answer keys through repeated option probing.
-- Keep the legacy RPC unavailable; results are only returned by full submission.
revoke all on function public.grade_quiz_question(text,integer,integer) from public,anon,authenticated,service_role;

drop function if exists public.submit_quiz_attempt(text,jsonb);
create or replace function public.submit_quiz_attempt(p_challenge_slug text,p_answers jsonb,p_attempt_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total integer;
  v_correct integer := 0;
  v_position integer := 0;
  v_selected integer;
  v_selected_answer text;
  v_row record;
  v_details jsonb := '[]'::jsonb;
  v_skills jsonb;
  v_score integer;
  v_saved boolean := false;
  v_existing record;
  v_content_domain text;
begin
  if p_answers is null or jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Answers must be an array.'; end if;
  if p_attempt_id is null then raise exception 'Attempt id is required.'; end if;
  select c.content_domain into v_content_domain from public.challenges c
  where c.slug=p_challenge_slug and ((c.published and c.content_domain='ai_literacy') or public.is_promptly_admin());
  if v_content_domain is null then raise exception 'Quiz is unavailable.'; end if;
  select count(*) into v_total from public.challenge_questions q join public.challenges c on c.slug=q.challenge_slug
  where c.slug=p_challenge_slug and ((c.published and c.content_domain='ai_literacy') or public.is_promptly_admin());
  if v_total < 1 or jsonb_array_length(p_answers) <> v_total then raise exception 'Quiz answer count is invalid.'; end if;
  for v_row in
    select q.id,q.position,q.prompt,q.skill,o.position as correct_position,o.body as correct_answer,ak.explanation,
      (select count(*) from public.challenge_options options where options.question_id=q.id) as option_count
    from public.challenge_questions q join public.challenges c on c.slug=q.challenge_slug
    join public.quiz_answer_keys ak on ak.question_id=q.id
    join public.challenge_options o on o.id=ak.correct_option_id
    where c.slug=p_challenge_slug and ((c.published and c.content_domain='ai_literacy') or public.is_promptly_admin()) order by q.position
  loop
    v_position := v_position+1;
    if jsonb_typeof(p_answers->(v_position-1)) is distinct from 'number' then raise exception 'An answer is invalid.'; end if;
    if (p_answers->>(v_position-1))::numeric <> trunc((p_answers->>(v_position-1))::numeric) then raise exception 'An answer position must be a whole number.'; end if;
    v_selected := (p_answers->>(v_position-1))::integer+1;
    if v_selected < 1 or v_selected > v_row.option_count then raise exception 'An answer option is invalid.'; end if;
    select body into v_selected_answer from public.challenge_options where question_id=v_row.id and position=v_selected;
    if v_selected=v_row.correct_position then v_correct:=v_correct+1; end if;
    v_details := v_details || jsonb_build_array(jsonb_build_object('question',v_position,'prompt',v_row.prompt,'skill',v_row.skill,
      'is_correct',(v_selected=v_row.correct_position),'selected_answer',v_selected_answer,'correct_answer',v_row.correct_answer,'explanation',v_row.explanation));
  end loop;
  v_score := round(v_correct*100.0/v_total);
  select coalesce(jsonb_agg(jsonb_build_object('skill',skill,'correct',correct,'total',total,'score',round(correct*100.0/total)) order by skill),'[]'::jsonb)
  into v_skills from (select x->>'skill' as skill,count(*) filter (where (x->>'is_correct')::boolean) as correct,count(*) as total from jsonb_array_elements(v_details) x group by x->>'skill') s;
  if v_user_id is not null then
    insert into public.quiz_attempts (user_id,challenge_slug,content_domain,attempt_id,score,correct_answers,total_questions,skill_results,answer_details)
    values (v_user_id,p_challenge_slug,v_content_domain,p_attempt_id,v_score,v_correct,v_total,v_skills,v_details)
    on conflict (user_id,attempt_id) where attempt_id is not null do nothing;
    if found then
      v_saved:=true;
    else
      select score,correct_answers,total_questions,skill_results,answer_details into v_existing
      from public.quiz_attempts where user_id=v_user_id and attempt_id=p_attempt_id;
      if found then
        v_score:=v_existing.score; v_correct:=v_existing.correct_answers; v_total:=v_existing.total_questions;
        v_skills:=v_existing.skill_results; v_details:=v_existing.answer_details; v_saved:=true;
      end if;
    end if;
  end if;
  return jsonb_build_object('score',v_score,'correct_answers',v_correct,'total_questions',v_total,'skill_results',v_skills,'review',v_details,'saved',v_saved);
end;
$$;
revoke all on function public.submit_quiz_attempt(text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_quiz_attempt(text,jsonb,uuid) to anon,authenticated;

alter table public.profiles enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.module_completions enable row level security;
alter table public.learning_modules enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_questions enable row level security;
alter table public.challenge_options enable row level security;
alter table public.quiz_answer_keys enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update own display name" on public.profiles;
drop policy if exists "Users can read own attempts" on public.quiz_attempts;
drop policy if exists "Users can insert own attempts" on public.quiz_attempts;
drop policy if exists "Users can read own subscription" on public.subscriptions;
drop policy if exists "Users can read own completions" on public.module_completions;
drop policy if exists "Users can read public or admin modules" on public.learning_modules;
drop policy if exists "Admins manage modules" on public.learning_modules;
drop policy if exists "Users can read public or admin challenges" on public.challenges;
drop policy if exists "Admins manage challenges" on public.challenges;
drop policy if exists "Users can read questions from published challenges" on public.challenge_questions;
drop policy if exists "Admins manage challenge questions" on public.challenge_questions;
drop policy if exists "Users can read options from published challenges" on public.challenge_options;
drop policy if exists "Admins manage challenge options" on public.challenge_options;
drop policy if exists "Admins manage answer keys" on public.quiz_answer_keys;

create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid()=id or public.is_promptly_admin());
create policy "Users can update own display name" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);
create policy "Admins manage modules" on public.learning_modules for all to authenticated using (public.is_promptly_admin()) with check (public.is_promptly_admin());
create policy "Users can read public or admin modules" on public.learning_modules for select to anon,authenticated using ((published and content_domain='ai_literacy') or public.is_promptly_admin());
create policy "Admins manage challenges" on public.challenges for all to authenticated using (public.is_promptly_admin()) with check (public.is_promptly_admin());
create policy "Users can read public or admin challenges" on public.challenges for select to anon,authenticated using ((published and content_domain='ai_literacy') or public.is_promptly_admin());
create policy "Admins manage challenge questions" on public.challenge_questions for all to authenticated using (public.is_promptly_admin()) with check (public.is_promptly_admin());
create policy "Users can read questions from published challenges" on public.challenge_questions for select to anon,authenticated using (exists (select 1 from public.challenges c where c.slug=challenge_slug and c.published and c.content_domain='ai_literacy') or public.is_promptly_admin());
create policy "Admins manage challenge options" on public.challenge_options for all to authenticated using (public.is_promptly_admin()) with check (public.is_promptly_admin());
create policy "Users can read options from published challenges" on public.challenge_options for select to anon,authenticated using (exists (select 1 from public.challenge_questions q join public.challenges c on c.slug=q.challenge_slug where q.id=question_id and c.published and c.content_domain='ai_literacy') or public.is_promptly_admin());
create policy "Admins manage answer keys" on public.quiz_answer_keys for all to authenticated using (public.is_promptly_admin()) with check (public.is_promptly_admin());
create policy "Users can read own attempts" on public.quiz_attempts for select to authenticated using (auth.uid()=user_id or public.is_promptly_admin());
create policy "Users can read own completions" on public.module_completions for select to authenticated using (auth.uid()=user_id or public.is_promptly_admin());
create policy "Users can read own subscription" on public.subscriptions for select to authenticated using (auth.uid()=user_id or public.is_promptly_admin());

revoke all on public.profiles,public.quiz_attempts,public.module_completions,public.learning_modules,public.challenges,public.challenge_questions,public.challenge_options,public.quiz_answer_keys,public.subscriptions from anon,authenticated;
grant select on public.profiles,public.quiz_attempts,public.module_completions,public.subscriptions to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.learning_modules,public.challenges,public.challenge_questions,public.challenge_options to anon,authenticated;
grant select,insert,update,delete on public.learning_modules,public.challenges,public.challenge_questions,public.challenge_options,public.quiz_answer_keys to authenticated;
grant all on public.profiles,public.quiz_attempts,public.module_completions,public.learning_modules,public.challenges,public.challenge_questions,public.challenge_options,public.quiz_answer_keys,public.subscriptions to service_role;
grant usage,select on sequence public.quiz_attempts_id_seq to service_role;

-- No client may insert its own scores or completion rows. Scoring RPCs derive
-- scores from private answer keys; authenticated server routes write modules.
