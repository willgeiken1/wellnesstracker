import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filterBootExport } from '../../src/data/boot-export-filter';
import { syncedTables } from '../../src/data/rows';
import { OWNER_A, OWNER_B } from '../../fixtures/sync';

// Actual SQLite on synthetic files: inspect retained rows AND the exported file bytes.
test('staged export retains only the current owner, drops every Oura table and unscoped metadata, and preserves the original',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'insight-export-test-'));
 const original=join(directory,'original.db'),staged=join(directory,'staged.db');
 const tables=[...syncedTables,'workout_local','workout_milestones','workout_weekly','sync_outbox','sync_state','sync_conflicts'];
 const source=new DatabaseSync(original);
 for(const table of tables){
  source.exec(`CREATE TABLE "${table}" (owner_id TEXT, value TEXT)`);
  const insert=source.prepare(`INSERT INTO "${table}" VALUES (?, ?)`);
  insert.run(OWNER_A,'synthetic-current-owner');insert.run(OWNER_B,'synthetic-departing-owner-secret');insert.run(null,'synthetic-unowned-secret');
 }
 for(const table of ['oura_days','oura_sleep','OURA_future']){
  source.exec(`CREATE TABLE "${table}" (owner_id TEXT, cache TEXT)`);
  source.prepare(`INSERT INTO "${table}" VALUES (?, ?)`).run(OWNER_A,'synthetic-oura-secret');
 }
 source.exec("CREATE TABLE legacy_metadata (value TEXT); INSERT INTO legacy_metadata VALUES ('synthetic-unscoped-secret'); CREATE VIEW leaked_rows AS SELECT * FROM sessions; CREATE TRIGGER keep_other_owner BEFORE DELETE ON sessions BEGIN SELECT RAISE(IGNORE); END;");
 source.close();
 const before=readFileSync(original);copyFileSync(original,staged);
 const copy=new DatabaseSync(staged);
 try {
  await filterBootExport({
   execAsync:async query=>{copy.exec(query);},
   getAllAsync:async <T>(query:string)=>copy.prepare(query).all() as T[],
   runAsync:async (query:string,...params:unknown[])=>{const result=copy.prepare(query).run(...params as string[]);return {changes:Number(result.changes),lastInsertRowId:Number(result.lastInsertRowid)};},
  },OWNER_A);
  for(const table of tables)expect(copy.prepare(`SELECT * FROM "${table}"`).all()).toEqual([{owner_id:OWNER_A,value:'synthetic-current-owner'}]);
  const names=copy.prepare('SELECT name FROM sqlite_schema').all().map(row=>row.name);
  for(const name of ['oura_days','oura_sleep','OURA_future','legacy_metadata','leaked_rows','keep_other_owner'])expect(names).not.toContain(name);
 } finally {copy.close();}
 try {
  expect(readFileSync(original)).toEqual(before);
  const exported=readFileSync(staged).toString('utf8');
  expect(exported).toContain('synthetic-current-owner');
  for(const secret of ['synthetic-departing-owner-secret','synthetic-unowned-secret','synthetic-oura-secret','synthetic-unscoped-secret'])expect(exported).not.toContain(secret);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test.each(['sync_outbox','sync_state','sync_conflicts'])('drops %s if it cannot be scoped to an owner',async table=>{
 const copy=new DatabaseSync(':memory:');
 copy.exec(`CREATE TABLE "${table}" (value TEXT); INSERT INTO "${table}" VALUES ('synthetic-other-owner')`);
 try {
  await filterBootExport({
   execAsync:async query=>{copy.exec(query);},
   getAllAsync:async <T>(query:string)=>copy.prepare(query).all() as T[],
   runAsync:jest.fn(),
  },OWNER_A);
  expect(copy.prepare('SELECT name FROM sqlite_schema WHERE type=\'table\'').all()).toEqual([]);
 } finally {copy.close();}
});

test('device-only losing versions never leave in a boot recovery export',async()=>{
 const copy=new DatabaseSync(':memory:');
 copy.exec('CREATE TABLE sync_state (owner_id TEXT, key TEXT, value TEXT)');
 copy.prepare('INSERT INTO sync_state VALUES (?,?,?)').run(OWNER_A,'losing:sessions:fixture','synthetic-recovery-payload');
 copy.prepare('INSERT INTO sync_state VALUES (?,?,?)').run(OWNER_A,'cursor:sessions','7');
 try {
  await filterBootExport({
   execAsync:async query=>{copy.exec(query);},
   getAllAsync:async <T>(query:string)=>copy.prepare(query).all() as T[],
   runAsync:async(query:string,...params:unknown[])=>{const result=copy.prepare(query).run(...params as string[]);return {changes:Number(result.changes),lastInsertRowId:Number(result.lastInsertRowid)};},
  },OWNER_A);
  expect(copy.prepare('SELECT key FROM sync_state').all()).toEqual([{key:'cursor:sessions'}]);
 }finally{copy.close();}
});
