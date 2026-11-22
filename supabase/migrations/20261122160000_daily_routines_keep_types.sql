-- Keep Routines type tabs and custom types through merge_user_data.
-- prefs merge whole by updatedAt. A phone that saves a prefs change from an
-- older copy sent prefs without a custom type the other phone had just made,
-- and the newer stamp dropped it, so items of that type lost their tab.
-- The winner is still picked the same way, and setup and added stay as in
-- 20261122041000. Then prefs.typeTabs keeps every string either side has,
-- and prefs.customTypes keeps every object with a string id either side has,
-- matched by id: the winner's list first, then the other side's new entries
-- in its order. Matches keepSetupParts in
-- logger/js/shared/daily-routines-store.js.
-- No-ops until 20261122041000_daily_routines_keep_setup.sql has created
-- daily_routines_keep_setup. Safe to run more than once.

do $migrate$
begin
  if to_regprocedure('public.daily_routines_keep_setup(jsonb, jsonb, numeric)') is null then
    raise notice '20261122160000 skipped; apply 20261122041000_daily_routines_keep_setup.sql first';
    return;
  end if;
  execute $migration$
create or replace function public.daily_routines_grow_strings(p_winner jsonb, p_other jsonb, p_key text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  kept jsonb := p_winner;
  base jsonb;
  extras jsonb := '[]'::jsonb;
  entry jsonb;
begin
  if jsonb_typeof(p_other->p_key) is distinct from 'array' then
    return kept;
  end if;
  if jsonb_typeof(kept->p_key) = 'array' then
    base := kept->p_key;
  else
    base := '[]'::jsonb;
  end if;
  for entry in select value from jsonb_array_elements(p_other->p_key) with ordinality as e(value, ord) order by ord loop
    if jsonb_typeof(entry) = 'string'
       and not (base @> jsonb_build_array(entry))
       and not (extras @> jsonb_build_array(entry)) then
      extras := extras || jsonb_build_array(entry);
    end if;
  end loop;
  if jsonb_array_length(extras) > 0 then
    kept := jsonb_set(kept, array[p_key], base || extras, true);
  end if;
  return kept;
end;
$$;

create or replace function public.daily_routines_grow_by_id(p_winner jsonb, p_other jsonb, p_key text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  kept jsonb := p_winner;
  base jsonb;
  extras jsonb := '[]'::jsonb;
  entry jsonb;
begin
  if jsonb_typeof(p_other->p_key) is distinct from 'array' then
    return kept;
  end if;
  if jsonb_typeof(kept->p_key) = 'array' then
    base := kept->p_key;
  else
    base := '[]'::jsonb;
  end if;
  for entry in select value from jsonb_array_elements(p_other->p_key) with ordinality as e(value, ord) order by ord loop
    if jsonb_typeof(entry) = 'object'
       and jsonb_typeof(entry->'id') = 'string'
       and (entry->>'id') <> ''
       and not exists (
         select 1 from jsonb_array_elements(base || extras) as seen(val)
         where jsonb_typeof(seen.val) = 'object' and seen.val->'id' = entry->'id'
       ) then
      extras := extras || jsonb_build_array(entry);
    end if;
  end loop;
  if jsonb_array_length(extras) > 0 then
    kept := jsonb_set(kept, array[p_key], base || extras, true);
  end if;
  return kept;
end;
$$;

create or replace function public.daily_routines_keep_setup(p_winner jsonb, p_other jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  kept jsonb := p_winner;
begin
  if public.daily_routines_setup_at(p_other->'setup', p_now)
     > public.daily_routines_setup_at(p_winner->'setup', p_now) then
    kept := jsonb_set(kept, '{setup}', p_other->'setup', true);
  end if;
  kept := public.daily_routines_grow_strings(kept, p_other, 'added');
  kept := public.daily_routines_grow_strings(kept, p_other, 'typeTabs');
  kept := public.daily_routines_grow_by_id(kept, p_other, 'customTypes');
  return kept;
end;
$$;

revoke all on function public.daily_routines_grow_strings(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.daily_routines_grow_by_id(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.daily_routines_keep_setup(jsonb, jsonb, numeric) from public, anon, authenticated;
$migration$;
end
$migrate$;
