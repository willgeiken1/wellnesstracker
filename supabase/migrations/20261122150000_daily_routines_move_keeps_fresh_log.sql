-- A fresh log of a vacated day keeps its own id when the other phone's
-- move tombstone shares log_<item>_<day>. Dated after the Home tile migration.
-- Does not edit an applied migration.

do $migrate$
begin
  if to_regprocedure('public.daily_routines_merge(jsonb, jsonb, numeric)') is null then
    raise notice '20261122150000 skipped; apply the daily routines migrations first';
    return;
  end if;
  execute $migration$

create or replace function public.daily_routines_fnv32(p_text text)
returns text
language plpgsql
immutable
set search_path = public
as $fnv$
declare
  hash bigint := 2166136261;
  i integer;
  code integer;
begin
  for i in 1..char_length(p_text) loop
    code := ascii(substr(p_text, i, 1));
    hash := (hash # code) & 4294967295;
    hash := (hash * 16777619) & 4294967295;
  end loop;
  return lpad(to_hex(hash), 8, '0');
end;
$fnv$;

create or replace function public.daily_routines_fresh_move_id(p_base text, p_at numeric)
returns text
language plpgsql
immutable
set search_path = public
as $id$
declare
  mark text := trunc(p_at)::text;
  readable text := p_base || '_' || mark;
begin
  if char_length(readable) <= 80 then
    return readable;
  end if;
  return 'mv_' || public.daily_routines_fnv32(p_base || '|' || mark) || '_' || mark;
end;
$id$;

create or replace function public.daily_routines_retarget_fresh(p_stored jsonb, p_incoming jsonb, p_side text)
returns jsonb
language sql
immutable
set search_path = public
as $fn$
  with sides as (
    select
      case when jsonb_typeof(p_stored) = 'array' then p_stored else '[]'::jsonb end as stored,
      case when jsonb_typeof(p_incoming) = 'array' then p_incoming else '[]'::jsonb end as incoming
  ),
  chosen as (
    select
      stored,
      incoming,
      case when p_side = 'stored' then stored else incoming end as source,
      case when p_side = 'stored' then incoming else stored end as other_side
    from sides
  ),
  guard as (
    select source, other_side,
      exists (
        select 1 from jsonb_array_elements(stored) element where element ? 'movedDay'
        union all
        select 1 from jsonb_array_elements(incoming) element where element ? 'movedDay'
      ) as has_move
    from chosen
  ),
  tombs as (
    select coalesce(jsonb_object_agg(value->>'id', value), '{}'::jsonb) as map
    from guard
    cross join lateral jsonb_array_elements(guard.other_side) as value
    where guard.has_move
      and coalesce(value->>'id', '') <> ''
      and coalesce(public.daily_routines_ms(value, 'deletedAt'), 0) > 0
      and value ? 'movedDay'
  ),
  rewritten as (
    select elem.ordinality as ord,
      case
        when guard.has_move
          and (tombs.map ? (elem.value->>'id'))
          and coalesce(public.daily_routines_ms(elem.value, 'deletedAt'), 0) = 0
          and public.daily_routines_ms(tombs.map -> (elem.value->>'id'), 'deletedAt') > 0
          and public.daily_routines_day((tombs.map -> (elem.value->>'id')) -> 'movedDay') is not null
          and public.daily_routines_ms(tombs.map -> (elem.value->>'id'), 'movedAt') > 0
          and public.daily_routines_ms(elem.value, 'at') > 0
          and public.daily_routines_ms(elem.value, 'at') is distinct from public.daily_routines_ms(tombs.map -> (elem.value->>'id'), 'movedAt')
          and public.daily_routines_ms(elem.value, 'updatedAt') <= public.daily_routines_ms(tombs.map -> (elem.value->>'id'), 'deletedAt')
          and char_length(public.daily_routines_fresh_move_id(elem.value->>'id', public.daily_routines_ms(elem.value, 'at'))) <= 80
        then jsonb_set(
          elem.value,
          '{id}',
          to_jsonb(public.daily_routines_fresh_move_id(elem.value->>'id', public.daily_routines_ms(elem.value, 'at')))
        )
        else elem.value
      end as value
    from guard
    cross join tombs
    cross join lateral jsonb_array_elements(guard.source) with ordinality as elem(value, ordinality)
  )
  select coalesce((select jsonb_agg(value order by ord) from rewritten), '[]'::jsonb);
$fn$;


create or replace function public.daily_routines_prepare(p_row jsonb, p_kind text, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  id text;
  updated_at numeric;
  deleted_at numeric;
  day text;
  status text;
  color text;
  start_date text;
  archived_at numeric;
  row jsonb;
  raw_stamp numeric;
  carried numeric;
  cap numeric;
  source_at numeric := 0;
  source_step numeric := 0;
  extras jsonb := '{}'::jsonb;
begin
  if p_row is null or jsonb_typeof(p_row) is distinct from 'object' then
    return null;
  end if;
  if jsonb_typeof(p_row->'id') is distinct from 'string' then
    return null;
  end if;
  id := p_row->>'id';
  if id is null or id = '' or char_length(id) > 80 then
    return null;
  end if;

  updated_at := public.daily_routines_clamp_ms(public.daily_routines_ms(p_row, 'updatedAt'), p_now);
  deleted_at := public.daily_routines_clamp_ms(public.daily_routines_ms(p_row, 'deletedAt'), p_now);
  if deleted_at > 0 and updated_at < deleted_at then
    updated_at := deleted_at;
  end if;

  -- Keep the same future-stamp step 20261119234500 records. This function
  -- replaces that prepare, and a later restore has to stay ahead of the undo
  -- after both stamps clamp to the same millisecond.
  raw_stamp := greatest(
    public.daily_routines_ms(p_row, 'updatedAt'),
    public.daily_routines_ms(p_row, 'deletedAt')
  );
  carried := public.daily_routines_ms(p_row, 'sourceAt');
  cap := coalesce(p_now, 0) + 86400000;
  if carried > cap then
    source_at := carried;
  elsif raw_stamp > cap then
    source_at := raw_stamp;
  end if;
  if source_at > 0 then
    if public.daily_routines_ms(p_row, 'sourceStep') > 0 then
      source_step := floor(public.daily_routines_ms(p_row, 'sourceStep'));
    elsif coalesce(p_row->>'supersedes', '') = 'true' then
      source_step := 1;
    end if;
    extras := jsonb_build_object('sourceAt', public.daily_routines_json_number(source_at));
    if source_step > 0 then
      extras := extras || jsonb_build_object('sourceStep', public.daily_routines_json_number(source_step));
    end if;
  end if;

  if p_kind = 'placements' then
    if jsonb_typeof(p_row->'blockId') is distinct from 'string' or coalesce(p_row->>'blockId', '') = '' then
      return null;
    end if;
    if jsonb_typeof(p_row->'itemId') is distinct from 'string' or coalesce(p_row->>'itemId', '') = '' then
      return null;
    end if;
  end if;

  if p_kind = 'logs' then
    day := public.daily_routines_day(p_row->'day');
    status := public.daily_routines_clip(p_row->'status', 24);
    if day is null or status = '' then
      return null;
    end if;
    -- A range delete is the five-key marker. An undo is deleted too, and it
    -- keeps the amount, unit, and note. daily_routines_apply_purges still
    -- removes an undo that already existed when that range was deleted.
    if deleted_at > 0 and coalesce((p_row->'undone') = 'true'::jsonb, false) is not true then
      return jsonb_build_object(
        'id', id,
        'day', day,
        'status', status,
        'updatedAt', public.daily_routines_json_number(updated_at),
        'deletedAt', public.daily_routines_json_number(deleted_at)
      ) || extras || case
        when public.daily_routines_day(p_row->'movedDay') is not null
          and public.daily_routines_ms(p_row, 'movedAt') > 0
        then jsonb_build_object(
          'movedDay', to_jsonb(public.daily_routines_day(p_row->'movedDay')),
          'movedAt', public.daily_routines_json_number(public.daily_routines_ms(p_row, 'movedAt'))
        )
        else '{}'::jsonb
      end;
    end if;
  end if;

  -- plain() drops constructor / prototype / __proto__. Skip the scan when
  -- those keys are absent, which is every normal row.
  if p_row ? '__proto__' or p_row ? 'constructor' or p_row ? 'prototype' then
    row := public.daily_routines_plain(p_row);
  else
    row := p_row;
  end if;
  row := row || extras || jsonb_build_object(
    'id', id,
    'updatedAt', public.daily_routines_json_number(updated_at),
    'deletedAt', case
      when deleted_at > 0 then public.daily_routines_json_number(deleted_at)
      else 'null'::jsonb
    end
  );

  if p_kind = 'blocks' then
    color := public.daily_routines_clip(p_row->'color', 24);
    if color = '' then
      color := 'citrus';
    end if;
    return row || jsonb_build_object(
      'name', public.daily_routines_clip(p_row->'name', 80),
      'color', color,
      'order', public.daily_routines_json_number(public.daily_routines_num(p_row->'order'))
    );
  end if;

  if p_kind = 'items' then
    return row || jsonb_build_object(
      'name', public.daily_routines_clip(p_row->'name', 80),
      'kind', public.daily_routines_kind(p_row->'kind'),
      'compoundId', public.daily_routines_ref(p_row->'compoundId')
    );
  end if;

  if p_kind = 'placements' then
    return row || jsonb_build_object(
      'blockId', p_row->>'blockId',
      'itemId', p_row->>'itemId',
      'order', public.daily_routines_json_number(public.daily_routines_num(p_row->'order'))
    );
  end if;

  if p_kind = 'compounds' then
    start_date := public.daily_routines_day(p_row->'startDate');
    archived_at := public.daily_routines_clamp_ms(public.daily_routines_ms(p_row, 'archivedAt'), p_now);
    return row || jsonb_build_object(
      'name', public.daily_routines_clip(p_row->'name', 80),
      'amount', public.daily_routines_amount(p_row->'amount'),
      'unit', public.daily_routines_clip(p_row->'unit', 16),
      'startDate', case when start_date is null then 'null'::jsonb else to_jsonb(start_date) end,
      'archivedAt', case
        when archived_at > 0 then public.daily_routines_json_number(archived_at)
        else 'null'::jsonb
      end,
      'chartLine', case when p_row->'chartLine' = 'true'::jsonb then 'true'::jsonb else 'false'::jsonb end
    );
  end if;

  if p_kind = 'logs' then
    return row || jsonb_build_object(
      'itemId', public.daily_routines_ref(p_row->'itemId'),
      'compoundId', public.daily_routines_ref(p_row->'compoundId'),
      'day', day,
      'status', status,
      'amount', public.daily_routines_amount(p_row->'amount'),
      'unit', public.daily_routines_clip(p_row->'unit', 16),
      'at', public.daily_routines_json_number(public.daily_routines_num(p_row->'at'))
    );
  end if;

  return row;
end;
$$;



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
    'logs', public.daily_routines_merge_list(public.daily_routines_retarget_fresh(stored->'logs', p_incoming->'logs', 'stored'), public.daily_routines_retarget_fresh(stored->'logs', p_incoming->'logs', 'incoming'), 'logs', p_now),
    'prefs', public.daily_routines_merge_prefs(stored->'prefs', p_incoming->'prefs', p_now),
    'settings', public.daily_routines_merge_settings(stored->'settings', p_incoming->'settings', p_now)
  );
end;
$fn$;


revoke all on function public.daily_routines_fnv32(text) from public, anon, authenticated;
revoke all on function public.daily_routines_fresh_move_id(text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_retarget_fresh(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.daily_routines_prepare(jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge(jsonb, jsonb, numeric) from public, anon, authenticated;
$migration$;
end
$migrate$;
