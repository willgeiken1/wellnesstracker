-- DRAFT ONLY. NOT APPLIED. Row import requires native/server/row-sync/0001 and 0002.
-- HIGH: reviewed rollout ordering is required before any deployment.
BEGIN;
CREATE TABLE public.native_pwa_imports (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL, completed boolean NOT NULL DEFAULT false, plan jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 preview_id uuid NOT NULL DEFAULT gen_random_uuid()
);
ALTER TABLE public.native_pwa_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_pwa_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.native_pwa_imports TO authenticated;
CREATE POLICY own_import ON public.native_pwa_imports FOR SELECT TO authenticated USING(owner_id=auth.uid());
-- Durable range/cutoff receipts are independent of short-lived raw previews.
CREATE TABLE public.native_pwa_purges (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 from_day text NOT NULL, to_day text NOT NULL, cutoff_ms bigint NOT NULL,
 tz text NOT NULL DEFAULT 'UTC',
 CHECK (from_day <= to_day), CHECK (cutoff_ms BETWEEN 0 AND 9007199254740991)
);
CREATE INDEX native_pwa_purges_owner ON public.native_pwa_purges(owner_id);
ALTER TABLE public.native_pwa_purges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_pwa_purges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.native_pwa_purges TO authenticated;
CREATE POLICY own_purge ON public.native_pwa_purges FOR SELECT TO authenticated USING(owner_id=auth.uid());
-- Preserve markers written before the importer was installed.
DO $$ BEGIN
 IF pg_catalog.to_regclass('public.purges') IS NOT NULL THEN
  INSERT INTO public.native_pwa_purges SELECT owner_id,from_day,to_day,cutoff_ms,tz
   FROM public.purges WHERE deleted_at IS NULL AND cutoff_ms IS NOT NULL;
 END IF;
END $$;
-- Freeze once under the SAME owner lock as sync_push. No two-way blob bridge.
CREATE FUNCTION public.native_pwa_snapshot(refresh_expired boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); result jsonb; blob jsonb; photo_rows jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
 -- Sweep on every preview/commit lookup, including other owners' abandoned archives.
 -- Successful import receipts never expire; purge receipts live separately.
 DELETE FROM public.native_pwa_imports WHERE NOT completed AND created_at < now()-interval '15 minutes';
 IF NOT EXISTS(SELECT 1 FROM public.native_pwa_imports WHERE owner_id=owner) THEN
  -- Commit reads an existing preview only; it must not freeze a new snapshot.
  IF NOT refresh_expired THEN RETURN NULL; END IF;
  SELECT data INTO blob FROM public.user_data WHERE user_id=owner;
  blob:=coalesce(blob,'{"version":2,"sessions":[],"workouts":[]}'::jsonb);
  -- Freeze only supported account domains; consent, check-ins and Oura never leave this RPC.
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO blob FROM jsonb_each(blob)
   WHERE key IN ('version','restSeconds','sessions','workouts','templates','profile','food','cardio','measurements','goals','plan','planAt','machineNotes','layout','deleted','purges');
  blob:=jsonb_set(blob,'{sessions}',coalesce(blob->'sessions','[]'::jsonb));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'path',path,'taken_at',taken_at,'day',day,'pose',pose)),'[]'::jsonb)
   INTO photo_rows FROM public.progress_photos WHERE user_id=owner;
  IF octet_length(jsonb_build_object('blob',blob,'photos',photo_rows,'purges',coalesce((SELECT jsonb_agg(jsonb_build_object('from_day',from_day,'to_day',to_day,'cutoff_ms',cutoff_ms,'tz',tz)) FROM public.native_pwa_purges WHERE owner_id=owner),'[]'::jsonb))::text)>5242880 THEN RAISE EXCEPTION 'Import too large'; END IF;
  INSERT INTO public.native_pwa_imports(owner_id,snapshot) VALUES(owner,jsonb_build_object('blob',blob,'photos',photo_rows,'purges',coalesce((SELECT jsonb_agg(jsonb_build_object('from_day',from_day,'to_day',to_day,'cutoff_ms',cutoff_ms,'tz',tz)) FROM public.native_pwa_purges WHERE owner_id=owner),'[]'::jsonb)));
 END IF;
 SELECT jsonb_build_object('snapshot',snapshot,'completed',completed,'plan',plan,'preview_id',preview_id) INTO result FROM public.native_pwa_imports WHERE owner_id=owner;
 RETURN result;
