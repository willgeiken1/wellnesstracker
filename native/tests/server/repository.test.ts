import { rmSync } from 'node:fs';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { OWNER_A, OWNER_B, DEVICE_A, syntheticRow } from '../../fixtures/sync';

test('row and outbox survive restart; accounts and demo cannot see each other', async () => {
  const path = `/tmp/insight-repository-${process.pid}.db`;
  const first = await localDatabase(path);
  first.repo.putLocal(syntheticRow());
  first.repo.save('settings',{theme_override:'dark',accent:'dusk'});
  first.sqlite.close();
  const second = await localDatabase(path);
  expect(second.repo.pending()).toHaveLength(2);
  expect(second.repo.list('settings')[0].data).toMatchObject({theme_override:'dark',accent:'dusk'});
  expect(second.repo.list('sessions')).toHaveLength(1);
  for (const owner of [OWNER_B,'demo']) {
    const other = new Repository(second.db, owner, DEVICE_A, () => syntheticRow().id);
    expect(other.list('sessions')).toEqual([]);
    expect(other.pending()).toEqual([]);
    expect(() => other.putLocal(syntheticRow())).toThrow();
  }
  second.sqlite.close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(path+suffix, {force:true});
});
test('committed mutations notify; stale ack cannot erase in-flight edits; parents do not cascade', async () => {
  const {repo,sqlite} = await localDatabase();
  const notify = jest.fn(); repo.subscribe(notify);
  const row = syntheticRow(); repo.putLocal(row);
  const snapshot = repo.pending();
  repo.putLocal({...row, updated_at: 101, deleted_at: 101});
  repo.ack(snapshot);
  expect(repo.pending()).toHaveLength(1);
  repo.putLocal({...syntheticRow('sets'), data: {entry_id: row.id, reps: 5}, updated_at: 102});
  expect(repo.list('sets')).toHaveLength(1);
  expect(notify).toHaveBeenCalledTimes(4);
  sqlite.close();
});
test('health provenance stays local; local Oura has no outbox; rollback is atomic', async () => {
  const {repo,db,sqlite} = await localDatabase();
  repo.putLocal({...syntheticRow('weigh_ins'),data:{...syntheticRow('weigh_ins').data,source:'healthkit'}});
  expect(repo.pending()).toEqual([]);
  expect(repo.list('weigh_ins')[0].data.source).toBe('healthkit');
  repo.cacheOura('2026-01-01', {fixture: true});
  expect(repo.pending()).toEqual([]);
  db.run(require('drizzle-orm').sql.raw("CREATE TRIGGER fail_outbox BEFORE INSERT ON sync_outbox BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;"));
  expect(() => repo.putLocal(syntheticRow())).toThrow();
  expect(repo.list('sessions')).toEqual([]);
  sqlite.close();
});
test('local monotonic stamps beat same-millisecond and backward clocks; cursor is arbitrary precision text', async () => {
  const {repo,sqlite} = await localDatabase();
  const a = repo.save('sessions', {}, undefined, 100);
  const b = repo.save('sessions', {}, a.id, 100);
  const c = repo.save('sessions', {}, a.id, 10);
  expect(b.updated_at).toBeGreaterThan(a.updated_at);
  expect(c.updated_at).toBeGreaterThan(b.updated_at);
  repo.applyPage('sessions', [], '90071992547409930');
  expect(repo.cursor('sessions')).toBe('90071992547409930');
  sqlite.close();
});
test('editing or deleting a pulled future-dated row always creates a newer local revision', async () => {
  const {repo,sqlite}=await localDatabase();
  const remote={...syntheticRow(),updated_at:5000000000000,device_id:'ffffffff-ffff-4fff-afff-ffffffffffff'};
  repo.applyPage('sessions',[{row:remote,server_seq:'1'}],'1');
  const edited=repo.save('sessions',{name:'fixture edit'},remote.id,100);
  expect(edited.updated_at).toBeGreaterThan(remote.updated_at);
  expect(repo.get('sessions',remote.id)?.data.name).toBe('fixture edit');
  repo.remove('sessions',remote.id,100);
  expect(repo.get('sessions',remote.id)?.deleted_at).toBeGreaterThan(edited.updated_at);
  sqlite.close();
});
test('every local physical table has explicit fields matching the row catalog',async()=>{
 const {sqlite}=await localDatabase();
 const {columns,syncedTables}=require('../../src/data/rows') as typeof import('../../src/data/rows');
 for(const table of syncedTables){
  const names=sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
  expect(names).toEqual(['owner_id','id','updated_at','deleted_at','device_id',...Object.keys(columns[table])]);
 }
 sqlite.close();
});

