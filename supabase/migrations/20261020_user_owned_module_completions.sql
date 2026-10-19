-- Allow signed-in users to save their own module completion without a
-- service-role key. Row-level security keeps writes scoped to auth.uid().
alter table public.module_completions enable row level security;

drop policy if exists "Users can insert own completions" on public.module_completions;
create policy "Users can insert own completions"
  on public.module_completions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own completions" on public.module_completions;
create policy "Users can update own completions"
  on public.module_completions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.module_completions from anon, authenticated;
grant select on public.module_completions to authenticated;
grant insert (user_id, module_slug), update (user_id, module_slug)
  on public.module_completions to authenticated;
