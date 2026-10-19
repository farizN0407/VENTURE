-- Add explicit content-domain metadata. CMS rows and unknown historical
-- attempts remain unclassified; only known quiz-bank/built-in attempts receive
-- an AI Literacy label. Scores and review data are never modified.
alter table public.learning_modules add column if not exists content_domain text not null default 'unclassified';
alter table public.challenges add column if not exists content_domain text not null default 'unclassified';
alter table public.quiz_attempts add column if not exists content_domain text not null default 'unclassified';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='learning_modules_content_domain_check' and conrelid='public.learning_modules'::regclass) then
    alter table public.learning_modules add constraint learning_modules_content_domain_check check (content_domain in ('unclassified','ai_literacy','cybersecurity'));
  end if;
  if not exists (select 1 from pg_constraint where conname='challenges_content_domain_check' and conrelid='public.challenges'::regclass) then
    alter table public.challenges add constraint challenges_content_domain_check check (content_domain in ('unclassified','ai_literacy','cybersecurity'));
  end if;
  if not exists (select 1 from pg_constraint where conname='quiz_attempts_content_domain_check' and conrelid='public.quiz_attempts'::regclass) then
    alter table public.quiz_attempts add constraint quiz_attempts_content_domain_check check (content_domain in ('unclassified','ai_literacy','cybersecurity'));
  end if;
end $$;

-- The topic quiz bank is AI Literacy by construction. These eight static
-- challenge slugs are the curated AI Literacy challenges in lib/challenges.ts.
-- This changes classification only; it does not edit historic scores/results.
update public.quiz_attempts set content_domain='ai_literacy'
where content_domain='unclassified' and (
  topic_slug is not null or challenge_slug in (
    'prompt-battle','can-you-trust-ai','fix-the-prompt','ai-or-human',
    'ai-in-real-life','ai-for-research','critical-thinking','responsible-ai'
  )
);
create index if not exists quiz_attempts_user_domain_created_at on public.quiz_attempts (user_id,content_domain,created_at desc);

drop policy if exists "Users can read public or admin modules" on public.learning_modules;
create policy "Users can read public or admin modules" on public.learning_modules for select to anon,authenticated
  using ((published and content_domain='ai_literacy') or public.is_promptly_admin());
drop policy if exists "Users can read public or admin challenges" on public.challenges;
create policy "Users can read public or admin challenges" on public.challenges for select to anon,authenticated
  using ((published and content_domain='ai_literacy') or public.is_promptly_admin());
drop policy if exists "Users can read questions from published challenges" on public.challenge_questions;
create policy "Users can read questions from published challenges" on public.challenge_questions for select to anon,authenticated
  using (exists (select 1 from public.challenges c where c.slug=challenge_slug and c.published and c.content_domain='ai_literacy') or public.is_promptly_admin());