test('owner cursors and get stay isolated through account switches with the same row id',async()=>{
 const {repo,db,sqlite}=await localDatabase();
 const other=new Repository(db,OWNER_B,DEVICE_A,()=>syntheticRow().id);
 const a=syntheticRow();repo.putLocal(a);
 expect(other.get('sessions',a.id)).toBeUndefined();
 other.putLocal({...a,owner_id:OWNER_B,data:{name:'B fixture'}});
 repo.applyPage('sessions',[],'100');expect(other.cursor('sessions')).toBe('0');
 other.applyPage('sessions',[],'3');
 expect(new Repository(db,OWNER_A,DEVICE_A,()=>a.id).cursor('sessions')).toBe('100');
 expect(new Repository(db,OWNER_B,DEVICE_A,()=>a.id).cursor('sessions')).toBe('3');
 expect(repo.get('sessions',a.id)?.data.name).not.toBe('B fixture');
 expect(other.get('sessions',a.id)?.data.name).toBe('B fixture');sqlite.close();
});
test('pull preserves a newer pending local edit and its push revision',async()=>{
 const {repo,sqlite}=await localDatabase();
 const row={...syntheticRow(),updated_at:200,data:{name:'new local fixture'}};repo.putLocal(row);
 const pending=repo.pending();
 repo.applyPage('sessions',[{row:{...row,updated_at:100,data:{name:'old remote fixture'}},server_seq:'1'}],'1');
 expect(repo.get('sessions',row.id)?.data.name).toBe('new local fixture');
 expect(repo.pending()).toEqual(pending);
 const push=jest.fn(async()=>{});
 const {SyncEngine}=require('../../src/data/sync/engine') as typeof import('../../src/data/sync/engine');
 const engine=new SyncEngine(repo,{owner:OWNER_A,push,pull:async()=>[]});await engine.sync();
 expect(push).toHaveBeenCalledWith([pending[0].row]);expect(repo.pending()).toEqual([]);engine.close();sqlite.close();
});
test('pull provenance collision is durably flagged without stalling the page or future pages',async()=>{
 const path=`/tmp/insight-conflicts-${process.pid}.db`;
 const {repo,db,sqlite}=await localDatabase(path);
 const row=syntheticRow('weigh_ins');repo.putLocal({...row,data:{...row.data,source:'healthkit'}});
 const next={...row,id:'30000000-0000-4000-8000-000000000066'};
 expect(()=>repo.applyPage('weigh_ins',[{row,server_seq:'1'},{row:next,server_seq:'2'}],'2')).not.toThrow();
 expect(repo.cursor('weigh_ins')).toBe('2');expect(repo.get('weigh_ins',row.id)?.data.source).toBe('healthkit');
 expect(repo.get('weigh_ins',next.id)?.data.source).toBe('app');
 expect(repo.conflicts()).toEqual([{table:'weigh_ins',id:row.id,reason:'provenance'}]);
 expect(new Repository(db,OWNER_A,DEVICE_A,()=>row.id).conflicts()).toEqual(repo.conflicts());
 expect(new Repository(db,OWNER_B,DEVICE_A,()=>row.id).conflicts()).toEqual([]);
 repo.applyPage('weigh_ins',[{row:{...row,updated_at:200},server_seq:'3'}],'3');
 expect(repo.conflicts()).toHaveLength(1);expect(repo.pending()).toEqual([]);sqlite.close();
 const restarted=await localDatabase(path);expect(restarted.repo.conflicts()).toEqual([{table:'weigh_ins',id:row.id,reason:'provenance'}]);restarted.sqlite.close();
 for(const suffix of ['', '-wal', '-shm'])rmSync(path+suffix,{force:true});
});

test.each(['app','healthkit','health_connect'])('local tombstone wipes values but retains %s provenance',async source=>{
 const local=await localDatabase(),row=syntheticRow('weigh_ins');
 try {
  local.repo.putLocal({...row,data:{...row.data,source}});local.repo.remove(row.table,row.id,200);
  expect(local.repo.get(row.table,row.id)?.data).toEqual({day:null,weight_kg:null,entered_value:null,entered_unit:null,source});
 } finally {local.sqlite.close();}
});

test('upgrade wipes payloads from pre-decision local tombstones without losing provenance or outbox',async()=>{
 const path=`/tmp/insight-tombstone-upgrade-${process.pid}.db`;
 const first=await localDatabase(path);
 first.repo.putLocal(syntheticRow('weigh_ins'));
 first.sqlite.exec("UPDATE weigh_ins SET deleted_at=100; DELETE FROM __drizzle_migrations WHERE created_at=1792238400002");
 first.sqlite.close();
 const second=await localDatabase(path);
 try {
  const row=second.repo.list('weigh_ins',true)[0];
  expect(row.data).toEqual({day:null,weight_kg:null,entered_value:null,entered_unit:null,source:'app'});
  expect(second.repo.pending()).toHaveLength(1);
 } finally {
  second.sqlite.close();for(const suffix of ['', '-wal', '-shm'])rmSync(path+suffix,{force:true});
 }
});

test('authoritative clamped acknowledgment preserves a newer in-flight edit and its outbox',async()=>{
 const local=await localDatabase(),row={...syntheticRow(),updated_at:8000000000000,data:{name:'sent fixture'}};
 try {
  local.repo.putLocal(row);const sent=local.repo.pending();
  const newer={...row,updated_at:row.updated_at+1,data:{name:'newer fixture'}};
  local.repo.putLocal(newer);
  local.repo.ack(sent,[{...row,updated_at:100}]);
  expect(local.repo.get(row.table,row.id)?.data.name).toBe('newer fixture');
  expect(local.repo.pending()).toHaveLength(1);expect(local.repo.pending()[0].row.updated_at).toBe(newer.updated_at);
 } finally {local.sqlite.close();}
});
