-- The routine day can start as late as 6:00. A dose logged before that
-- hour is stored on the previous calendar day, so a range delete starts
-- one day earlier. The day-start hour is kept on the merged store.
-- Dated after 20261121183000. Does not edit an applied migration.
-- Safe to run more than once. Does not replace merge_user_data.

do $migrate$
begin
  if to_regprocedure('public.daily_routines_merge(jsonb, jsonb, numeric)') is null then
    raise notice '20261122120000 skipped; apply the daily routines migrations first';
    return;
  end if;
  execute $migration$
create or replace function public.daily_routines_rollover_hour(p_value jsonb)
returns integer
language sql
immutable
set search_path = public
as $fn$
  select case
    when jsonb_typeof(p_value) is distinct from 'number' then 4
    when (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then 4
    when (p_value #>> '{}')::numeric < 0 then 4
    when (p_value #>> '{}')::numeric > 6 then 6
    else trunc((p_value #>> '{}')::numeric)::integer
  end;
$fn$;

create or replace function public.daily_routines_settings(p_value jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $fn$
declare
  settings jsonb;
  at numeric;
begin
  if p_value is null or jsonb_typeof(p_value) is distinct from 'object' then
    settings := '{}'::jsonb;
  else
    settings := p_value;
  end if;
  at := public.daily_routines_clamp_ms(public.daily_routines_ms(settings, 'updatedAt'), p_now);
  settings := jsonb_set(settings, '{updatedAt}', public.daily_routines_json_number(at), true);
  settings := jsonb_set(settings, '{dayRolloverHour}', to_jsonb(public.daily_routines_rollover_hour(settings->'dayRolloverHour')), true);
  return settings;
end;
$fn$;

create or replace function public.daily_routines_merge_settings(p_stored jsonb, p_incoming jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $fn$
declare
  left_settings jsonb := public.daily_routines_settings(p_stored, p_now);
  right_settings jsonb := public.daily_routines_settings(p_incoming, p_now);
  left_at numeric := public.daily_routines_ms(left_settings, 'updatedAt');
  right_at numeric := public.daily_routines_ms(right_settings, 'updatedAt');
begin
  if left_at >= right_at then
    return left_settings;
  end if;
  return right_settings;
end;
$fn$;

create or replace function public.daily_routines_merge(p_stored jsonb, p_incoming jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $fn$
declare
  stored jsonb := p_stored;
  blocks jsonb;
  items jsonb;
  placements jsonb;
begin
  if p_incoming is null or jsonb_typeof(p_incoming) is distinct from 'object' then
    if jsonb_typeof(stored) = 'object' then
      return stored;
    end if;
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(stored) is distinct from 'object' then
    stored := '{}'::jsonb;
  end if;
  blocks := public.daily_routines_merge_list(stored->'blocks', p_incoming->'blocks', 'blocks', p_now);
  items := public.daily_routines_merge_list(stored->'items', p_incoming->'items', 'items', p_now);
  placements := public.daily_routines_merge_list(stored->'placements', p_incoming->'placements', 'placements', p_now);
  return jsonb_build_object(
    'updatedAt', greatest(
      public.daily_routines_clamp_ms(public.daily_routines_ms(stored, 'updatedAt'), p_now),
      public.daily_routines_clamp_ms(public.daily_routines_ms(p_incoming, 'updatedAt'), p_now)
    ),
    'blocks', public.daily_routines_apply_order_at(blocks, stored->'blocks', p_incoming->'blocks', 'blocks', p_now),
    'items', public.daily_routines_apply_order_at(items, stored->'items', p_incoming->'items', 'items', p_now),
    'placements', public.daily_routines_apply_order_at(placements, stored->'placements', p_incoming->'placements', 'placements', p_now),
    'compounds', public.daily_routines_merge_list(stored->'compounds', p_incoming->'compounds', 'compounds', p_now),
    'logs', public.daily_routines_merge_list(stored->'logs', p_incoming->'logs', 'logs', p_now),
    'prefs', public.daily_routines_merge_prefs(stored->'prefs', p_incoming->'prefs', p_now),
    'settings', public.daily_routines_merge_settings(stored->'settings', p_incoming->'settings', p_now)
  );
end;
$fn$;

create or replace function public.daily_routines_apply_purges(p_routines jsonb, p_purges jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  logs jsonb[] := array[]::jsonb[];
  log jsonb;
  kept jsonb;
  day text;
  from_day text;
  to_day text;
  before numeric;
  cutoff numeric;
  stamp numeric;
  drop_it boolean;
  gone boolean;
  reduced boolean;
  key_count integer;
  purge jsonb;
  changed boolean := false;
  result jsonb;
  range_from text[];
  range_to text[];
  range_before numeric[];
  range_early_from numeric[];
  range_early_to numeric[];
  range_count integer := 0;
  range_i integer;
begin
  if p_routines is null or jsonb_typeof(p_routines) is distinct from 'object' then
    return p_routines;
  end if;
  if jsonb_typeof(p_routines->'logs') is distinct from 'array' then
    return p_routines;
  end if;
  if jsonb_typeof(p_purges) is distinct from 'array' or jsonb_array_length(p_purges) = 0 then
    return p_routines;
  end if;
  -- Validate each purge once. The log loop then compares plain dates.
  for purge in select value from jsonb_array_elements(p_purges)
  loop
    if jsonb_typeof(purge) is distinct from 'object' then
      continue;
    end if;
    from_day := public.daily_routines_day(purge->'from');
    to_day := public.daily_routines_day(purge->'to');
    if from_day is null or to_day is null or from_day > to_day then
      continue;
    end if;
    before := public.daily_routines_purge_before(purge, p_now);
    range_count := range_count + 1;
    range_from[range_count] := from_day;
    range_to[range_count] := to_day;
    range_before[range_count] := before;
    if jsonb_typeof(purge->'routineEarlyFrom') = 'number' and jsonb_typeof(purge->'routineEarlyTo') = 'number' then
      range_early_from[range_count] := (purge->>'routineEarlyFrom')::numeric;
      range_early_to[range_count] := (purge->>'routineEarlyTo')::numeric;
    else
      range_early_from[range_count] := null;
      range_early_to[range_count] := null;
    end if;
  end loop;
  if range_count = 0 then
    return p_routines;
  end if;
  for log in select value from jsonb_array_elements(p_routines->'logs')
  loop
    kept := log;
    day := kept->>'day';
    if day is not null then
      select max(nullif(public.daily_routines_ms(kept, k), 0))
        into stamp
      from unnest(array['loggedAt', 'updatedAt', 'createdAt', 'at', 'mod']) as k;
      for range_i in 1..range_count
      loop
        if not (
          (day >= range_from[range_i] and day <= range_to[range_i])
          or (
            range_early_from[range_i] is not null
            and range_early_to[range_i] > range_early_from[range_i]
            and day = to_char(to_date(range_from[range_i], 'YYYY-MM-DD') - 1, 'YYYY-MM-DD')
            and public.daily_routines_ms(kept, 'at') >= range_early_from[range_i]
            and public.daily_routines_ms(kept, 'at') < range_early_to[range_i]
          )
        ) then
          continue;
        end if;
        before := range_before[range_i];
        drop_it := before is null
          or stamp is null
          or stamp > coalesce(p_now, 0) + 60000
          or stamp <= before;
        if not drop_it then
          continue;
        end if;
        select count(*) into key_count from jsonb_object_keys(kept);
        gone := public.daily_routines_ms(kept, 'deletedAt') > 0;
        reduced := gone
          and kept ?& array['id', 'day', 'status', 'updatedAt', 'deletedAt']
          and not exists (
            select 1 from jsonb_object_keys(kept) extra_key
            where extra_key not in ('id', 'day', 'status', 'updatedAt', 'deletedAt', 'movedAt', 'movedDay', 'sourceAt', 'sourceStep')
          );
        if reduced then
          continue;
        end if;
        if gone then
          cutoff := public.daily_routines_clamp_ms(public.daily_routines_ms(kept, 'deletedAt'), p_now);
        else
          cutoff := before;
        end if;
        if cutoff is null or cutoff <= 0 then
          cutoff := coalesce(p_now, 0);
        end if;
        kept := jsonb_build_object(
          'id', kept->>'id',
          'day', day,
          'status', case
            when coalesce(kept->>'status', '') = '' then 'done'
            else left(kept->>'status', 24)
          end,
          'updatedAt', public.daily_routines_json_number(greatest(public.daily_routines_ms(kept, 'updatedAt'), cutoff)),
          'deletedAt', public.daily_routines_json_number(cutoff)
        );
        changed := true;
      end loop;
    end if;
    logs := array_append(logs, kept);
  end loop;
  result := jsonb_set(p_routines, '{logs}', coalesce(to_jsonb(logs), '[]'::jsonb), true);
  if changed then
    result := jsonb_set(
      result,
      '{updatedAt}',
      public.daily_routines_json_number(greatest(public.daily_routines_ms(result, 'updatedAt'), coalesce(p_now, 0))),
      true
    );
  end if;
  return result;
end;
$$;

revoke all on function public.daily_routines_rollover_hour(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_settings(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge_settings(jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge(jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_apply_purges(jsonb, jsonb, numeric) from public, anon, authenticated;
$migration$;
end
$migrate$;
