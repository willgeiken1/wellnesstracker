-- merge_user_data also merges layout.homeV2.
-- An old app sends the whole layout and would otherwise erase a newer phone's
-- homeV2 whenever its settingsAt wins. The row lock still covers machineNotes.
-- homeV2: an edit beats a migration, the same kind compares updatedAt, a tie
-- breaks on the JSON of items and hidden, ouraSeeded sticks, a timestamp more
-- than a day ahead is pulled back, and a missing or malformed incoming copy
-- keeps the one already stored. The rest of the blob stays the caller's payload.
-- v is valid only as a JSON number equal to 2; the string "2" is rejected.
-- items: [] is a real empty layout and can win. A non-empty items array with
-- no id from HOME_WIDGETS is malformed, so the stored copy is kept. A mix of
-- known and unknown ids stays stored; the client drops the unknown ones.
-- The id list below matches logger/js/shared/home-widgets.js.
-- Safe to run more than once.
-- Only the signed-in user can call it, and it writes only auth.uid()'s row.

create or replace function public.home_v2_copy(p_value jsonb, p_now_ms numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  at numeric;
  cap numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return null;
  end if;
  if jsonb_typeof(p_value->'v') is distinct from 'number' then
    return null;
  end if;
  begin
    if (p_value->>'v')::numeric <> 2 then
      return null;
    end if;
  exception when others then
    return null;
  end;
  if jsonb_typeof(p_value->'items') is distinct from 'array' then
    return null;
  end if;
  if jsonb_array_length(p_value->'items') > 0
     and not exists (
       select 1
       from jsonb_array_elements(p_value->'items') elem
       where jsonb_typeof(elem) = 'string'
         and elem #>> '{}' in (
           'readiness', 'sleep-score', 'sleep-duration', 'hrv', 'resting-hr', 'steps',
           'weekly-goal', 'food-today', 'food-yesterday', 'weight-trend', 'cardio-minutes',
           'today', 'this-week', 'pattern', 'headline', 'muscles', 'cardio', 'last-night'
         )
     ) then
    return null;
  end if;
  if p_value ? 'hidden' and jsonb_typeof(p_value->'hidden') is distinct from 'array' and jsonb_typeof(p_value->'hidden') is distinct from 'null' then
    return null;
  end if;
  begin
    at := (p_value->>'updatedAt')::numeric;
  exception when others then
    at := 0;
  end;
  if at is null or at < 0 then
    at := 0;
  end if;
  cap := coalesce(p_now_ms, 0) + 86400000;
  if at > cap then
    at := cap;
  end if;
  return jsonb_set(p_value, '{updatedAt}', to_jsonb(at), true);
end;
$$;

revoke all on function public.home_v2_copy(jsonb, numeric) from public, anon, authenticated;

create or replace function public.home_v2_migrated(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_value is not null and (
    coalesce(p_value->>'migrated', '') = 'true'
    or case
      when p_value ? 'migratedAt' and (p_value->>'migratedAt') ~ '^[0-9]+(\.[0-9]+)?$'
      then (p_value->>'migratedAt')::numeric > 0
      else false
    end
  );
$$;

revoke all on function public.home_v2_migrated(jsonb) from public, anon, authenticated;

create or replace function public.home_v2_rank(p_value jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select '{"items":' || coalesce(p_value->'items', '[]'::jsonb)::text
    || ',"hidden":' || coalesce(p_value->'hidden', '[]'::jsonb)::text || '}';
$$;

revoke all on function public.home_v2_rank(jsonb) from public, anon, authenticated;

create or replace function public.home_v2_ms(p_value jsonb, p_key text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_value ? p_key and (p_value->>p_key) ~ '^[0-9]+(\.[0-9]+)?$'
    then (p_value->>p_key)::numeric
    else 0
  end;
$$;

revoke all on function public.home_v2_ms(jsonb, text) from public, anon, authenticated;

create or replace function public.home_v2_pick(p_stored jsonb, p_incoming jsonb, p_now_ms numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $pick$
declare
  stored jsonb := public.home_v2_copy(p_stored, p_now_ms);
  incoming jsonb := public.home_v2_copy(p_incoming, p_now_ms);
  winner jsonb;
  other jsonb;
  stored_edited boolean;
  incoming_edited boolean;
  stored_at numeric;
  incoming_at numeric;
begin
  if stored is null and incoming is null then
    return null;
  end if;
  if stored is null then
    winner := incoming;
    other := null;
  elsif incoming is null then
    winner := stored;
    other := null;
  else
    stored_edited := not public.home_v2_migrated(stored);
    incoming_edited := not public.home_v2_migrated(incoming);
    if stored_edited <> incoming_edited then
      if stored_edited then
        winner := stored; other := incoming;
      else
        winner := incoming; other := stored;
      end if;
    else
      stored_at := public.home_v2_ms(stored, 'updatedAt');
      incoming_at := public.home_v2_ms(incoming, 'updatedAt');
      if incoming_at > stored_at then
        winner := incoming; other := stored;
      elsif stored_at > incoming_at then
        winner := stored; other := incoming;
      elsif public.home_v2_rank(incoming) > public.home_v2_rank(stored) then
        winner := incoming; other := stored;
      else
        winner := stored; other := incoming;
      end if;
    end if;
  end if;

  if other is not null and coalesce(other->>'ouraSeeded', '') = 'true' and coalesce(winner->>'ouraSeeded', '') <> 'true' then
    winner := winner || jsonb_build_object('ouraSeeded', true);
  end if;
  if public.home_v2_migrated(winner)
     and other is not null
     and public.home_v2_ms(winner, 'migratedAt') <= 0
     and public.home_v2_ms(other, 'migratedAt') > 0 then
    winner := winner || jsonb_build_object('migratedAt', public.home_v2_ms(other, 'migratedAt'));
  end if;
  return winner;
end;
$pick$;

revoke all on function public.home_v2_pick(jsonb, jsonb, numeric) from public, anon, authenticated;

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

  update public.user_data
  set data = result,
      updated_at = now()
  where user_id = uid;

  return result;
end;
$$;

revoke all on function public.merge_user_data(jsonb) from public, anon, authenticated;
grant execute on function public.merge_user_data(jsonb) to authenticated;