drop policy if exists "Users can read options from published challenges" on public.challenge_options;
create policy "Users can read options from published challenges" on public.challenge_options for select to anon,authenticated
  using (exists (select 1 from public.challenge_questions q join public.challenges c on c.slug=q.challenge_slug where q.id=question_id and c.published and c.content_domain='ai_literacy') or public.is_promptly_admin());

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
  if nullif(p_payload->>'module_slug','') is not null and not exists (select 1 from public.learning_modules m where m.slug=p_payload->>'module_slug' and (m.content_domain=v_content_domain or m.content_domain='unclassified')) then raise exception 'Related module must exist in the same content domain or be unclassified.'; end if;
  if v_slug is null or v_slug !~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Custom challenge slugs must start with custom-.'; end if;
  if jsonb_typeof(p_payload->'questions') is distinct from 'array' then raise exception 'Questions must be an array.'; end if;
  if jsonb_array_length(p_payload->'questions') not between 1 and 50 then raise exception 'Add between 1 and 50 questions.'; end if;
  insert into public.challenges (slug,title,category,description,learning_objective,difficulty,content_domain,module_slug,published,created_by,updated_at)
  values (v_slug,trim(p_payload->>'title'),trim(p_payload->>'category'),trim(p_payload->>'description'),trim(p_payload->>'learning_objective'),p_payload->>'difficulty',v_content_domain,nullif(p_payload->>'module_slug',''),coalesce((p_payload->>'published')::boolean,false),auth.uid(),now())
  on conflict (slug) do update set title=excluded.title,category=excluded.category,description=excluded.description,learning_objective=excluded.learning_objective,
    difficulty=excluded.difficulty,content_domain=excluded.content_domain,module_slug=excluded.module_slug,published=excluded.published,updated_at=now();
  delete from public.challenge_questions where challenge_slug=v_slug;
  for v_question,v_question_position in select value,ordinality from jsonb_array_elements(p_payload->'questions') with ordinality loop
    if jsonb_typeof(v_question->'options') is distinct from 'array' then raise exception 'Question options must be an array.'; end if;
    if jsonb_array_length(v_question->'options') not between 2 and 10 then raise exception 'Each question needs 2 to 10 options.'; end if;
    v_correct_index := (v_question->>'correctIndex')::integer;
    if v_correct_index < 0 or v_correct_index >= jsonb_array_length(v_question->'options') then raise exception 'A correct option index is invalid.'; end if;
    insert into public.challenge_questions (challenge_slug,position,prompt,skill)
    values (v_slug,v_question_position,trim(v_question->>'prompt'),trim(v_question->>'skill')) returning id into v_question_id;
    v_correct_id := null;
    for v_option,v_option_position in select value,ordinality from jsonb_array_elements(v_question->'options') with ordinality loop
      insert into public.challenge_options (question_id,position,body) values (v_question_id,v_option_position,trim(v_option#>>'{}')) returning id into v_option_id;
      if v_option_position-1=v_correct_index then v_correct_id:=v_option_id; end if;
    end loop;
    insert into public.quiz_answer_keys (question_id,correct_option_id,explanation) values (v_question_id,v_correct_id,trim(v_question->>'explanation'));
  end loop;
end;
$$;
revoke all on function public.admin_save_challenge(jsonb) from public,anon;
grant execute on function public.admin_save_challenge(jsonb) to authenticated;

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
    join public.quiz_answer_keys ak on ak.question_id=q.id join public.challenge_options o on o.id=ak.correct_option_id
    where c.slug=p_challenge_slug and ((c.published and c.content_domain='ai_literacy') or public.is_promptly_admin()) order by q.position
  loop
    v_position:=v_position+1;
    if jsonb_typeof(p_answers->(v_position-1)) is distinct from 'number' then raise exception 'An answer is invalid.'; end if;
    if (p_answers->>(v_position-1))::numeric <> trunc((p_answers->>(v_position-1))::numeric) then raise exception 'An answer position must be a whole number.'; end if;
    v_selected:=(p_answers->>(v_position-1))::integer+1;
    if v_selected<1 or v_selected>v_row.option_count then raise exception 'An answer option is invalid.'; end if;
    select body into v_selected_answer from public.challenge_options where question_id=v_row.id and position=v_selected;
    if v_selected=v_row.correct_position then v_correct:=v_correct+1; end if;
    v_details:=v_details||jsonb_build_array(jsonb_build_object('question',v_position,'prompt',v_row.prompt,'skill',v_row.skill,
      'is_correct',(v_selected=v_row.correct_position),'selected_answer',v_selected_answer,'correct_answer',v_row.correct_answer,'explanation',v_row.explanation));
  end loop;
  v_score:=round(v_correct*100.0/v_total);
  select coalesce(jsonb_agg(jsonb_build_object('skill',skill,'correct',correct,'total',total,'score',round(correct*100.0/total)) order by skill),'[]'::jsonb)
    into v_skills from (select x->>'skill' as skill,count(*) filter (where (x->>'is_correct')::boolean) as correct,count(*) as total from jsonb_array_elements(v_details) x group by x->>'skill') s;
  if v_user_id is not null then
    insert into public.quiz_attempts (user_id,challenge_slug,content_domain,attempt_id,score,correct_answers,total_questions,skill_results,answer_details)
      values (v_user_id,p_challenge_slug,v_content_domain,p_attempt_id,v_score,v_correct,v_total,v_skills,v_details)
      on conflict (user_id,attempt_id) where attempt_id is not null do nothing;
    if found then v_saved:=true;
    else
      select score,correct_answers,total_questions,skill_results,answer_details into v_existing from public.quiz_attempts where user_id=v_user_id and attempt_id=p_attempt_id;
      if found then v_score:=v_existing.score;v_correct:=v_existing.correct_answers;v_total:=v_existing.total_questions;v_skills:=v_existing.skill_results;v_details:=v_existing.answer_details;v_saved:=true; end if;
    end if;
  end if;
  return jsonb_build_object('score',v_score,'correct_answers',v_correct,'total_questions',v_total,'skill_results',v_skills,'review',v_details,'saved',v_saved);
end;
$$;
revoke all on function public.submit_quiz_attempt(text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_quiz_attempt(text,jsonb,uuid) to anon,authenticated;
