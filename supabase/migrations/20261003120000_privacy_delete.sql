-- Account deletion and date-range deletion.
-- Safe to run more than once. The edge functions call these with the service key.
-- delete_user_rows removes every public table that has a user_id column, plus
-- files in the private progress bucket. It does not delete the auth user;
-- the delete-account function does that after this returns.
-- purge_user_range_rows removes dated rows (Oura days, progress photos, and any
-- later table that stores a user_id plus a day or date column) and the matching
-- photo files. It leaves the account, tokens, and the user_data JSON alone;
-- the purge-range function rewrites that JSON.

create or replace function public.delete_user_rows(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  r record;
begin
  if p_user is null then
    raise exception 'missing user';
  end if;

  delete from storage.objects
  where bucket_id = 'progress'
    and (storage.foldername(name))[1] = p_user::text;

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
set search_path = public, storage
as $$
declare
  r record;
  col text;
begin
  if p_user is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'bad range';
  end if;

  delete from storage.objects o
  where o.bucket_id = 'progress'
    and o.name in (
      select path from public.progress_photos
      where user_id = p_user and day >= p_from and day <= p_to
    );

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('user_data', 'ai_usage', 'oura_tokens', 'oura_connections', 'oura_oauth_states')
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