END $$;
-- Edge normalizes the frozen snapshot. Existing rows/tombstones always win.
-- All batches and the completion marker commit or roll back together.
CREATE FUNCTION public.native_pwa_commit(import_plan jsonb, rows jsonb, expected_preview uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); item jsonb; present boolean; has_home boolean; has_profile boolean; has_settings boolean; batch jsonb:='[]'; t text; source_time bigint; skipped text[]:=ARRAY[]::text[];
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
 -- NULL is a preview conflict receipt, allowing the expiry sweep to commit.
 DELETE FROM public.native_pwa_imports WHERE NOT completed AND created_at < now()-interval '15 minutes';
 IF NOT EXISTS(SELECT 1 FROM public.native_pwa_imports WHERE owner_id=owner) THEN RETURN NULL; END IF;
 IF (SELECT completed FROM public.native_pwa_imports WHERE owner_id=owner) THEN RETURN false; END IF;
 IF expected_preview IS DISTINCT FROM (SELECT preview_id FROM public.native_pwa_imports WHERE owner_id=owner) THEN RETURN NULL; END IF;
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_typeof(import_plan) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid import'; END IF;
 -- Resolve descendants before writing, including direct child-first batches.
 WITH RECURSIVE candidates AS (
  SELECT value AS item,
   CASE WHEN coalesce((value->>'source_created_at')::bigint,0)
     BETWEEN 0 AND (extract(epoch FROM clock_timestamp())*1000)::bigint+60000
    THEN coalesce((value->>'source_created_at')::bigint,0) ELSE 0 END AS created_ms
  FROM jsonb_array_elements(rows)
 ), blocked(id) AS (
  SELECT c.item->>'id' FROM candidates c
  WHERE EXISTS(SELECT 1 FROM public.native_pwa_purges p
   WHERE p.owner_id=owner AND c.created_ms<=p.cutoff_ms
    AND ((c.item->>'table' IN ('sessions','weigh_ins','measurements','cardio_sessions','food_entries','plan_days')
      AND c.item->'data'->>'day' BETWEEN p.from_day AND p.to_day)
     OR (c.item->>'table'='photos' AND pg_catalog.to_char(
       (pg_catalog.to_timestamp((c.item->'data'->>'captured_at')::double precision/1000)
         AT TIME ZONE p.tz)::date,'YYYY-MM-DD') BETWEEN p.from_day AND p.to_day)))
  UNION
  SELECT c.item->>'id' FROM candidates c JOIN blocked b
   ON coalesce(c.item->'data'->>'session_id',c.item->'data'->>'entry_id')=b.id
   WHERE c.item->>'table' IN ('entries','sets')
 ) SELECT coalesce(array_agg(id),ARRAY[]::text[]) INTO skipped FROM blocked;
 SELECT EXISTS(SELECT 1 FROM public.home_layout WHERE owner_id=owner) INTO has_home;
 SELECT EXISTS(SELECT 1 FROM public.profile WHERE owner_id=owner) INTO has_profile;
 SELECT EXISTS(SELECT 1 FROM public.settings WHERE owner_id=owner) INTO has_settings;
 FOR item IN SELECT value FROM jsonb_array_elements(rows) LOOP
  t:=item->>'table';
  IF t NOT IN ('profile','weigh_ins','measurements','routines','routine_exercises','sessions','entries','sets','cardio_sessions','food_entries','saved_foods','food_targets','meals','goals','plan_days','machine_notes','home_layout','settings','photos') OR (item->>'owner_id')::uuid IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Invalid import row'; END IF;
  IF jsonb_typeof(item->'data') IS DISTINCT FROM 'object' OR (item->'data') ?| ARRAY['owner_id','id','device_id','updated_at','deleted_at','server_seq'] THEN RAISE EXCEPTION 'Invalid import row identity'; END IF;
  source_time:=coalesce((item->>'source_created_at')::bigint,0);
  IF source_time < 0 OR source_time > (extract(epoch FROM clock_timestamp())*1000)::bigint+60000 THEN source_time:=0; END IF;
  IF item->>'id'=ANY(skipped) THEN CONTINUE; END IF;
  -- Keep source creation time for the existing row-sync range/cutoff guard.
  item:=jsonb_set(item-'source_created_at','{updated_at}',to_jsonb(greatest(1,source_time)));
  IF (t='home_layout' AND has_home) OR (t='profile' AND has_profile) OR (t='settings' AND has_settings) THEN CONTINUE; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE owner_id=$1 AND id=$2)',t) INTO present USING owner,(item->>'id')::uuid;
  IF present THEN CONTINUE; END IF;
  batch:=batch||jsonb_build_array(item);
  IF jsonb_array_length(batch)=100 THEN PERFORM public.sync_push(batch); batch:='[]'; END IF;
 END LOOP;
 IF jsonb_array_length(batch)>0 THEN PERFORM public.sync_push(batch); END IF;
 UPDATE public.native_pwa_imports SET completed=true,snapshot='{}'::jsonb,plan=NULL WHERE owner_id=owner;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.native_pwa_snapshot(boolean),public.native_pwa_commit(jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_pwa_snapshot(boolean),public.native_pwa_commit(jsonb,jsonb,uuid) TO authenticated;

-- Either install order is supported. Row-sync/0002 also installs this function
-- and always creates the trigger when it creates purges. Legacy privacy RPCs
-- below work without row-sync. Invalidation uses sync_purge_range's owner lock.
CREATE OR REPLACE FUNCTION public.native_pwa_invalidate_on_purge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Row-sync may be installed before the importer migration.
 IF pg_catalog.to_regclass('public.native_pwa_imports') IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_id::text,0));
 IF NEW.deleted_at IS NULL AND NEW.cutoff_ms IS NOT NULL THEN
  INSERT INTO public.native_pwa_purges(owner_id,from_day,to_day,cutoff_ms,tz)
   VALUES(NEW.owner_id,NEW.from_day,NEW.to_day,NEW.cutoff_ms,NEW.tz);
  DELETE FROM public.native_pwa_imports WHERE owner_id=NEW.owner_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.native_pwa_invalidate_on_purge() FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF pg_catalog.to_regclass('public.purges') IS NOT NULL THEN
  CREATE OR REPLACE TRIGGER native_pwa_purge AFTER INSERT ON public.purges
   FOR EACH ROW EXECUTE FUNCTION public.native_pwa_invalidate_on_purge();
 END IF;
