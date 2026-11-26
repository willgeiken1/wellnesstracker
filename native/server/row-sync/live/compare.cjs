// Builds live/compare.sql: a read-only comparison of the hosted project's row-sync objects with the shape
// that supabase/migrations plus apply-0001-0002.sql produce. Offline only: no database, no configuration.
// tests/server/row-sync-live-checks.test.ts reads that shape from PGlite, checks compare.sql against it,
// and rewrites the file when ROW_SYNC_WRITE_COMPARE=1.
const tables = ['profile', 'weigh_ins', 'measurements', 'routines', 'routine_exercises', 'sessions', 'entries',
  'sets', 'cardio_sessions', 'food_entries', 'saved_foods', 'food_targets', 'meals', 'goals', 'plan_days',
  'machine_notes', 'home_layout', 'settings', 'photos', 'custom_exercises', 'plans', 'pauses', 'purges'];
const functions = ['row_sync_guard', 'sync_push', 'sync_purge_range', 'native_pwa_invalidate_on_purge'];

const list = (names) => names.map((n) => `'${n}'`).join(',');

// One line of text per fact. Only stable catalog output is used, so the lines read the same on PGlite and
// on the hosted Postgres: column types with length and precision, nullability, defaults, identity and generated
// columns, column-level grants, forced RLS and replica identity, constraints, policy names with their command,
// roles and expressions, enabled triggers, index definitions, every table privilege of the API roles, the
// sequence with its settings and privileges, and each function's arguments, security, settings, owner and a
// hash of its body. compare.sql sets search_path to public first, because deparsed names depend on it.
// NOT NULL constraints (contype 'n') are left out: Postgres 18 lists them in pg_constraint and older versions
// don't, and each column's "not null" fact already compares nullability.
const tablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const sequencePrivileges = ['USAGE', 'SELECT', 'UPDATE'];
const privilegeList = (check, privileges) => `COALESCE(NULLIF(pg_catalog.concat_ws(',',
            ${privileges.map((p) => `CASE WHEN ${check(p)} THEN '${p.toLowerCase()}' END`).join(',\n            ')}), ''), 'none')`;
