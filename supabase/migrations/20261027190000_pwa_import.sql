-- DRAFT ONLY. NOT APPLIED. Requires native/server/row-sync/0001 and 0002 first.
-- HIGH: reviewed rollout ordering is required before any deployment.
BEGIN;
CREATE TABLE public.native_pwa_imports (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL, completed boolean NOT NULL DEFAULT false, plan jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.native_pwa_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_pwa_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.native_pwa_imports TO authenticated;
CREATE POLICY own_import ON public.native_pwa_imports FOR SELECT TO authenticated USING(owner_id=auth.uid());
-- Freeze once under the SAME owner lock as sync_push. No two-way blob bridge.
CREATE FUNCTION public.native_pwa_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); result jsonb; blob jsonb; photo_rows jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.native_pwa_imports WHERE owner_id=owner) THEN
  SELECT data INTO blob FROM public.user_data WHERE user_id=owner;
  blob:=coalesce(blob,'{"version":2,"sessions":[],"workouts":[]}'::jsonb);
  -- Freeze only supported account domains; consent, check-ins and Oura never leave this RPC.
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO blob FROM jsonb_each(blob)
   WHERE key IN ('version','sessions','workouts','templates','profile','food','cardio','measurements','goals','plan','planAt','machineNotes','layout','deleted','purges');
  blob:=jsonb_set(blob,'{sessions}',coalesce(blob->'sessions','[]'::jsonb));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'path',path,'taken_at',taken_at,'day',day,'pose',pose)),'[]'::jsonb)
   INTO photo_rows FROM public.progress_photos WHERE user_id=owner;
  INSERT INTO public.native_pwa_imports(owner_id,snapshot) VALUES(owner,jsonb_build_object('blob',blob,'photos',photo_rows));
 END IF;
 SELECT jsonb_build_object('snapshot',snapshot,'completed',completed,'plan',plan) INTO result FROM public.native_pwa_imports WHERE owner_id=owner;
 RETURN result;
END $$;
-- Edge normalizes the frozen snapshot. Existing rows/tombstones always win.
-- All batches and the completion marker commit or roll back together.
CREATE FUNCTION public.native_pwa_commit(import_plan jsonb, rows jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); item jsonb; present boolean; has_home boolean; has_profile boolean; has_settings boolean; batch jsonb:='[]'; t text;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.native_pwa_imports WHERE owner_id=owner) THEN RAISE EXCEPTION 'Preview required'; END IF;
 IF (SELECT completed FROM public.native_pwa_imports WHERE owner_id=owner) THEN RETURN false; END IF;
 IF jsonb_typeof(rows)<>'array' OR jsonb_typeof(import_plan)<>'object' THEN RAISE EXCEPTION 'Invalid import'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.home_layout WHERE owner_id=owner) INTO has_home;
 SELECT EXISTS(SELECT 1 FROM public.profile WHERE owner_id=owner) INTO has_profile;
 SELECT EXISTS(SELECT 1 FROM public.settings WHERE owner_id=owner) INTO has_settings;
 FOR item IN SELECT value FROM jsonb_array_elements(rows) LOOP
  t:=item->>'table';
  IF t NOT IN ('profile','weigh_ins','measurements','routines','routine_exercises','sessions','entries','sets','cardio_sessions','food_entries','saved_foods','food_targets','meals','goals','plan_days','machine_notes','home_layout','settings','photos') OR (item->>'owner_id')::uuid IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Invalid import row'; END IF;
  IF (t='home_layout' AND has_home) OR (t='profile' AND has_profile) OR (t='settings' AND has_settings) THEN CONTINUE; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE owner_id=$1 AND id=$2)',t) INTO present USING owner,(item->>'id')::uuid;
  IF present THEN CONTINUE; END IF;
  batch:=batch||jsonb_build_array(item);
  IF jsonb_array_length(batch)=100 THEN PERFORM public.sync_push(batch); batch:='[]'; END IF;
 END LOOP;
 IF jsonb_array_length(batch)>0 THEN PERFORM public.sync_push(batch); END IF;
 UPDATE public.native_pwa_imports SET completed=true,plan=import_plan WHERE owner_id=owner;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.native_pwa_snapshot(),public.native_pwa_commit(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_pwa_snapshot(),public.native_pwa_commit(jsonb,jsonb) TO authenticated;
COMMIT;
