-- Lift Log database setup.
-- Row Level Security (RLS) makes every table private per person: you can only ever read your own rows.
-- Safe to run more than once.

-- Cloud backup of the app's workouts, routines and plans (one row per person).
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
drop policy if exists "own data: read"   on public.user_data;
drop policy if exists "own data: insert" on public.user_data;
drop policy if exists "own data: update" on public.user_data;
create policy "own data: read"   on public.user_data for select using (auth.uid() = user_id);
create policy "own data: insert" on public.user_data for insert with check (auth.uid() = user_id);
create policy "own data: update" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Whether Oura is connected and when it last synced (readable by its owner).
create table if not exists public.oura_connections (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  connected_at timestamptz not null default now(),
  last_sync    timestamptz,
  last_error   text
);
alter table public.oura_connections enable row level security;
drop policy if exists "own connection: read" on public.oura_connections;
create policy "own connection: read" on public.oura_connections for select using (auth.uid() = user_id);

-- One row per day of Oura data (readable by its owner).
create table if not exists public.oura_days (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.oura_days enable row level security;
drop policy if exists "own days: read" on public.oura_days;
create policy "own days: read" on public.oura_days for select using (auth.uid() = user_id);

-- PRIVATE: Oura login tokens and in-progress logins.
-- RLS is on with no policies, so the app can never read these. Only the server functions can.
create table if not exists public.oura_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);
alter table public.oura_tokens enable row level security;

create table if not exists public.oura_oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.oura_oauth_states enable row level security;

-- Explicit permissions.
grant select, insert, update on public.user_data to authenticated;
grant select on public.oura_connections, public.oura_days to authenticated;
revoke all on public.oura_tokens, public.oura_oauth_states from anon, authenticated;
grant all on public.user_data, public.oura_connections, public.oura_days, public.oura_tokens, public.oura_oauth_states to service_role;
