-- Stop deleting storage.objects from SQL.
-- Safe to run more than once. Replaces delete_user_rows and purge_user_range_rows.
--
-- Supabase installs a BEFORE DELETE statement trigger, storage.protect_delete,
-- on storage.objects. It raises even when the DELETE matches zero rows, unless
-- the session sets storage.allow_delete_query. These functions were doing that
-- DELETE, so both calls failed, the edge functions returned 500, and account
-- deletion never reached auth.users.
--
-- delete-account and purge-range already remove files through the Storage API
-- before they call these functions. The functions only delete public rows.
--
-- progress_photos is left to purge-range. That function compares taken_at to
-- the delete time and removes those rows by id. Deleting here by day would
-- also remove a photo taken inside the range after the delete.

create or replace function public.delete_user_rows(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_user is null then
    raise exception 'missing user';
  end if;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id = $1', r.table_name) using p_user;
  end loop;
end;
$$;

revoke all on function public.delete_user_rows(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_rows(uuid) to service_role;

create or replace function public.purge_user_range_rows(p_user uuid, p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  col text;
begin
  if p_user is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'bad range';
  end if;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('user_data', 'ai_usage', 'oura_tokens', 'oura_connections', 'oura_oauth_states', 'progress_photos')
  loop
    select c.column_name into col
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name in ('day', 'date')
      and c.data_type = 'date'
    order by case c.column_name when 'day' then 0 else 1 end
    limit 1;
    if col is not null then
      execute format('delete from public.%I where user_id = $1 and %I >= $2 and %I <= $3', r.table_name, col, col)
        using p_user, p_from, p_to;
    end if;
  end loop;
end;
$$;

revoke all on function public.purge_user_range_rows(uuid, date, date) from public, anon, authenticated;
grant execute on function public.purge_user_range_rows(uuid, date, date) to service_role;
