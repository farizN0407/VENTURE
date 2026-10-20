-- Promptly usernames. Safe to run once or repeatedly; existing users remain unchanged.
alter table public.profiles add column if not exists username text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_format_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check
      check (username is null or username ~ '^[a-z0-9][a-z0-9_]{2,23}$');
  end if;
end $$;

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.handle_new_promptly_user()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_username text := lower(btrim(new.raw_user_meta_data->>'username'));
begin
  if v_username is null or v_username !~ '^[a-z0-9][a-z0-9_]{2,23}$' then
    raise exception 'A valid username is required.' using errcode = '23514';
  end if;
  -- Metadata may set only the validated username; public signups always receive user role.
  insert into public.profiles (id, role, username)
  values (new.id, 'user', v_username)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Reuse the existing trigger when it already targets this function. Repair it
-- only if missing or attached to a different function; this never stacks copies.
do $$
declare
  v_trigger_function oid;
begin
  select tgfoid into v_trigger_function
  from pg_trigger
  where tgrelid = 'auth.users'::regclass
    and tgname = 'on_auth_user_created_promptly'
    and not tgisinternal;

  if v_trigger_function is distinct from 'public.handle_new_promptly_user()'::regprocedure::oid then
    if v_trigger_function is not null then
      execute 'drop trigger on_auth_user_created_promptly on auth.users';
    end if;
    execute 'create trigger on_auth_user_created_promptly after insert on auth.users for each row execute function public.handle_new_promptly_user()';
  end if;
end $$;

alter table public.profiles enable row level security;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select to authenticated
  using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update own display name" on public.profiles;
create policy "Users can update own display name" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on public.profiles from public, anon, authenticated;
revoke update (id, role, created_at) on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, username) on public.profiles to authenticated;

create or replace function public.admin_profile_count()
returns bigint language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_count bigint;
begin
  if not public.is_promptly_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  select count(*) into v_count from public.profiles;
  return v_count;
end;
$$;
revoke all on function public.admin_profile_count() from public, anon;
grant execute on function public.admin_profile_count() to authenticated;
