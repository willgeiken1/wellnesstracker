-- Oura API Agreement: connection status and optional oura_days retention.
-- Safe to run more than once.
-- status on oura_connections:
--   connected            normal sync
--   disconnected         access revoked; tokens and oura_days already deleted
--   membership_inactive  Oura returned 403; rows are kept and sync is skipped
-- oura_days_retention_days in app_settings is JSON null by default, which
-- keeps every row. A number N keeps N UTC calendar days. 0, anything below
-- 1, and anything above 36500 also keep every row.
-- Set it with:
--   update public.app_settings
--   set value = '90'::jsonb, updated_at = now()
--   where key = 'oura_days_retention_days';
-- Set it back to null to stop deleting. purge_oura_days_retention() is the
-- cleanup job. It is scheduled only when pg_cron is already installed.
--
-- oura_days.day is a date (no time of day), created in 20261001000000.
-- The cutoff is (now() at time zone 'utc')::date, so the session TimeZone
-- cannot move the window. N = 90 keeps 90 UTC dates: the UTC date of the
-- run and the 89 dates before it. The row dated exactly 90 days earlier
-- is deleted.

alter table public.oura_connections
  add column if not exists status text not null default 'connected';

do $status$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'oura_connections_status_check'
      and conrelid = 'public.oura_connections'::regclass
  ) then
    alter table public.oura_connections
      add constraint oura_connections_status_check
      check (status in ('connected', 'disconnected', 'membership_inactive'));
  end if;
end
$status$;

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

do $retention_check$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'app_settings_oura_days_retention_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_oura_days_retention_check
      check (
        key <> 'oura_days_retention_days'
        or value = 'null'::jsonb
        or pg_catalog.jsonb_typeof(value) = 'number'
      );
  end if;
end
$retention_check$;

-- The primary key (user_id, day) leads with user_id. The purge filters on
-- day alone, so it needs an index whose first column is day.
do $idx$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public'
      and t.relname = 'oura_days'
      and a.attname = 'day'
      and i.indisvalid
      and i.indkey[0] <> 0
  ) then
    create index if not exists oura_days_day_idx on public.oura_days (day);
  end if;
end
$idx$;

create or replace function public.purge_oura_days_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw jsonb;
  n_days numeric;
  removed integer := 0;
begin
  select value into raw
  from public.app_settings
  where key = 'oura_days_retention_days';

  if raw is null or raw = 'null'::jsonb then
    return 0;
  elsif pg_catalog.jsonb_typeof(raw) <> 'number' then
    raise warning 'oura_days_retention_days must be JSON null or a number (found %)', pg_catalog.jsonb_typeof(raw);
    return 0;
  end if;

  n_days := (raw #>> '{}')::numeric;
  -- floor(0.4) is 0, and day <= today would delete every earlier row.
  -- Values above 36500 would also make the date subtraction overflow.
  if n_days < 1 or n_days > 36500 then
    return 0;
  end if;

  delete from public.oura_days
  where day <= ((now() at time zone 'utc')::date - pg_catalog.floor(n_days)::integer);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_oura_days_retention() from public;

do $grants$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all on public.app_settings from anon';
    execute 'revoke all on function public.purge_oura_days_retention() from anon';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.app_settings from authenticated';
    execute 'revoke all on function public.purge_oura_days_retention() from authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant all on public.app_settings to service_role';
    execute 'grant execute on function public.purge_oura_days_retention() to service_role';
  end if;
end
$grants$;

-- cron.schedule(name, schedule, command) updates the named job when it
-- already exists, so a second run does not leave two schedules.
do $cron$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'oura-days-retention',
      '15 3 * * *',
      'select public.purge_oura_days_retention()'
    );
  end if;
end
$cron$;
