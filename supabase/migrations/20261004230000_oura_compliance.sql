-- Oura API Agreement: connection status and optional oura_days retention.
-- Safe to run more than once.
-- status on oura_connections:
--   connected            normal sync
--   disconnected         access revoked; tokens and oura_days already deleted
--   membership_inactive  Oura returned 403; rows are kept and sync is skipped
-- oura_days_retention_days in app_settings is JSON null by default, which
-- keeps every row. A positive integer is the number of days to keep.
-- Set it with:
--   update public.app_settings
--   set value = '90'::jsonb, updated_at = now()
--   where key = 'oura_days_retention_days';
-- Set it back to null to stop deleting. purge_oura_days_retention() is the
-- cleanup job. It is scheduled only when pg_cron is already installed.

alter table public.oura_connections
  add column if not exists status text not null default 'connected';

alter table public.oura_connections
  drop constraint if exists oura_connections_status_check;

alter table public.oura_connections
  add constraint oura_connections_status_check
  check (status in ('connected', 'disconnected', 'membership_inactive'));

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from public;

insert into public.app_settings (key, value)
values ('oura_days_retention_days', 'null'::jsonb)
on conflict (key) do nothing;

create or replace function public.purge_oura_days_retention()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n_days numeric;
  removed integer := 0;
begin
  select case
    when value = 'null'::jsonb then null
    when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric
    else null
  end into n_days
  from public.app_settings
  where key = 'oura_days_retention_days';

  if n_days is null or n_days <= 0 then
    return 0;
  end if;

  delete from public.oura_days
  where day < (current_date - floor(n_days)::int);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_oura_days_retention() from public;

do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.app_settings from anon';
    execute 'revoke all on function public.purge_oura_days_retention() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.app_settings from authenticated';
    execute 'revoke all on function public.purge_oura_days_retention() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.app_settings to service_role';
    execute 'grant execute on function public.purge_oura_days_retention() to service_role';
  end if;
end
$grants$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'oura-days-retention') then
      perform cron.unschedule('oura-days-retention');
    end if;
    perform cron.schedule(
      'oura-days-retention',
      '15 3 * * *',
      'select public.purge_oura_days_retention()'
    );
  end if;
end
$cron$;