const shape = `
  WITH t(name) AS (SELECT pg_catalog.unnest(ARRAY[${list(tables)}]::text[])),
  rel AS (SELECT t.name, c.oid FROM t JOIN pg_catalog.pg_class c ON c.relname = t.name
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' AND c.relkind = 'r'),
  att AS (SELECT rel.name, a.* FROM rel JOIN pg_catalog.pg_attribute a
            ON a.attrelid = rel.oid AND a.attnum > 0 AND NOT a.attisdropped),
  seq AS (SELECT c.oid, c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname = 'row_sync_seq'),
  f AS (SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN (${list(functions)})),
  api(role) AS (VALUES ('anon'), ('authenticated'))
  SELECT 'table ' || name FROM rel
  UNION ALL SELECT 'column ' || att.name || '.' || att.attname || ' '
       || pg_catalog.format_type(att.atttypid, att.atttypmod)
       || CASE WHEN att.attnotnull THEN ' not null' ELSE '' END
       || COALESCE(' default ' || pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
       || CASE WHEN att.attidentity <> '' THEN ' identity ' || att.attidentity::text ELSE '' END
       || CASE WHEN att.attgenerated <> '' THEN ' generated ' || att.attgenerated::text ELSE '' END
    FROM att LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = att.attrelid AND d.adnum = att.attnum
  UNION ALL SELECT 'column grant ' || att.name || '.' || att.attname || ' ' || att.attacl::text
    FROM att WHERE att.attacl IS NOT NULL
  UNION ALL SELECT 'rls ' || rel.name || CASE WHEN c.relrowsecurity THEN ' on' ELSE ' off' END
       || CASE WHEN c.relforcerowsecurity THEN ' forced' ELSE '' END || ' replica ' || c.relreplident::text
    FROM rel JOIN pg_catalog.pg_class c ON c.oid = rel.oid
  UNION ALL SELECT 'constraint ' || rel.name || '.' || k.conname || ' ' || k.contype::text || ' '
       || pg_catalog.md5(pg_catalog.pg_get_constraintdef(k.oid))
    FROM rel JOIN pg_catalog.pg_constraint k ON k.conrelid = rel.oid AND k.contype <> 'n'
  UNION ALL SELECT 'policy ' || p.tablename || '.' || p.policyname || ' ' || p.cmd || ' ' || p.permissive
       || ' ' || pg_catalog.array_to_string(p.roles, ',') || ' using ' || COALESCE(p.qual, '-')
       || ' check ' || COALESCE(p.with_check, '-')
    FROM pg_catalog.pg_policies p JOIN rel ON rel.name = p.tablename WHERE p.schemaname = 'public'
  UNION ALL SELECT 'trigger ' || rel.name || '.' || g.tgname || ' ' || g.tgenabled::text || ' '
       || pg_catalog.md5(pg_catalog.pg_get_triggerdef(g.oid))
    FROM rel JOIN pg_catalog.pg_trigger g ON g.tgrelid = rel.oid AND NOT g.tgisinternal
  UNION ALL SELECT 'index ' || i.tablename || '.' || i.indexname || ' ' || pg_catalog.md5(i.indexdef)
    FROM pg_catalog.pg_indexes i JOIN rel ON rel.name = i.tablename WHERE i.schemaname = 'public'
  UNION ALL SELECT 'grant ' || api.role || ' ' || rel.name || ' '
       || ${privilegeList((p) => `pg_catalog.has_table_privilege(api.role, rel.oid, '${p}')`, tablePrivileges)}
    FROM rel CROSS JOIN api
  UNION ALL SELECT 'sequence ' || seq.relname || ' ' || s.seqtypid::regtype::text || ' start ' || s.seqstart
       || ' increment ' || s.seqincrement || ' min ' || s.seqmin || ' max ' || s.seqmax
       || CASE WHEN s.seqcycle THEN ' cycle' ELSE '' END
    FROM seq JOIN pg_catalog.pg_sequence s ON s.seqrelid = seq.oid
  UNION ALL SELECT 'sequence grant ' || api.role || ' ' || seq.relname || ' '
       || ${privilegeList((p) => `pg_catalog.has_sequence_privilege(api.role, seq.oid, '${p}')`, sequencePrivileges)}
    FROM seq CROSS JOIN api
  UNION ALL SELECT 'function ' || f.proname || '(' || pg_catalog.pg_get_function_identity_arguments(f.oid) || ')'
       || ' returns ' || pg_catalog.pg_get_function_result(f.oid)
       || CASE WHEN f.prosecdef THEN ' definer' ELSE ' invoker' END
       || ' ' || COALESCE(pg_catalog.array_to_string(f.proconfig, ','), '-')
       || ' owner ' || f.proowner::regrole::text
       || ' body ' || pg_catalog.md5(f.prosrc)
    FROM f
  UNION ALL SELECT 'execute ' || api.role || ' ' || f.proname || ' '
       || CASE WHEN pg_catalog.has_function_privilege(api.role, f.oid, 'EXECUTE') THEN 'yes' ELSE 'no' END
    FROM f CROSS JOIN api`;

const quote = (line) => `'${line.replace(/'/g, "''")}'`;

function buildCompare(expected) {
  const lines = [...expected].sort();
  return `-- Read-only comparison of the hosted project's row-sync objects with the reviewed plan. Changes nothing.
-- Generated by live/compare.cjs from supabase/migrations plus apply-0001-0002.sql (${lines.length} facts).
-- Lists every difference in one error: "missing" is in the plan but not live, "unexpected" is live but not
-- in the plan. Columns, defaults, column grants, forced RLS, constraints, policies, triggers, indexes, API
-- grants, the sequence and its grants, and the four row-sync functions (arguments, security, settings, owner,
-- body hash) are compared.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public;
DO $$
DECLARE
  expected text[] := ARRAY[
    ${lines.map(quote).join(',\n    ')}
  ]::text[];
  live text[];
  report text;
BEGIN
  SELECT pg_catalog.array_agg(COALESCE(line, 'unreadable fact') ORDER BY line) INTO live FROM (${shape}
  ) AS shape(line);
  SELECT pg_catalog.string_agg(kind || ': ' || line, E'\\n' ORDER BY line, kind) INTO report FROM (
    SELECT 'missing' AS kind, e AS line FROM pg_catalog.unnest(expected) e
     WHERE e <> ALL (COALESCE(live, ARRAY[]::text[]))
    UNION ALL
    SELECT 'unexpected', l FROM pg_catalog.unnest(live) l WHERE l <> ALL (expected)
  ) AS d;
  IF report IS NOT NULL THEN
    RAISE EXCEPTION E'Row-sync on this database differs from the plan:\\n%', report;
  END IF;
  RAISE NOTICE 'Row-sync matches the plan: % facts compared.', pg_catalog.array_length(expected, 1);
END $$;
SELECT 'Row-sync matches the plan' AS result;
ROLLBACK;
`;
}

module.exports = { tables, functions, shape, buildCompare };
