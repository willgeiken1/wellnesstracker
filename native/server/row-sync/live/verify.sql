-- Read-only check after the row-sync apply on the hosted project. Changes nothing.
-- Raises an error unless all 23 row tables, their owner policies, forced RLS,
-- guard triggers, cursor indexes, the sequence and both RPCs are in place, and
-- anonymous callers cannot reach the RPCs.
BEGIN TRANSACTION READ ONLY;
DO $$
DECLARE
  tables text[] := ARRAY['profile','weigh_ins','measurements','routines','routine_exercises','sessions',
    'entries','sets','cardio_sessions','food_entries','saved_foods','food_targets','meals','goals','plan_days',
    'machine_notes','home_layout','settings','photos','custom_exercises','plans','pauses','purges'];
  t text;
  rel regclass;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    rel := pg_catalog.to_regclass('public.' || t);
    IF rel IS NULL THEN RAISE EXCEPTION 'Missing row-sync table %', t; END IF;
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = rel) THEN
      RAISE EXCEPTION 'Row level security is not forced on %', t;
    END IF;
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = t) <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one owner policy on %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                    WHERE tgrelid = rel AND tgfoid = 'public.row_sync_guard()'::regprocedure
                      AND tgenabled = 'O' AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'Guard trigger missing or disabled on %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_indexes
                    WHERE schemaname = 'public' AND tablename = t AND indexdef LIKE '%(owner_id, server_seq)%') THEN
      RAISE EXCEPTION 'Cursor index (owner_id, server_seq) missing on %', t;
    END IF;
    IF pg_catalog.has_table_privilege('anon', rel, 'SELECT') THEN
      RAISE EXCEPTION 'anon can read %', t;
    END IF;
  END LOOP;
  IF pg_catalog.to_regclass('public.row_sync_seq') IS NULL THEN RAISE EXCEPTION 'Missing row_sync_seq'; END IF;
  IF pg_catalog.to_regprocedure('public.sync_push(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.sync_purge_range(uuid,date,date,bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing sync_push or sync_purge_range';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.sync_push(jsonb)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.sync_purge_range(uuid,date,date,bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute a row-sync RPC';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.sync_push(jsonb)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.sync_purge_range(uuid,date,date,bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute a row-sync RPC';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                  WHERE tgrelid = 'public.purges'::regclass AND tgname = 'native_pwa_purge' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Importer purge trigger native_pwa_purge is missing on purges';
  END IF;
  RAISE NOTICE 'Row-sync verify passed for all 23 tables.';
END $$;
-- Recorded for the apply ledger (README M1-04 checklist): the definer of the purge RPC.
SELECT r.rolname AS sync_purge_range_owner, r.rolbypassrls
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
 WHERE p.oid = 'public.sync_purge_range(uuid,date,date,bigint,text)'::regprocedure;
ROLLBACK;
