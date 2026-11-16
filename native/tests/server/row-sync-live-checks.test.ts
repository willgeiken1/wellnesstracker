import { readFileSync } from 'node:fs';
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
