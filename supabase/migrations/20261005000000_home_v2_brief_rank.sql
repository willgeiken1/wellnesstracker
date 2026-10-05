-- homeV2 allowlist gains the Morning brief, and a same-millisecond tie now
-- includes sizes. An equal updatedAt prefers the copy with more distinct ids
-- (items union hidden), then the existing rank compared with COLLATE "C".
-- items, hidden, updatedAt, ouraSeeded, and the edit-beats-migration rule
-- are unchanged. Replaces home_v2_copy, home_v2_rank, and home_v2_pick.
-- Safe to run more than once.

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
           'brief', 'today', 'this-week', 'pattern', 'headline', 'muscles', 'cardio', 'last-night'
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

create or replace function public.home_v2_rank(p_value jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select '{"items":' || coalesce(p_value->'items', '[]'::jsonb)::text
    || ',"hidden":' || coalesce(p_value->'hidden', '[]'::jsonb)::text
    || ',"sizes":' || case
         when jsonb_typeof(p_value->'sizes') = 'object' then (p_value->'sizes')::text
         else '{}'
       end || '}';
$$;

revoke all on function public.home_v2_rank(jsonb) from public, anon, authenticated;

create or replace function public.home_v2_id_count(p_value jsonb)
returns integer
language sql
immutable
set search_path = public
as $$
  select coalesce((
    select count(distinct id)
    from (
      select elem #>> '{}' as id
      from jsonb_array_elements(
        case when jsonb_typeof(p_value->'items') = 'array' then p_value->'items' else '[]'::jsonb end
      ) elem
      where jsonb_typeof(elem) = 'string'
        and length(elem #>> '{}') > 0
      union
      select elem #>> '{}' as id
      from jsonb_array_elements(
        case when jsonb_typeof(p_value->'hidden') = 'array' then p_value->'hidden' else '[]'::jsonb end
      ) elem
      where jsonb_typeof(elem) = 'string'
        and length(elem #>> '{}') > 0
    ) ids
  ), 0)::integer;
$$;

revoke all on function public.home_v2_id_count(jsonb) from public, anon, authenticated;

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
  stored_n integer;
  incoming_n integer;
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
      else
        stored_n := public.home_v2_id_count(stored);
        incoming_n := public.home_v2_id_count(incoming);
        if incoming_n > stored_n then
          winner := incoming; other := stored;
        elsif stored_n > incoming_n then
          winner := stored; other := incoming;
        elsif public.home_v2_rank(incoming) COLLATE "C" > public.home_v2_rank(stored) COLLATE "C" then
          winner := incoming; other := stored;
        else
          winner := stored; other := incoming;
        end if;
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
