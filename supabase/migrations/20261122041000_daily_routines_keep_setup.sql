-- Keep the Routines setup answers and added parts through merge_user_data.
-- prefs merge whole by updatedAt. A phone that saves a prefs change from a
-- copy pulled before the other phone finished setup sent prefs without
-- setup, and the newer stamp dropped the answers, so the quiz showed again.
-- The winner is still picked the same way. Then the newer prefs.setup wins
-- by its own updatedAt, and prefs.added keeps every string either side has:
-- the winner's list first, then the other side's new entries in its order.
-- Matches keepSetupParts in logger/js/shared/daily-routines-store.js.
-- No-ops until 20261119234500_merge_daily_routines.sql has created
-- daily_routines_merge_prefs. Safe to run more than once.

do $migrate$
begin
  if to_regprocedure('public.daily_routines_merge_prefs(jsonb, jsonb, numeric)') is null then
    raise notice '20261122041000 skipped; apply 20261119234500_merge_daily_routines.sql first';
    return;
  end if;
  execute $migration$
create or replace function public.daily_routines_setup_at(p_setup jsonb, p_now numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_setup is null or jsonb_typeof(p_setup) is distinct from 'object' then
    return -1;
  end if;
  if jsonb_typeof(p_setup->'status') is distinct from 'string'
     or (p_setup->>'status') not in ('done', 'skipped') then
    return -1;
  end if;
  return public.daily_routines_clamp_ms(public.daily_routines_ms(p_setup, 'updatedAt'), p_now);
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
  base jsonb;
  extras jsonb := '[]'::jsonb;
  entry jsonb;
begin
  if public.daily_routines_setup_at(p_other->'setup', p_now)
     > public.daily_routines_setup_at(p_winner->'setup', p_now) then
    kept := jsonb_set(kept, '{setup}', p_other->'setup', true);
  end if;
  if jsonb_typeof(p_other->'added') = 'array' then
    if jsonb_typeof(kept->'added') = 'array' then
      base := kept->'added';
    else
      base := '[]'::jsonb;
    end if;
    for entry in select value from jsonb_array_elements(p_other->'added') with ordinality as e(value, ord) order by ord loop
      if jsonb_typeof(entry) = 'string'
         and not (base @> jsonb_build_array(entry))
         and not (extras @> jsonb_build_array(entry)) then
        extras := extras || jsonb_build_array(entry);
      end if;
    end loop;
    if jsonb_array_length(extras) > 0 then
      kept := jsonb_set(kept, '{added}', base || extras, true);
    end if;
  end if;
  return kept;
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
  left_wins boolean;
begin
  if left_at <> right_at then
    left_wins := left_at > right_at;
  else
    left_wins := public.daily_routines_text_gt(public.daily_routines_stable(left_prefs), public.daily_routines_stable(right_prefs))
      or public.daily_routines_text_eq(public.daily_routines_stable(left_prefs), public.daily_routines_stable(right_prefs));
  end if;
  if left_wins then
    return public.daily_routines_keep_setup(left_prefs, right_prefs, p_now);
  end if;
  return public.daily_routines_keep_setup(right_prefs, left_prefs, p_now);
end;
$$;

revoke all on function public.daily_routines_setup_at(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_keep_setup(jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge_prefs(jsonb, jsonb, numeric) from public, anon, authenticated;
$migration$;
end
$migrate$;
