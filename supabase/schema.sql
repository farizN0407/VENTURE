-- Run this in Supabase SQL Editor. Review policies before production.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
create table if not exists public.quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_slug text not null,
  score integer not null check (score between 0 and 100),
  total_questions integer not null check (total_questions > 0),
  correct_answers integer not null check (correct_answers between 0 and total_questions),
  created_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.subscriptions enable row level security;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can read own attempts" on public.quiz_attempts for select using (auth.uid() = user_id);
create policy "Users can insert own attempts" on public.quiz_attempts for insert with check (auth.uid() = user_id);
create policy "Users can read own subscription" on public.subscriptions for select using (auth.uid() = user_id);
-- Do NOT grant clients write access to subscriptions. Update subscription rows only from a verified server-side Stripe webhook.
