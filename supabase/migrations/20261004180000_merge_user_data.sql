-- Atomic save of one person's user_data row.
-- The app used to upsert the whole JSON blob. Two phones saving at once could
-- each write an older machineNotes map over the other's newer note.
-- This locks the caller's row and merges machineNotes per exercise: the higher
-- "at" wins, a tie keeps the note already stored, and a missing key never
-- deletes the other side's note. The rest of the blob is the caller's payload.
-- Safe to run more than once.
-- Only the signed-in user can call it, and it writes only auth.uid()'s row.

create or replace function public.machine_note_record(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  kind text;
  txt text;
  at numeric;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return null;
  end if;
  kind := jsonb_typeof(p_value);
  if kind = 'string' then
    txt := btrim(p_value #>> '{}');
    if txt is null or txt = '' then
      return null;
    end if;
    return jsonb_build_object('text', txt, 'at', 0);
  end if;
  if kind <> 'object' then
    return null;
  end if;
  begin
    at := (p_value->>'at')::numeric;
  exception when others then
    at := 0;
  end;
  if at is null or at <= 0 then
    at := 0;
  end if;
  if coalesce(p_value->>'gone', '') = 'true' then
    return jsonb_build_object('text', '', 'at', at, 'gone', true);
  end if;
  txt := btrim(coalesce(p_value->>'text', ''));
  if txt = '' then
    return null;
  end if;
  return jsonb_build_object('text', txt, 'at', at);
end;
$$;

revoke all on function public.machine_note_record(jsonb) from public, anon, authenticated;

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

  update public.user_data
  set data = result,
      updated_at = now()
  where user_id = uid;

  return result;
end;
$$;

revoke all on function public.merge_user_data(jsonb) from public, anon, authenticated;
grant execute on function public.merge_user_data(jsonb) to authenticated;
