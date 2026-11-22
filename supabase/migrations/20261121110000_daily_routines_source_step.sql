-- Forward migration. 20261119234500 is already applied, so db push will not
-- re-run it. This installs the same tie rule the phone uses: a remembered
-- future stamp sorts at sourceAt plus sourceStep, then the stored stamp,
-- then the tombstone. An undone log keeps its amount, unit, and note.
-- No-ops until daily_routines_prepare exists. Safe to run more than once.

do $migrate$
begin
  if to_regprocedure('public.daily_routines_prepare(jsonb, text, numeric)') is null then
    raise notice '20261121110000 skipped; apply 20261119234500_merge_daily_routines.sql first';
    return;
  end if;
  execute $migration$
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
    -- An undo is deleted too, and it keeps the amount, unit, note, and step.
    -- A range delete is still the five-key marker.
    if deleted_at > 0 and coalesce((p_row->'undone') = 'true'::jsonb, false) is not true then
      return jsonb_build_object(
        'id', id,
        'day', day,
        'status', status,
        'updatedAt', public.daily_routines_json_number(updated_at),
        'deletedAt', public.daily_routines_json_number(deleted_at)
      ) || extras;
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
      end
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

create or replace function public.daily_routines_order_stamp(p_row jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_row is null or jsonb_typeof(p_row) is distinct from 'object' then 0
    when jsonb_typeof(p_row->'sourceAt') = 'number'
      and (p_row->>'sourceAt')::numeric > coalesce((p_row->>'updatedAt')::numeric, 0)
    then (p_row->>'sourceAt')::numeric + case
      when jsonb_typeof(p_row->'sourceStep') = 'number' and (p_row->>'sourceStep')::numeric > 0
        then floor((p_row->>'sourceStep')::numeric)
      else 0
    end
    else coalesce((p_row->>'updatedAt')::numeric, 0)
  end;
$$;

create or replace function public.daily_routines_beats(p_candidate jsonb, p_current jsonb, p_kind text, p_now numeric)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  prep_c jsonb := public.daily_routines_prepare(p_candidate, p_kind, p_now);
  prep_p jsonb := public.daily_routines_prepare(p_current, p_kind, p_now);
  order_c numeric := public.daily_routines_order_stamp(prep_c);
  order_p numeric := public.daily_routines_order_stamp(prep_p);
  stamp_c numeric := coalesce((prep_c->>'updatedAt')::numeric, 0);
  stamp_p numeric := coalesce((prep_p->>'updatedAt')::numeric, 0);
begin
  if order_c <> order_p then
    return order_c > order_p;
  end if;
  if stamp_c <> stamp_p then
    return stamp_c > stamp_p;
  end if;
  -- Equal stamp: the tombstone wins, then the greater stable JSON.
  if public.daily_routines_tombstone(p_candidate, p_now)
     <> public.daily_routines_tombstone(p_current, p_now) then
    return public.daily_routines_tombstone(p_candidate, p_now);
  end if;
  return public.daily_routines_text_gt(
    public.daily_routines_stable(prep_c),
    public.daily_routines_stable(prep_p)
  );
end;
$$;

create or replace function public.daily_routines_merge_list(p_stored jsonb, p_incoming jsonb, p_kind text, p_now numeric)
returns jsonb
language sql
immutable
set search_path = public
as $$
  -- One pass over both lists, so the cost grows with n log n, not n squared.
  -- Each row is prepared once. Its order stamp, stored stamp, and tombstone
  -- come from the prepared row, and the stable JSON is built only for rows
  -- that tie on all three. The winner per id is the greater order stamp, then
  -- the newer stored stamp, then the tombstone, then the greater stable JSON,
  -- the same rule as daily_routines_beats. Rows come out in the order each id was
  -- first seen, incoming first. list is materialized so prepare runs once per row.
  with list as materialized (
    select e.ord, public.daily_routines_prepare(e.value, p_kind, p_now) as prepared
    from jsonb_array_elements(
      case when jsonb_typeof(p_incoming) = 'array' then p_incoming else '[]'::jsonb end
      || case when jsonb_typeof(p_stored) = 'array' then p_stored else '[]'::jsonb end
    ) with ordinality as e(value, ord)
  ),
  stamped as (
    select
      ord,
      prepared,
      prepared->>'id' as id,
      (prepared->>'updatedAt')::numeric as stamp,
      public.daily_routines_order_stamp(prepared) as order_stamp,
      jsonb_typeof(prepared->'deletedAt') = 'number' as tomb
    from list
    where prepared is not null
  ),
  ready as (
    select
      ord,
      prepared,
      id,
      stamp,
      order_stamp,
      tomb,
      count(*) over (partition by id, order_stamp, stamp, tomb) as tied
    from stamped
  ),
  ranked as (
    select
      ord,
      prepared,
      id,
      stamp,
      order_stamp,
      tomb,
      tied,
      case when tied > 1 then public.daily_routines_stable(prepared) end as stable
    from ready
  ),
  tie_mode as (
    select
      id,
      order_stamp,
      stamp,
      tomb,
      bool_or(public.daily_routines_has_supplementary(stable)) as use_utf16
    from ranked
    where tied > 1
    group by id, order_stamp, stamp, tomb
  ),
  firsts as (
    select id, min(ord) as first_ord
    from ranked
    group by id
  ),
  winners as (
    select distinct on (r.id) r.id, r.prepared
    from ranked r
    left join tie_mode m
      on m.id = r.id and m.order_stamp = r.order_stamp and m.stamp = r.stamp and m.tomb = r.tomb
    order by
      r.id,
      r.order_stamp desc,
      r.stamp desc,
      r.tomb desc,
      case
        when r.tied > 1 and coalesce(m.use_utf16, false)
          then encode(public.daily_routines_utf16be(r.stable), 'hex')
        when r.tied > 1
          then r.stable
      end collate "C" desc,
      r.ord
  )
  select coalesce(jsonb_agg(w.prepared order by f.first_ord), '[]'::jsonb)
  from winners w
  join firsts f using (id);
$$;

revoke all on function public.daily_routines_prepare(jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_order_stamp(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_beats(jsonb, jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge_list(jsonb, jsonb, text, numeric) from public, anon, authenticated;
$migration$;
end
$migrate$;
