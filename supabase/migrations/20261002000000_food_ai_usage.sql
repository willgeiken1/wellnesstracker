-- Daily counter for AI food-photo analyses (enforces the per-person daily limit).
-- Private: only the server function can read or write it. Safe to run more than once.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;
