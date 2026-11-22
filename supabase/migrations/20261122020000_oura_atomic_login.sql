-- Oura login changes that must happen together, each in one transaction.
-- Safe to run more than once. Server only: no client can call these.
--
-- oura_save_login: Oura's callback saves a new login. The login and its
-- connection are written together, so a failed save changes nothing and a
-- saved one is complete. The connection gets a new, later connected_at (its
-- generation), an empty last_sync and last_error, and any recorded removal is
-- cleared.
--
-- oura_revoke_login: removes a login on a confirmed refusal (that exact
-- refresh token, on that connection) or on an explicit Disconnect (any
-- login). In the same transaction it records which connection the removal was
-- for (oura_revoke_intents).
--
-- oura_finish_revoke: deletes the stored days, but only for a connection
-- whose removal was recorded. A connection with no login and no recorded
-- removal (a save that failed, an older version's cleanup, anything else
-- unclear) keeps its days and is told to reconnect.
--
-- Each function first takes the same per-user lock, then touches rows in the
-- same order: tokens, connections, intents, days. So a reconnect and a
-- cleanup for one person never interleave.

-- Which connection's login was removed on purpose, and why. Kept until a
-- reconnect is saved, or until Disconnect has finished.
create table if not exists public.oura_revoke_intents (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  conn       timestamptz not null,
  kind       text not null check (kind in ('revoked', 'disconnect')),
  created_at timestamptz not null default now()
);
alter table public.oura_revoke_intents enable row level security;
revoke all on public.oura_revoke_intents from anon, authenticated;
grant all on public.oura_revoke_intents to service_role;

