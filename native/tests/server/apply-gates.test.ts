import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { serverDatabase, asUser, testTransport } from './pglite';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import { syncedTables, type Table } from '../../src/data/catalog';
const directory = join(__dirname, '../../server/row-sync');
const sql = (name: string) => readFileSync(join(directory, name), 'utf8');
let db: PGlite;
beforeAll(async () => { db = await serverDatabase(sql('apply-0001-0002.sql')); });
afterAll(async () => { await db?.close(); });
test('wrapper is deterministic and all four ledger hashes match', () => {
  const { buildApply, verifyLedger } = require('../../server/row-sync/artifacts.cjs');
  expect(sql('apply-0001-0002.sql')).toBe(buildApply());
  expect(verifyLedger()).toBe(true);
});
test.each(syncedTables)('%s has owner policy, forced RLS, guard, cursor index and exact grants', async table => {
  expect(syncedTables).toHaveLength(23);
  expect((await db.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass', [`public.${table}`])).rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  const policies = (await db.query<{qual:string;with_check:string}>("SELECT qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=$1", [table])).rows;
  expect(policies).toHaveLength(1);
  expect(policies[0].qual).toMatch(/owner_id.*auth.uid/);
  expect(policies[0].with_check).toMatch(/owner_id.*auth.uid/);
  expect((await db.query("SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND tgfoid='public.row_sync_guard()'::regprocedure AND tgenabled='O' AND NOT tgisinternal", [`public.${table}`])).rows).toHaveLength(1);
  const indexes = (await db.query<{indexdef:string}>("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1",[table])).rows;
  expect(indexes.some(i => /\(owner_id, server_seq\)/.test(i.indexdef))).toBe(true);
  for (const role of ['anon','authenticated']) for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    expect((await db.query<{allowed:boolean}>('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,`public.${table}`,privilege])).rows[0].allowed)
      .toBe(role==='authenticated' && (table==='purges' ? privilege==='SELECT' : ['SELECT','INSERT','UPDATE'].includes(privilege)));
  }
});
async function snapshot(owner: string) {
  return Promise.all(syncedTables.map(async table => (await db.query(`SELECT * FROM public.${table} WHERE owner_id=$1 ORDER BY id`,[owner])).rows));
}
const dated = ['sessions','weigh_ins','measurements','cardio_sessions','food_entries','plan_days'];
function rangeRow(table: Table, owner: string) {
  const row = {...syntheticRow(table), owner_id: owner};
  if (dated.includes(table)) row.data = {...row.data,day:'2026-01-01'};
  if (table==='entries') row.data = {session_id:row.id};
  if (table==='sets') row.data = {entry_id:row.id};
  if (table==='photos') row.data = {captured_at:Date.parse('2026-01-01T12:00:00Z')};
  return row;
}
test('records definer owner/BYPASSRLS and rechecks A/B isolation under that owner', async () => {
  const owner = (await db.query<{owner:string;rolbypassrls:boolean;prosecdef:boolean}>("SELECT r.rolname AS owner,r.rolbypassrls,p.prosecdef FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='public.sync_purge_range(uuid,date,date,bigint,text)'::regprocedure")).rows[0];
  expect(owner).toMatchObject({rolbypassrls:true,prosecdef:true});
  console.info('PGlite sync_purge_range owner:', owner.owner, 'rolbypassrls:', owner.rolbypassrls);
  for (const role of ['anon','authenticated','service_role']) {
    expect((await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,'public.sync_purge_range(uuid,date,date,bigint,text)','EXECUTE') AS allowed",[role])).rows[0].allowed).toBe(role==='authenticated');
  }
  for (const table of syncedTables.filter(t => t!=='purges')) {
    const row = rangeRow(table,OWNER_B);
    await testTransport(db,OWNER_B).push([row]);
    expect((await asUser(db,OWNER_A,tx=>tx.query(`SELECT * FROM public.${table}`))).rows).toEqual([]);
    expect((await asUser(db,OWNER_A,tx=>tx.query(`UPDATE public.${table} SET updated_at=200 RETURNING id`))).rows).toEqual([]);
    await expect(testTransport(db,OWNER_A).push([row])).rejects.toThrow();
  }
  await asUser(db,OWNER_B,tx=>tx.query("SELECT public.sync_purge_range($1,'2000-01-01','2000-01-01',0,'UTC')",['40000000-0000-4000-8000-000000000001']));
  const before = await snapshot(OWNER_B);
  for (const table of syncedTables.filter(t=>t!=='purges')) await testTransport(db,OWNER_A).push([rangeRow(table,OWNER_A)]);
  await asUser(db,OWNER_A,tx=>tx.query("SELECT public.sync_purge_range($1,'0001-01-01','9999-12-31',1000,'UTC')",['40000000-0000-4000-8000-000000000002']));
  expect(await snapshot(OWNER_B)).toEqual(before);
  for (const table of [...dated,'entries','sets','photos']) {
    expect((await db.query(`SELECT id FROM public.${table} WHERE owner_id=$1 AND deleted_at IS NOT NULL`,[OWNER_A])).rows).toHaveLength(1);
  }
  expect((await asUser(db,OWNER_A,tx=>tx.query('SELECT owner_id FROM public.purges'))).rows).toEqual([{owner_id:OWNER_A}]);
  await expect(asUser(db,OWNER_A,tx=>tx.query('UPDATE public.purges SET cutoff_ms=1 WHERE owner_id=$1',[OWNER_B]))).rejects.toThrow(/permission denied/);
});
test('F3 auth cascade clears all 23 tables for A, including live rows and tombstones; preserves B', async () => {
  for (const owner of [OWNER_A,OWNER_B]) for (const table of syncedTables.filter(t=>t!=='purges')) {
    const base = {...syntheticRow(table),owner_id:owner};
    await testTransport(db,owner).push([{...base,id:'50000000-0000-4000-8000-000000000001',updated_at:1001}, {...base,id:'50000000-0000-4000-8000-000000000002',updated_at:1002,deleted_at:1002}]);
  }
  for (const table of syncedTables) expect((await db.query(`SELECT id FROM public.${table} WHERE owner_id=$1`,[OWNER_A])).rows.length).toBeGreaterThan(0);
  for (const table of syncedTables.filter(t=>t!=='purges')) for (const state of ['IS NULL','IS NOT NULL']) {
    expect((await db.query(`SELECT id FROM public.${table} WHERE owner_id=$1 AND deleted_at ${state}`,[OWNER_A])).rows.length).toBeGreaterThan(0);
  }
  const before = await snapshot(OWNER_B);
  await db.query('DELETE FROM auth.users WHERE id=$1',[OWNER_A]);
  for (const table of syncedTables) expect((await db.query(`SELECT id FROM public.${table} WHERE owner_id=$1`,[OWNER_A])).rows).toEqual([]);
  expect(await snapshot(OWNER_B)).toEqual(before);
});
test('repeat apply fails cleanly; exact rollback preserves auth/unrelated tables; reapply works', async () => {
  await db.exec('CREATE TABLE public.unrelated(id integer); INSERT INTO public.unrelated VALUES (42)');
  await expect(db.exec(sql('apply-0001-0002.sql'))).rejects.toThrow(/already exists/);
  await db.exec('ROLLBACK');
  await db.exec('CREATE VIEW public.unrelated_view AS SELECT id FROM public.profile');
  await expect(db.exec(sql('rollback-0001-0002.sql'))).rejects.toThrow(/depend/);
  await db.exec('ROLLBACK');
  expect((await db.query("SELECT to_regprocedure('public.sync_push(jsonb)') IS NOT NULL AS present")).rows).toEqual([{present:true}]);
  await db.query('SELECT * FROM public.unrelated_view');
  await db.exec('DROP VIEW public.unrelated_view');
  await db.exec(sql('rollback-0001-0002.sql'));
  expect((await db.query("SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relname<>'unrelated'")).rows).toEqual([]);
  expect((await db.query("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace")).rows).toEqual([]);
  expect((await db.query('SELECT id FROM auth.users')).rows).toEqual([{id:OWNER_B}]);
  expect((await db.query('SELECT * FROM public.unrelated')).rows).toEqual([{id:42}]);
  await db.exec(sql('apply-0001-0002.sql'));
  for (const table of syncedTables) expect((await db.query(`SELECT * FROM public.${table}`)).rows).toEqual([]);
});
test('a defect in 0002 rolls back 0001 too', async () => {
  await db.exec(sql('rollback-0001-0002.sql'));
  const broken = sql('apply-0001-0002.sql').replace('CREATE TABLE public.custom_exercises', 'CREATE TABLE missing_schema.custom_exercises');
  await expect(db.exec(broken)).rejects.toThrow();
  await db.exec('ROLLBACK');
  expect((await db.query("SELECT to_regclass('public.profile') AS object")).rows).toEqual([{object:null}]);
});