END $$;

-- Extend existing privacy entry points; no SQL or functions applied here.
create or replace function public.delete_user_rows(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_user is null then
    raise exception 'missing user';
  end if;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
  DELETE FROM public.native_pwa_imports WHERE owner_id=p_user;
  DELETE FROM public.native_pwa_purges WHERE owner_id=p_user;

  if to_regclass('public.shared_items') is not null then
    delete from public.reports
    where reporter_id = p_user
       or shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user)
       or comment_id in (
         select c.id from public.comments c
         where c.author_id = p_user
            or c.shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user)
       );
    delete from public.reactions
    where user_id = p_user
       or shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user);
    delete from public.comments
    where author_id = p_user
       or shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user);
    delete from public.shared_items where owner_id = p_user;
    delete from public.friend_invites where owner_id = p_user;
    delete from public.friendships
    where requester_id = p_user or addressee_id = p_user;
    delete from public.blocks
    where blocker_id = p_user or blocked_id = p_user;
    delete from public.social_settings where user_id = p_user;
  end if;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id = $1', r.table_name) using p_user;
  end loop;
end;
$$;

create or replace function public.purge_user_range_rows(p_user uuid, p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  col text;
begin
  if p_user is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'bad range';
  end if;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
  -- Invalidate the preview, retaining only range/cutoff metadata for later imports.
  INSERT INTO public.native_pwa_purges(owner_id,from_day,to_day,cutoff_ms)
    VALUES(p_user,p_from::text,p_to::text,(extract(epoch FROM clock_timestamp())*1000)::bigint);
  DELETE FROM public.native_pwa_imports WHERE owner_id=p_user;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (
        'user_data', 'ai_usage', 'oura_tokens', 'oura_connections', 'oura_oauth_states', 'progress_photos',
        'social_settings', 'friendships', 'friend_invites', 'shared_items', 'comments', 'reactions', 'reports', 'blocks'
      )
  loop
    select c.column_name into col
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name in ('day', 'date')
      and c.data_type = 'date'
    order by case c.column_name when 'day' then 0 else 1 end
    limit 1;
    if col is not null then
      execute format('delete from public.%I where user_id = $1 and %I >= $2 and %I <= $3', r.table_name, col, col)
        using p_user, p_from, p_to;
    end if;
  end loop;
end;
$$;

revoke all on function public.delete_user_rows(uuid) from public, anon, authenticated;
revoke all on function public.purge_user_range_rows(uuid, date, date) from public, anon, authenticated;
grant execute on function public.delete_user_rows(uuid) to service_role;
grant execute on function public.purge_user_range_rows(uuid, date, date) to service_role;

COMMIT;
