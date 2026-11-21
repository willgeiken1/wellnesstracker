-- Keep an undone dose log's amount, unit, and note through merge_user_data.
-- 20261119234500 reduced every log with deletedAt > 0 to the five tombstone
-- keys. An undo is deleted too, and that reduction dropped the dose, so
-- Restore after sync came back as the current plan with no note.
-- An undo stays intact. A range delete still replaces a log that already
-- existed: the same cutoff the client uses in purgeDailyRoutineRange and
-- stripRange. A five-key marker at the same stamp loses to the undo, so a
-- phone that still has the dose can repair an account that was already
-- reduced. A later range delete has a newer stamp and still wins.
-- No-ops until 20261119234500_merge_daily_routines.sql has created
-- daily_routines_prepare. Safe to run more than once.

do $migrate$
begin
  if to_regprocedure('public.daily_routines_prepare(jsonb, text, numeric)') is null then
    raise notice '20261121183000 skipped; apply 20261119234500_merge_daily_routines.sql first';
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

create or replace function public.daily_routines_merge_list(p_stored jsonb, p_incoming jsonb, p_kind text, p_now numeric)
returns jsonb
language sql
immutable
set search_path = public
as $$
  -- One pass over both lists, so the cost grows with n log n, not n squared.
  -- Each row is prepared once. Its stamp and tombstone come from the prepared
  -- row (updatedAt is already max(updatedAt, deletedAt), clamped), and the
  -- stable JSON is built only for rows that tie on both. The winner per id is
  -- the greater stamp, then the tombstone, then the greater stable JSON, the
  -- same rule as daily_routines_beats. Rows come out in the order each id was
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
      coalesce(r.prepared->>'undone' = 'true', false) desc,
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