-- The same lock for every Oura login change of one person.
create or replace function public.oura_lock_user(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oura:' || p_user::text, 0));
$$;

-- The connection a stored day belongs to (data.conn), or null when it has none
-- or it can't be read as a time.
create or replace function public.oura_day_conn(p_data jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return (p_data->>'conn')::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.oura_save_login(
  p_user uuid,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_now timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior timestamptz;
  gen timestamptz;
begin
  if p_user is null then
    raise exception 'missing user';
  end if;
  -- Checked here so a missing token never reaches the NOT NULL check, whose
  -- error detail would copy the other token into the server log.
  if coalesce(p_access_token, '') = '' or coalesce(p_refresh_token, '') = '' then
    raise exception 'missing token';
  end if;
  perform public.oura_lock_user(p_user);
  select c.connected_at into prior from public.oura_connections c where c.user_id = p_user for update;
  -- Always later than the connection it replaces, so its days sort after the old ones.
  gen := coalesce(p_now, pg_catalog.now());
  if prior is not null and gen <= prior then
    gen := prior + interval '1 microsecond';
  end if;

  insert into public.oura_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
  values (p_user, p_access_token, p_refresh_token, p_expires_at, coalesce(p_now, pg_catalog.now()))
  on conflict (user_id) do update
    set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at;

  -- last_sync stays empty so the app runs a full first sync the next time it opens.
  insert into public.oura_connections (user_id, connected_at, last_sync, last_error)
  values (p_user, gen, null, null)
  on conflict (user_id) do update
    set connected_at = excluded.connected_at,
        last_sync = null,
        last_error = null;

  delete from public.oura_revoke_intents i where i.user_id = p_user;
  return gen;
end;
$$;

-- p_refresh given: a confirmed refusal of that refresh token on connection
-- p_conn. p_refresh null: an explicit Disconnect of whatever login there is.
-- Returns:
--   removed        the login is gone and its removal is recorded
--   newer_login    a different login is there now; nothing changed
--   no_login       no login and no recorded removal; nothing changed
--   not_connected  p_conn is not the current connection; nothing changed
create or replace function public.oura_revoke_login(p_user uuid, p_conn timestamptz, p_refresh text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur timestamptz;
  gone int;
begin
  if p_user is null then
    raise exception 'missing user';
  end if;
  if p_refresh is not null and p_conn is null then
    raise exception 'missing connection';
  end if;
  perform public.oura_lock_user(p_user);
  select c.connected_at into cur from public.oura_connections c where c.user_id = p_user;

  if p_refresh is null then
    delete from public.oura_tokens t where t.user_id = p_user;
    if cur is not null then
      insert into public.oura_revoke_intents (user_id, conn, kind)
      values (p_user, cur, 'disconnect')
      on conflict (user_id) do update set conn = excluded.conn, kind = excluded.kind, created_at = pg_catalog.now();
    end if;
    return 'removed';
  end if;

  if cur is null or cur <> p_conn then
    return 'not_connected';
  end if;
  delete from public.oura_tokens t where t.user_id = p_user and t.refresh_token = p_refresh;
  get diagnostics gone = row_count;
  if gone > 0 then
    insert into public.oura_revoke_intents (user_id, conn, kind)
    values (p_user, p_conn, 'revoked')
    on conflict (user_id) do update set conn = excluded.conn, kind = excluded.kind, created_at = pg_catalog.now();
    return 'removed';
  end if;
  if exists (select 1 from public.oura_tokens t where t.user_id = p_user) then
    return 'newer_login';
  end if;
  if exists (select 1 from public.oura_revoke_intents i where i.user_id = p_user and i.conn = p_conn) then
    return 'removed';
  end if;
  return 'no_login';
end;
$$;

-- p_conn given: a sync for that connection found no login. p_conn null: the
-- second step of an explicit Disconnect, which removes everything.
-- Returns:
--   revoked        that connection's (and older or unmarked) days were deleted
--   disconnected   the Disconnect finished: login, days and connection are gone
--   reconnect      no recorded removal for this connection; nothing changed
--   connected      a login is there; nothing changed
--   not_connected  p_conn is not the current connection; nothing changed
create or replace function public.oura_finish_revoke(p_user uuid, p_conn timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur timestamptz;
  why text;
begin
  if p_user is null then
    raise exception 'missing user';
  end if;
  perform public.oura_lock_user(p_user);

  if p_conn is null then
    delete from public.oura_tokens t where t.user_id = p_user;
    delete from public.oura_connections c where c.user_id = p_user;
    delete from public.oura_revoke_intents i where i.user_id = p_user;
    delete from public.oura_days d where d.user_id = p_user;
    return 'disconnected';
  end if;

  select c.connected_at into cur from public.oura_connections c where c.user_id = p_user;
  if cur is null or cur <> p_conn then
    return 'not_connected';
  end if;
  if exists (select 1 from public.oura_tokens t where t.user_id = p_user) then
    return 'connected';
  end if;
  select i.kind into why from public.oura_revoke_intents i where i.user_id = p_user and i.conn = p_conn;
  if why is null then
    return 'reconnect';
  end if;

  if why = 'disconnect' then
    delete from public.oura_connections c where c.user_id = p_user;
    delete from public.oura_revoke_intents i where i.user_id = p_user;
  end if;
  delete from public.oura_days d
  where d.user_id = p_user
    and (public.oura_day_conn(d.data) is null or public.oura_day_conn(d.data) <= p_conn);
  return case why when 'disconnect' then 'disconnected' else 'revoked' end;
end;
$$;

revoke all on function public.oura_lock_user(uuid) from public, anon, authenticated;
revoke all on function public.oura_day_conn(jsonb) from public, anon, authenticated;
revoke all on function public.oura_save_login(uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.oura_revoke_login(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.oura_finish_revoke(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.oura_lock_user(uuid) to service_role;
grant execute on function public.oura_day_conn(jsonb) to service_role;
grant execute on function public.oura_save_login(uuid, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.oura_revoke_login(uuid, timestamptz, text) to service_role;
grant execute on function public.oura_finish_revoke(uuid, timestamptz) to service_role;
