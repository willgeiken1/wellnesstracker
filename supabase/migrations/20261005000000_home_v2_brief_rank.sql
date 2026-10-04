-- homeV2 allowlist gains the Morning brief, and a same-millisecond tie now
-- includes sizes. items, hidden, updatedAt, ouraSeeded, and the edit-beats-
-- migration rule are unchanged. Replaces home_v2_copy and home_v2_rank.
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