create or replace function public.daily_routines_purge_before(p_purge jsonb, p_now numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  deleted numeric := public.daily_routines_ms(p_purge, 'deletedAt');
  at numeric := public.daily_routines_ms(p_purge, 'at');
  skew constant numeric := 60000;
  now_ms numeric := coalesce(p_now, 0);
begin
  if p_purge is null or jsonb_typeof(p_purge) is distinct from 'object' then
    return null;
  end if;
  if deleted > 0 and deleted <= now_ms + skew then
    return deleted;
  end if;
  if at > 0 and at <= now_ms + skew then
    return at;
  end if;
  if greatest(deleted, at) > now_ms + skew then
    if now_ms > 0 then
      return now_ms - 1;
    end if;
    return now_ms;
  end if;
  return null;
end;
$$;

create or replace function public.daily_routines_apply_purges(p_routines jsonb, p_purges jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  logs jsonb := '[]'::jsonb;
  log jsonb;
  kept jsonb;
  day text;
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
begin
  if p_routines is null or jsonb_typeof(p_routines) is distinct from 'object' then
    return p_routines;
  end if;
  if jsonb_typeof(p_routines->'logs') is distinct from 'array' then
    return p_routines;
  end if;
  for log in select value from jsonb_array_elements(p_routines->'logs')
  loop
    kept := log;
    day := kept->>'day';
    if day is not null and jsonb_typeof(p_purges) = 'array' then
      for purge in select value from jsonb_array_elements(p_purges)
      loop
        if jsonb_typeof(purge) is distinct from 'object' then
          continue;
        end if;
        if coalesce(purge->>'from', '') = '' or coalesce(purge->>'to', '') = '' then
          continue;
        end if;
        if day < purge->>'from' or day > purge->>'to' then
          continue;
        end if;
        before := public.daily_routines_purge_before(purge, p_now);
        select max(nullif(public.daily_routines_ms(kept, k), 0))
          into stamp
        from unnest(array['loggedAt', 'updatedAt', 'createdAt', 'at', 'mod']) as k;
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
          and key_count = 5
          and kept ?& array['id', 'day', 'status', 'updatedAt', 'deletedAt'];
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
    logs := logs || jsonb_build_array(kept);
  end loop;
  result := jsonb_set(p_routines, '{logs}', logs, true);
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
create or replace function public.merge_user_data(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing jsonb;
  incoming jsonb;
  stored jsonb;
  merged jsonb := '{}'::jsonb;
  result jsonb;
  key text;
  val jsonb;
  norm jsonb;
  cur jsonb;
  now_ms numeric;
  picked jsonb;
  incoming_layout jsonb;
  stored_layout jsonb;
  incoming_routines jsonb;
  stored_routines jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad data';
  end if;

  insert into public.user_data (user_id, data)
  values (uid, '{}'::jsonb)
  on conflict (user_id) do nothing;

  select data into existing
  from public.user_data
  where user_id = uid
  for update;

  if existing is null or jsonb_typeof(existing) <> 'object' then
    existing := '{}'::jsonb;
  end if;

  incoming := p_data->'machineNotes';
  stored := existing->'machineNotes';
  if incoming is null or jsonb_typeof(incoming) <> 'object' then
    incoming := '{}'::jsonb;
  end if;
  if stored is null or jsonb_typeof(stored) <> 'object' then
    stored := '{}'::jsonb;
  end if;

  for key, val in select * from jsonb_each(stored)
  loop
    norm := public.machine_note_record(val);
    if norm is not null then
      merged := merged || jsonb_build_object(key, norm);
    end if;
  end loop;

  for key, val in select * from jsonb_each(incoming)
  loop
    norm := public.machine_note_record(val);
    if norm is null then
      continue;
    end if;
    cur := merged->key;
    if cur is null or coalesce((norm->>'at')::numeric, 0) > coalesce((cur->>'at')::numeric, 0) then
      merged := merged || jsonb_build_object(key, norm);
    end if;
  end loop;

  result := jsonb_set(p_data, '{machineNotes}', merged, true);

  now_ms := floor(extract(epoch from clock_timestamp()) * 1000);
  incoming_layout := result->'layout';
  stored_layout := existing->'layout';
  picked := public.home_v2_pick(
    case when jsonb_typeof(stored_layout) = 'object' then stored_layout->'homeV2' else null end,
    case when jsonb_typeof(incoming_layout) = 'object' then incoming_layout->'homeV2' else null end,
    now_ms
  );
  if picked is not null then
    if jsonb_typeof(incoming_layout) = 'object' then
      result := jsonb_set(result, '{layout,homeV2}', picked, true);
    else
      result := jsonb_set(result, '{layout}', jsonb_build_object('homeV2', picked), true);
    end if;
  end if;

  incoming_routines := result->'dailyRoutines';
  stored_routines := existing->'dailyRoutines';
  -- Omitted dailyRoutines keeps the stored object.
  if not (result ? 'dailyRoutines') then
    if jsonb_typeof(stored_routines) = 'object' then
      result := jsonb_set(result, '{dailyRoutines}', stored_routines, true);
    end if;
  -- JSON null dailyRoutines keeps the stored object.
  elsif jsonb_typeof(incoming_routines) = 'null' then
    if jsonb_typeof(stored_routines) = 'object' then
      result := jsonb_set(result, '{dailyRoutines}', stored_routines, true);
    end if;
  elsif jsonb_typeof(incoming_routines) = 'object' then
    result := jsonb_set(result, '{dailyRoutines}', public.daily_routines_merge(
      case when jsonb_typeof(stored_routines) = 'object' then stored_routines else null end,
      incoming_routines,
      now_ms
    ), true);
  -- Any other value (array, string, number, boolean) keeps the stored object.
  elsif jsonb_typeof(stored_routines) = 'object' then
    result := jsonb_set(result, '{dailyRoutines}', stored_routines, true);
  else
    result := result - 'dailyRoutines';
  end if;

  if jsonb_typeof(result->'dailyRoutines') = 'object' then
    result := jsonb_set(
      result,
      '{dailyRoutines}',
      public.daily_routines_apply_purges(result->'dailyRoutines', result->'purges', now_ms),
      true
    );
  end if;

  update public.user_data
  set data = result,
      updated_at = now()
  where user_id = uid;

  return result;
end;
$$;

revoke all on function public.daily_routines_prepare(jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge_list(jsonb, jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_purge_before(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_apply_purges(jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.merge_user_data(jsonb) from public, anon, authenticated;
grant execute on function public.merge_user_data(jsonb) to authenticated;
$migration$;
end
$migrate$;
