-- merge_user_data keeps dailyRoutines when a push omits the key, sends JSON null,
-- or sends any other value that is not an object (array, string, number, boolean).
-- An older client, a restore from before this key, or the no-RPC fallback would
-- otherwise replace the account copy, tombstones included.
-- When both sides are objects, blocks, items, placements, compounds, and logs
-- are normalized the way the client normalizes them, then merged by id.
-- Normalization trims and clips names, fills the default color, and sets
-- order, kind, unit, and status the way mergeDailyRoutines does before it
-- compares rows. A row wins by max(updatedAt, deletedAt). A missing or
-- malformed stamp is 0. A stamp more than a day ahead is pulled back to
-- now + 1 day, the same window as homeV2. An equal stamp keeps the tombstone,
-- then the greater stable JSON of the normalized row. Numbers use
-- JSON.stringify's form (1e-7, not 0.0000001). Object keys and that
-- comparison use UTF-16 code units, on any database collation.
-- A log tombstone keeps only id, day, status, updatedAt, and deletedAt.
-- machineNotes and layout.homeV2 are unchanged. Every other key stays the
-- caller's payload.
-- Safe to run more than once.
-- Only the signed-in user can call it, and it writes only auth.uid()'s row.

create or replace function public.daily_routines_ms(p_value jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  n numeric;
begin
  if p_value is null or jsonb_typeof(p_value) is distinct from 'object' or not (p_value ? p_key) then
    return 0;
  end if;
  if jsonb_typeof(p_value->p_key) is distinct from 'number' then
    return 0;
  end if;
  begin
    n := (p_value->p_key #>> '{}')::numeric;
  exception when others then
    return 0;
  end;
  if n is null or n <= 0 then
    return 0;
  end if;
  return n;
end;
$$;

create or replace function public.daily_routines_clamp_ms(p_ms numeric, p_now numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_ms is null or p_ms <= 0 then 0
    when p_ms > coalesce(p_now, 0) + 86400000 then coalesce(p_now, 0) + 86400000
    else p_ms
  end;
$$;

create or replace function public.daily_routines_stamp(p_row jsonb, p_now numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
  select greatest(
    public.daily_routines_clamp_ms(public.daily_routines_ms(p_row, 'updatedAt'), p_now),
    public.daily_routines_clamp_ms(public.daily_routines_ms(p_row, 'deletedAt'), p_now)
  );
$$;

create or replace function public.daily_routines_tombstone(p_row jsonb, p_now numeric)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.daily_routines_clamp_ms(public.daily_routines_ms(p_row, 'deletedAt'), p_now) > 0;
$$;

-- JSON.stringify(number). Postgres prints 1e-07 and 1e+20; the client prints
-- 1e-7 and a 21-digit decimal. The tie-break compares those strings.
create or replace function public.daily_routines_json_number_text(p_value numeric)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  d float8;
  raw text;
  sign text := '';
  body text;
  digits text;
  exp int;
  k int;
  pos int;
begin
  if p_value is null then
    return 'null';
  end if;
  begin
    d := p_value::float8;
  exception when others then
    return trim_scale(p_value)::text;
  end;
  if d <> d then
    return 'null';
  end if;
  if d = 0 then
    return '0';
  end if;
  raw := replace(d::text, ',', '.');
  if left(raw, 1) = '-' then
    sign := '-';
    raw := substr(raw, 2);
  end if;
  if raw ~ '^[0-9]+(\.[0-9]+)?e[+-][0-9]+$' then
    body := split_part(raw, 'e', 1);
    exp := split_part(raw, 'e', 2)::int;
    digits := replace(body, '.', '');
    k := char_length(digits);
    if exp <= -7 or exp >= 21 then
      if k = 1 then
        return sign || digits || 'e' || case when exp >= 0 then '+' else '' end || exp::text;
      end if;
      return sign || left(digits, 1) || '.' || substr(digits, 2) || 'e' || case when exp >= 0 then '+' else '' end || exp::text;
    end if;
    if exp >= 0 then
      if exp >= k - 1 then
        return sign || digits || repeat('0', exp - (k - 1));
      end if;
      pos := exp + 1;
      return sign || left(digits, pos) || '.' || substr(digits, pos + 1);
    end if;
    return sign || '0.' || repeat('0', (-exp) - 1) || digits;
  end if;
  return sign || raw;
end;
$$;

-- JavaScript compares strings by UTF-16 code units. COLLATE "C" compares
-- UTF-8 bytes, which puts a supplementary character after U+FFFF instead of
-- at its surrogate pair.
create or replace function public.daily_routines_utf16be(p_text text)
returns bytea
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  i integer;
  cp integer;
  hi integer;
  lo integer;
  out bytea := ''::bytea;
begin
  if p_text = '' then
    return out;
  end if;
  -- ASCII is one UTF-16 code unit per byte, with a zero high byte.
  if octet_length(p_text) = char_length(p_text) then
    return decode(regexp_replace(encode(convert_to(p_text, 'UTF8'), 'hex'), '(..)', '00\1', 'g'), 'hex');
  end if;
  for i in 1..char_length(p_text)
  loop
    cp := ascii(substr(p_text, i, 1));
    if cp < 65536 then
      out := out || set_byte(set_byte('\x0000'::bytea, 0, (cp >> 8) & 255), 1, cp & 255);
    else
      cp := cp - 65536;
      hi := 55296 + (cp >> 10);
      lo := 56320 + (cp & 1023);
      out := out || set_byte(set_byte('\x0000'::bytea, 0, (hi >> 8) & 255), 1, hi & 255);
      out := out || set_byte(set_byte('\x0000'::bytea, 0, (lo >> 8) & 255), 1, lo & 255);
    end if;
  end loop;
  return out;
end;
$$;

create or replace function public.daily_routines_stable(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  kind text := jsonb_typeof(p_value);
  item jsonb;
  key text;
  keys text[];
  parts text[] := '{}';
begin
  if p_value is null or kind is null or kind = 'null' then
    return 'null';
  end if;
  if kind = 'array' then
    for item in select value from jsonb_array_elements(p_value)
    loop
      parts := parts || coalesce(public.daily_routines_stable(item), 'null');
    end loop;
    return '[' || array_to_string(parts, ',') || ']';
  end if;
  if kind = 'object' then
    select coalesce((
      select array_agg(obj_key order by public.daily_routines_utf16be(obj_key))
      from jsonb_object_keys(p_value) as obj_key
    ), '{}'::text[])
    into keys;
    if keys is null then
      keys := '{}'::text[];
    end if;
    foreach key in array keys
    loop
      parts := parts || (to_json(key)::text || ':' || public.daily_routines_stable(p_value->key));
    end loop;
    return '{' || array_to_string(parts, ',') || '}';
  end if;
  if kind = 'number' then
    return public.daily_routines_json_number_text((p_value #>> '{}')::numeric);
  end if;
  return p_value::text;
end;
$$;

create or replace function public.daily_routines_day(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  day text;
  parsed date;
begin
  if p_value is null or jsonb_typeof(p_value) is distinct from 'string' then
    return null;
  end if;
  day := p_value #>> '{}';
  if day is null or day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  begin
    parsed := day::date;
  exception when others then
    return null;
  end;
  if to_char(parsed, 'YYYY-MM-DD') is distinct from day then
    return null;
  end if;
  return day;
end;
$$;

create or replace function public.daily_routines_clip(p_value jsonb, p_max integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'string' then ''
    else left(regexp_replace(p_value #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g'), greatest(p_max, 0))
  end;
$$;

create or replace function public.daily_routines_num(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  n numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then
    return 0;
  end if;
  begin
    n := (p_value #>> '{}')::numeric;
  exception when others then
    return 0;
  end;
  if n is null then
    return 0;
  end if;
  return n;
end;
$$;

-- jsonb keeps a numeric's scale, so 1.50 would not match JSON.stringify(1.5).
create or replace function public.daily_routines_json_number(p_value numeric)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select to_jsonb(trim_scale(p_value));
$$;

create or replace function public.daily_routines_amount(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  n numeric;
  txt text;
begin
  if jsonb_typeof(p_value) = 'number' then
    return public.daily_routines_json_number(public.daily_routines_num(p_value));
  end if;
  if jsonb_typeof(p_value) is distinct from 'string' then
    return 'null'::jsonb;
  end if;
  txt := regexp_replace(p_value #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if txt is null or txt = '' then
    return 'null'::jsonb;
  end if;
  begin
    n := txt::numeric;
  exception when others then
    return 'null'::jsonb;
  end;
  if n is null then
    return 'null'::jsonb;
  end if;
  return public.daily_routines_json_number(n);
end;
$$;

create or replace function public.daily_routines_ref(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_value) = 'string' and coalesce(p_value #>> '{}', '') <> '' then to_jsonb(p_value #>> '{}')
    else 'null'::jsonb
  end;
$$;

create or replace function public.daily_routines_kind(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  txt text;
begin
  if jsonb_typeof(p_value) is distinct from 'string' then
    return 'check';
  end if;
  txt := p_value #>> '{}';
  if txt in ('check', 'dose') then
    return txt;
  end if;
  txt := regexp_replace(txt, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if txt is null or txt = '' then
    return 'check';
  end if;
  return left(txt, 24);
end;
$$;

-- Own keys only. constructor / prototype / __proto__ are not part of a row,
-- matching plainFields in the client store.
create or replace function public.daily_routines_plain(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce((
    select jsonb_object_agg(entry.key, entry.value)
    from jsonb_each(p_row) as entry(key, value)
    where entry.key not in ('__proto__', 'constructor', 'prototype')
  ), '{}'::jsonb);
$$;

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
    if deleted_at > 0 then
      return jsonb_build_object(
        'id', id,
        'day', day,
        'status', status,
        'updatedAt', public.daily_routines_json_number(updated_at),
        'deletedAt', public.daily_routines_json_number(deleted_at)
      );
    end if;
  end if;

  row := public.daily_routines_plain(p_row) || jsonb_build_object(
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

create or replace function public.daily_routines_beats(p_candidate jsonb, p_current jsonb, p_kind text, p_now numeric)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  stamp_c numeric := public.daily_routines_stamp(p_candidate, p_now);
  stamp_p numeric := public.daily_routines_stamp(p_current, p_now);
  prep_c jsonb;
  prep_p jsonb;
begin
  if stamp_c <> stamp_p then
    return stamp_c > stamp_p;
  end if;
  -- Equal stamp: the tombstone wins, then the greater stable JSON.
  if public.daily_routines_tombstone(p_candidate, p_now)
     <> public.daily_routines_tombstone(p_current, p_now) then
    return public.daily_routines_tombstone(p_candidate, p_now);
  end if;
  prep_c := public.daily_routines_prepare(p_candidate, p_kind, p_now);
  prep_p := public.daily_routines_prepare(p_current, p_kind, p_now);
  return public.daily_routines_utf16be(public.daily_routines_stable(prep_c))
       > public.daily_routines_utf16be(public.daily_routines_stable(prep_p));
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
      tomb,
      count(*) over (partition by id, stamp, tomb) as tied
    from stamped
  ),
  firsts as (
    select id, min(ord) as first_ord
    from ready
    group by id
  ),
  winners as (
    select distinct on (id) id, prepared
    from ready
    order by
      id,
      stamp desc,
      tomb desc,
      case when tied > 1 then public.daily_routines_utf16be(public.daily_routines_stable(prepared)) end desc,
      ord
  )
  select coalesce(jsonb_agg(w.prepared order by f.first_ord), '[]'::jsonb)
  from winners w
  join firsts f using (id);
$$;

create or replace function public.daily_routines_prefs(p_value jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  prefs jsonb;
  at numeric;
begin
  if p_value is null or jsonb_typeof(p_value) is distinct from 'object' then
    prefs := '{}'::jsonb;
  else
    prefs := p_value;
  end if;
  at := public.daily_routines_clamp_ms(public.daily_routines_ms(prefs, 'updatedAt'), p_now);
  prefs := jsonb_set(prefs, '{updatedAt}', to_jsonb(at), true);
  if jsonb_typeof(prefs->'lastBlockId') is distinct from 'string' or coalesce(prefs->>'lastBlockId', '') = '' then
    prefs := jsonb_set(prefs, '{lastBlockId}', 'null'::jsonb, true);
  end if;
  return prefs;
end;
$$;

create or replace function public.daily_routines_merge_prefs(p_stored jsonb, p_incoming jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  left_prefs jsonb := public.daily_routines_prefs(p_stored, p_now);
  right_prefs jsonb := public.daily_routines_prefs(p_incoming, p_now);
  left_at numeric := public.daily_routines_clamp_ms(public.daily_routines_ms(left_prefs, 'updatedAt'), p_now);
  right_at numeric := public.daily_routines_clamp_ms(public.daily_routines_ms(right_prefs, 'updatedAt'), p_now);
  left_s text;
  right_s text;
begin
  if left_at <> right_at then
    if left_at > right_at then
      return left_prefs;
    end if;
    return right_prefs;
  end if;
  left_s := public.daily_routines_stable(left_prefs);
  right_s := public.daily_routines_stable(right_prefs);
  if public.daily_routines_utf16be(left_s) > public.daily_routines_utf16be(right_s)
     or public.daily_routines_utf16be(left_s) = public.daily_routines_utf16be(right_s) then
    return left_prefs;
  end if;
  return right_prefs;
end;
$$;

create or replace function public.daily_routines_merge(p_stored jsonb, p_incoming jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  stored jsonb := p_stored;
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
  return jsonb_build_object(
    'updatedAt', greatest(
      public.daily_routines_clamp_ms(public.daily_routines_ms(stored, 'updatedAt'), p_now),
      public.daily_routines_clamp_ms(public.daily_routines_ms(p_incoming, 'updatedAt'), p_now)
    ),
    'blocks', public.daily_routines_merge_list(stored->'blocks', p_incoming->'blocks', 'blocks', p_now),
    'items', public.daily_routines_merge_list(stored->'items', p_incoming->'items', 'items', p_now),
    'placements', public.daily_routines_merge_list(stored->'placements', p_incoming->'placements', 'placements', p_now),
    'compounds', public.daily_routines_merge_list(stored->'compounds', p_incoming->'compounds', 'compounds', p_now),
    'logs', public.daily_routines_merge_list(stored->'logs', p_incoming->'logs', 'logs', p_now),
    'prefs', public.daily_routines_merge_prefs(stored->'prefs', p_incoming->'prefs', p_now)
  );
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

  update public.user_data
  set data = result,
      updated_at = now()
  where user_id = uid;

  return result;
end;
$$;

revoke all on function public.daily_routines_ms(jsonb, text) from public, anon, authenticated;
revoke all on function public.daily_routines_clamp_ms(numeric, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_stamp(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_tombstone(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_json_number_text(numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_utf16be(text) from public, anon, authenticated;
revoke all on function public.daily_routines_stable(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_day(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_clip(jsonb, integer) from public, anon, authenticated;
revoke all on function public.daily_routines_num(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_json_number(numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_amount(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_ref(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_kind(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_plain(jsonb) from public, anon, authenticated;
revoke all on function public.daily_routines_prepare(jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_beats(jsonb, jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge_list(jsonb, jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_prefs(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge_prefs(jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge(jsonb, jsonb, numeric) from public, anon, authenticated;

revoke all on function public.merge_user_data(jsonb) from public, anon, authenticated;
grant execute on function public.merge_user_data(jsonb) to authenticated;
