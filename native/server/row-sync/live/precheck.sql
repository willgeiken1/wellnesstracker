-- Read-only pre-check before the one-time row-sync apply on the hosted project.
-- Runs inside a READ ONLY transaction and changes nothing. It raises an error,
-- which stops the apply workflow, if any reserved row-sync name already exists
-- or if the Supabase roles and auth helpers the SQL relies on are missing.
BEGIN TRANSACTION READ ONLY;
DO $$
DECLARE
  reserved text[] := ARRAY['profile','weigh_ins','measurements','routines','routine_exercises','sessions',
    'entries','sets','cardio_sessions','food_entries','saved_foods','food_targets','meals','goals','plan_days',
    'machine_notes','home_layout','settings','photos','custom_exercises','plans','pauses','purges','row_sync_seq'];
  taken text;
BEGIN
  SELECT pg_catalog.string_agg(c.relname, ', ' ORDER BY c.relname) INTO taken
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY (reserved);
  IF taken IS NOT NULL THEN
    RAISE EXCEPTION 'Row-sync names already exist in public: %', taken;
  END IF;
  SELECT pg_catalog.string_agg(p.proname, ', ' ORDER BY p.proname) INTO taken
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('row_sync_guard', 'sync_push', 'sync_purge_range');
  IF taken IS NOT NULL THEN
    RAISE EXCEPTION 'Row-sync functions already exist in public: %', taken;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles
       WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
    RAISE EXCEPTION 'Supabase API roles anon, authenticated and service_role are not all present';
  END IF;
  IF pg_catalog.to_regclass('auth.users') IS NULL OR pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'auth.users or auth.uid() is missing';
  END IF;
  RAISE NOTICE 'Row-sync pre-check passed: no reserved names exist and auth roles are present.';
END $$;
ROLLBACK;
