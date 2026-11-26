import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './pglite';
import { syncedTables } from '../../src/data/catalog';
const directory = join(__dirname, '../../server/row-sync');
const sql = (name: string) => readFileSync(join(directory, name), 'utf8');
const precheck = sql('live/precheck.sql');
const verify = sql('live/verify.sql');
// Same state as the hosted project: every supabase/migrations file, no row-sync yet.
let db: PGlite;
beforeAll(async () => { db = await migratedDatabase(); });
afterAll(async () => { await db?.close(); });
async function fails(script: string, message: RegExp) {
  await expect(db.exec(script)).rejects.toThrow(message);
  await db.exec('ROLLBACK');
}
test('both live checks list exactly the 23 catalog tables', () => {
  const listed = (script: string) => script.match(/ARRAY\[([^\]]+)\]/)![1].match(/'([a-z_]+)'/g)!.map(s => s.slice(1, -1));
  expect(listed(verify)).toEqual([...syncedTables]);
  expect(listed(precheck)).toEqual([...syncedTables, 'row_sync_seq']);
});
test('pre-check passes on the migrated schema, verify fails before the apply', async () => {
  await db.exec(precheck);
  await fails(verify, /Missing row-sync table profile/);
});
test('the apply wrapper runs on the migrated schema; then verify passes and pre-check refuses a second apply', async () => {
  await db.exec(sql('apply-0001-0002.sql'));
  const [, , owner] = await db.exec(verify);
  expect(owner.rows).toHaveLength(1);
  await fails(precheck, /Row-sync names already exist in public: .*profile/);
  await expect(db.exec(sql('apply-0001-0002.sql'))).rejects.toThrow();
  await db.exec('ROLLBACK');
});
test('checks are read-only transactions that change nothing', async () => {
  for (const script of [precheck, verify]) {
    expect(script).toMatch(/^BEGIN TRANSACTION READ ONLY;$/m);
    expect(script.trimEnd()).toMatch(/ROLLBACK;$/);
    expect(script).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\s/);
  }
});
test('verify catches a weakened table', async () => {
  await db.exec('BEGIN; ALTER TABLE public.meals NO FORCE ROW LEVEL SECURITY;');
  await expect(db.exec(verify.replace('BEGIN TRANSACTION READ ONLY;', ''))).rejects.toThrow(/not forced on meals/);
  await db.exec('ROLLBACK');
  await db.exec(verify);
});
// compare.sql holds the full expected shape, read here from PGlite after the reviewed apply.
// Rebuild it with ROW_SYNC_WRITE_COMPARE=1 when 0001, 0002 or the migrations change.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compareBuilder = require('../../server/row-sync/live/compare.cjs');
const stripLiterals = (script: string) => script.replace(/'(?:[^']|'')*'/g, "''");
describe('full comparison (live/compare.sql)', () => {
  let compare: string;
  test('compare.sql is the shape the reviewed apply produces', async () => {
    const result = await db.transaction(async tx => {
      await tx.query('SET LOCAL search_path = public');
      return tx.query<{ line: string }>(`SELECT line FROM (${compareBuilder.shape}) AS shape(line)`);
    });
    const built = compareBuilder.buildCompare(result.rows.map(r => r.line));
    if (process.env.ROW_SYNC_WRITE_COMPARE === '1') writeFileSync(join(directory, 'live/compare.sql'), built);
    compare = sql('live/compare.sql');
    expect(compare).toBe(built);
    expect(compareBuilder.tables).toEqual([...syncedTables]);
    const lines = result.rows.map(r => r.line);
    for (const t of syncedTables) {
      expect(lines).toContain(`table ${t}`);
      expect(lines).toContain(`rls ${t} on forced replica d`);
    }
    expect(lines.filter(l => l.startsWith('sequence row_sync_seq '))).toHaveLength(1);
    expect(lines).toContain('sequence grant anon row_sync_seq none');
    expect(lines).toContain('sequence grant authenticated row_sync_seq usage');
    expect(lines.some(l => l.startsWith('constraint '))).toBe(true);
    expect(lines.filter(l => l.startsWith('function '))).toHaveLength(4);
  });
  test('compare passes on the applied schema', async () => {
    const [, , , done] = await db.exec(compare);
    expect(done.rows).toEqual([{ result: 'Row-sync matches the plan' }]);
  });
  test('compare does not depend on the caller\'s search_path', async () => {
    await db.exec('SET search_path = pg_catalog');
    try {
      const [, , , done] = await db.exec(compare);
      expect(done.rows).toEqual([{ result: 'Row-sync matches the plan' }]);
    } finally { await db.exec('RESET search_path'); }
  });
  test('compare is a read-only transaction', () => {
    expect(compare).toMatch(/^BEGIN TRANSACTION READ ONLY;$/m);
    expect(compare.trimEnd()).toMatch(/ROLLBACK;$/);
    expect(stripLiterals(compare)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\s/);
  });
  test('compare lists every drift in one error', async () => {
    await db.exec(`BEGIN;
      ALTER TABLE public.meals NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE public.goals ADD COLUMN stray text;
      GRANT EXECUTE ON FUNCTION public.sync_push(jsonb) TO anon;
      GRANT TRUNCATE ON public.sets TO authenticated;
      GRANT USAGE ON SEQUENCE public.row_sync_seq TO anon;
      ALTER TABLE public.plans DROP CONSTRAINT plans_pkey CASCADE;`);
    const body = compare.replace('BEGIN TRANSACTION READ ONLY;\nSET LOCAL search_path = public;', 'SET LOCAL search_path = public;').replace(/ROLLBACK;\s*$/, '');
    const error = await db.exec(body).then(() => null, (e: Error) => e.message);
    await db.exec('ROLLBACK');
    expect(error).toMatch(/missing: rls meals on forced/);
    expect(error).toMatch(/unexpected: rls meals on replica d/);
    expect(error).toMatch(/unexpected: column goals\.stray text/);
    expect(error).toMatch(/missing: execute anon sync_push no/);
    expect(error).toMatch(/unexpected: execute anon sync_push yes/);
    expect(error).toMatch(/unexpected: grant authenticated sets select,insert,update,truncate/);
    expect(error).toMatch(/unexpected: sequence grant anon row_sync_seq usage/);
    expect(error).toMatch(/missing: constraint plans\.plans_pkey p /);
    await db.exec(compare);
  });
  test('compare fails on a schema without row-sync', async () => {
    const fresh = await migratedDatabase();
    try {
      await expect(fresh.exec(compare)).rejects.toThrow(/missing: table profile/);
    } finally { await fresh.close(); }
  });
});
