-- homeV2 accepts a layout whose only tiles are routine tiles.
-- routine-next, routine-block:<id>, and routine-item:<id> count as real
-- tiles, the same way the phone does. A non-empty list that has neither a
-- catalog id nor one of those ids is still rejected. Empty items stay valid.
-- Replaces home_v2_copy only. Rank, pick, and the edit-beats-migration rule
-- are unchanged. Safe to run more than once.

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
         and (
           elem #>> '{}' in (
             'readiness', 'sleep-score', 'sleep-duration', 'hrv', 'resting-hr', 'steps',
             'weekly-goal', 'food-today', 'food-yesterday', 'weight-trend', 'cardio-minutes',
             'brief', 'today', 'this-week', 'pattern', 'headline', 'muscles', 'cardio', 'last-night'
           )
           or elem #>> '{}' = 'routine-next'
           or elem #>> '{}' like 'routine-block:_%'
           or elem #>> '{}' like 'routine-item:_%'
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
