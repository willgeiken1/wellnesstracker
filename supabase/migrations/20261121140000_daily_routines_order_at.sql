-- A reorder stamps orderAt and leaves updatedAt alone. 20261121110000 ranks
-- by the stored stamp, so two live blocks with the same stamp tie and a swap
-- can be stored as two blocks with the same order. This keeps the stamp
-- winner and, when that winner is live, copies order and orderAt from the
-- live row with the newer orderAt. A tombstone still wins the row.
-- Sits after 20261121110000 and before 20261121183000 so db push can apply
-- 20261121120000 between them. No-ops until daily_routines_merge exists.
-- Safe to run more than once. Does not replace merge_user_data.

do $migrate$
begin
  if to_regprocedure('public.daily_routines_merge(jsonb, jsonb, numeric)') is null then
    raise notice '20261121140000 skipped; apply 20261121110000_daily_routines_source_step.sql first';
    return;
  end if;
  execute $migration$
create or replace function public.daily_routines_apply_order_at(p_merged jsonb, p_stored jsonb, p_incoming jsonb, p_kind text, p_now numeric)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with merged as (
    select e.ord, e.value as row
    from jsonb_array_elements(
      case when jsonb_typeof(p_merged) = 'array' then p_merged else '[]'::jsonb end
    ) with ordinality as e(value, ord)
  ),
  sources as (
    select public.daily_routines_prepare(e.value, p_kind, p_now) as row
    from jsonb_array_elements(
      case when jsonb_typeof(p_incoming) = 'array' then p_incoming else '[]'::jsonb end
      || case when jsonb_typeof(p_stored) = 'array' then p_stored else '[]'::jsonb end
    ) as e(value)
  ),
  best as (
    select distinct on (row->>'id')
      row->>'id' as id,
      (row->>'orderAt')::numeric as order_at,
      row->'order' as ord
    from sources
    where row is not null
      and jsonb_typeof(row->'deletedAt') is distinct from 'number'
      and jsonb_typeof(row->'orderAt') = 'number'
      and (row->>'orderAt')::numeric > 0
      and jsonb_typeof(row->'order') = 'number'
    order by row->>'id', (row->>'orderAt')::numeric desc
  )
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(m.row->'deletedAt') = 'number' then m.row
      when b.order_at is not null
        and b.order_at > coalesce(
          case when jsonb_typeof(m.row->'orderAt') = 'number' then (m.row->>'orderAt')::numeric else 0 end,
          0
        )
        then m.row || jsonb_build_object(
          'order', b.ord,
          'orderAt', public.daily_routines_json_number(b.order_at)
        )
      else m.row
    end
    order by m.ord
  ), '[]'::jsonb)
  from merged m
  left join best b on b.id = m.row->>'id';
$$;

create or replace function public.daily_routines_merge(p_stored jsonb, p_incoming jsonb, p_now numeric)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
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
    'logs', public.daily_routines_merge_list(stored->'logs', p_incoming->'logs', 'logs', p_now),
    'prefs', public.daily_routines_merge_prefs(stored->'prefs', p_incoming->'prefs', p_now)
  );
end;
$$;

revoke all on function public.daily_routines_apply_order_at(jsonb, jsonb, jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.daily_routines_merge(jsonb, jsonb, numeric) from public, anon, authenticated;
$migration$;
end
$migrate$;
