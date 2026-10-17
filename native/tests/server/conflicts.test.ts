import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serverDatabase, asUser, testTransport } from './pglite';
import { localDatabase } from './sqlite';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import { Repository } from '../../src/data/repository';
import { SyncEngine } from '../../src/data/sync/engine';
import { SupabaseTransport } from '../../src/data/sync/supabase';
let db: PGlite;
beforeAll(async()=>{db=await serverDatabase();});
afterAll(async()=>{await db?.close();});

test('account switches pull from each owner cursor without skipping B or replaying A',async()=>{
 const local=await localDatabase();
 const row=syntheticRow('sessions');
 await testTransport(db,OWNER_B).push([{...row,owner_id:OWNER_B}]);
 await testTransport(db,OWNER_A).push([row]);
 const b=new Repository(local.db,OWNER_B,local.repo.device,()=>row.id);
 const aTransport=testTransport(db,OWNER_A),bTransport=testTransport(db,OWNER_B);
 const aPull=jest.fn(aTransport.pull),bPull=jest.fn(bTransport.pull);
 const aEngine=new SyncEngine(local.repo,{...aTransport,pull:aPull});await aEngine.sync();aEngine.close();
 const aCursor=local.repo.cursor('sessions');
 const bEngine=new SyncEngine(b,{...bTransport,pull:bPull});await bEngine.sync();bEngine.close();
 expect(bPull).toHaveBeenCalledWith('sessions','0',100);
 expect(b.list('sessions')).toHaveLength(1);
 expect(BigInt(b.cursor('sessions'))).toBeLessThan(BigInt(aCursor));
 const again=new SyncEngine(local.repo,{...aTransport,pull:aPull});await again.sync();again.close();
 expect(aPull.mock.calls.filter(c=>c[0]==='sessions')).toEqual([['sessions','0',100],['sessions',aCursor,100]]);
 expect(local.repo.list('sessions')).toHaveLength(1);local.sqlite.close();
});

test('real server pull collision preserves local Health provenance and consumes subsequent rows/pages',async()=>{
 const local=await localDatabase(),row=syntheticRow('weigh_ins');
 local.repo.putLocal({...row,data:{...row.data,source:'health_connect'}});
 const next={...row,id:'30000000-0000-4000-8000-000000000067'};
 await testTransport(db,OWNER_A).push([row,next]);
 const engine=new SyncEngine(local.repo,testTransport(db,OWNER_A),1);await engine.sync();
 expect(engine.status).toBe('idle');expect(local.repo.conflicts()).toEqual([{table:row.table,id:row.id,reason:'provenance'}]);
 expect(local.repo.get(row.table,row.id)?.data.source).toBe('health_connect');
 expect(local.repo.get(next.table,next.id)?.data.source).toBe('app');
 const cursor=local.repo.cursor(row.table);await engine.sync();expect(local.repo.cursor(row.table)).toBe(cursor);
 engine.close();local.sqlite.close();
});

test('SQL provenance error travels through Supabase transport and isolates only the conflicting push',async()=>{
 const local=await localDatabase();
 const bad={...syntheticRow('weigh_ins'),id:'30000000-0000-4000-8000-000000000068'};
 const good={...syntheticRow('settings'),id:'30000000-0000-4000-8000-000000000069'};
 await testTransport(db,OWNER_A).push([bad]);
 // Synthetic legacy remote corruption exercises a collision normally excluded by the source CHECK.
 await db.exec('ALTER TABLE public.weigh_ins DROP CONSTRAINT weigh_ins_source_check; ALTER TABLE public.weigh_ins DISABLE TRIGGER weigh_ins_guard');
 await db.query("UPDATE public.weigh_ins SET source='healthkit' WHERE id=$1",[bad.id]);
 await db.exec('ALTER TABLE public.weigh_ins ENABLE TRIGGER weigh_ins_guard');
 try {
  local.repo.putLocal({...bad,updated_at:200});local.repo.putLocal(good);
  const rpc=jest.fn(async(_name:string,{rows}:{rows:unknown})=>{
   try{await asUser(db,OWNER_A,tx=>tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify(rows)]));return {error:null};}
   catch(error){return {error:{code:(error as {code:string}).code,message:'fixture backend details'}};}
  });
  const client={rpc,auth:{getSession:async()=>({data:{session:{user:{id:OWNER_A}}},error:null})}} as unknown as SupabaseClient;
  const transport=new SupabaseTransport(client,OWNER_A);
  // Push-only integration: the intentionally corrupt remote row is not a valid pull payload.
  const engine=new SyncEngine(local.repo,{owner:OWNER_A,push:rows=>transport.push(rows),pull:async()=>[]});
  await engine.sync();expect(engine.status).toBe('idle');
  expect(local.repo.pending()).toEqual([]);expect(local.repo.conflicts()).toEqual([{table:bad.table,id:bad.id,reason:'provenance'}]);
  expect((await testTransport(db,OWNER_A).pull('settings','0',100)).some(r=>r.row.id===good.id)).toBe(true);
  expect((await db.query('SELECT source FROM public.weigh_ins WHERE id=$1',[bad.id])).rows).toEqual([{source:'healthkit'}]);
  const calls=rpc.mock.calls.length;await engine.sync();expect(rpc).toHaveBeenCalledTimes(calls);
  engine.close();
 }finally{
  local.sqlite.close();
  await db.exec('ALTER TABLE public.weigh_ins DISABLE TRIGGER weigh_ins_guard');
  await db.query("UPDATE public.weigh_ins SET source='app' WHERE id=$1",[bad.id]);
  await db.exec("ALTER TABLE public.weigh_ins ENABLE TRIGGER weigh_ins_guard; ALTER TABLE public.weigh_ins ADD CONSTRAINT weigh_ins_source_check CHECK(source='app')");
 }
});


const ownerSwitches = [[OWNER_A, OWNER_B], [OWNER_B, OWNER_A]] as const;

test.each(ownerSwitches)('a conflict for %s does not suppress %s pending pushes across account switches', async (flaggedOwner, otherOwner) => {
 const local = await localDatabase();
 const row = syntheticRow('weigh_ins');
 const repository = (owner: string) => new Repository(local.db, owner, local.repo.device, () => row.id);
 const flagged = repository(flaggedOwner), other = repository(otherOwner);
 let engine: SyncEngine | undefined;
 try {
  flagged.putLocal({...row, owner_id: flaggedOwner});
  const retained = flagged.pending();
  flagged.flagConflict(retained[0]);
  other.putLocal({...row, owner_id: otherOwner});
  expect(flagged.pending()).toEqual([]);
  expect(other.conflicts()).toEqual([]);
  const pending = other.pending();
  expect(pending).toHaveLength(1);
  expect(pending[0].row).toMatchObject({id: row.id, owner_id: otherOwner});
  // Recreate the active repository on the same device/database, as on account departure/return.
  const switched = repository(otherOwner), push = jest.fn(async () => {});
  engine = new SyncEngine(switched, {owner: otherOwner, push, pull: async () => []});
  await engine.sync();
  expect(engine.status).toBe('idle');
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith([pending[0].row]);
  expect(switched.pending()).toEqual([]);
  const returned = repository(flaggedOwner);
  expect(returned.conflicts()).toEqual([{table: row.table, id: row.id, reason: 'provenance'}]);
  expect(returned.pending()).toEqual([]);
  expect(returned.get(row.table, row.id)).toEqual(retained[0].row);
  expect(local.sqlite.prepare('SELECT owner_id FROM sync_outbox').all()).toEqual([{owner_id: flaggedOwner}]);
 } finally { engine?.close(); local.sqlite.close(); }
});

test.each(ownerSwitches)('a conflict for %s does not skip %s pulls on the same device', async (flaggedOwner, otherOwner) => {
 const local = await localDatabase();
 const row = syntheticRow('weigh_ins');
 const repository = (owner: string) => new Repository(local.db, owner, local.repo.device, () => row.id);
 const flagged = repository(flaggedOwner);
 let engine: SyncEngine | undefined;
 try {
  flagged.putLocal({...row, owner_id: flaggedOwner});
  flagged.flagConflict(flagged.pending()[0]);
  const before = flagged.get(row.table, row.id);
  const other = repository(otherOwner);
  other.putLocal({...row, owner_id: otherOwner});
  other.ack(other.pending());
  const remote = {...row, owner_id: otherOwner, updated_at: 200, data: {...row.data, weight_kg: 81}};
  const pull = jest.fn(async (table: string, after: string) => table === row.table && after === '0'
   ? [{row: remote, server_seq: '7'}] : []);
  engine = new SyncEngine(other, {owner: otherOwner, push: async () => {}, pull});
  await engine.sync();
  expect(engine.status).toBe('idle');
  expect(pull).toHaveBeenCalledWith(row.table, '0', 100);
  expect(other.get(row.table, row.id)).toMatchObject(remote);
  expect(other.cursor(row.table)).toBe('7');
  expect(other.conflicts()).toEqual([]);
  engine.close();
  const returned = repository(flaggedOwner);
  expect(returned.get(row.table, row.id)).toEqual(before);
  expect(returned.cursor(row.table)).toBe('0');
  expect(returned.conflicts()).toEqual([{table: row.table, id: row.id, reason: 'provenance'}]);
  // Switching back again retains the other owner's pulled row and cursor.
  expect(repository(otherOwner).get(row.table, row.id)).toMatchObject(remote);
  expect(repository(otherOwner).cursor(row.table)).toBe('7');
 } finally { engine?.close(); local.sqlite.close(); }
});

test.each([false, true])('subsequent pulls skip a flagged id (tombstone=%s), consume its cursor and apply page peers', async tombstone => {
 const local = await localDatabase();
 const row = syntheticRow('weigh_ins');
 let engine: SyncEngine | undefined;
 try {
  // Same-source rows ensure the durable flag itself causes the skip, rather than source mismatch detection.
  local.repo.putLocal(row);
  local.repo.flagConflict(local.repo.pending()[0]);
  const before = local.repo.get(row.table, row.id);
  local.sqlite.exec(`CREATE TEMP TABLE flagged_writes(id TEXT);
   CREATE TEMP TRIGGER audit_flagged_update AFTER UPDATE ON weigh_ins
   BEGIN INSERT INTO flagged_writes VALUES(NEW.id); END;`);
  const peer = {...row, id: '30000000-0000-4000-8000-000000000171', updated_at: 300};
  const incoming = {...row, updated_at: 400, deleted_at: tombstone ? 400 : null, data: {...row.data, weight_kg: 99}};
  const pull = jest.fn(async (table: string, after: string) => table === row.table && after === '0'
   ? [{row: peer, server_seq: '8'}, {row: incoming, server_seq: '9'}] : []);
  const push = jest.fn(async () => {});
  engine = new SyncEngine(local.repo, {owner: OWNER_A, push, pull}, 2);
  await engine.sync();
  expect(engine.status).toBe('idle');
  expect(local.repo.get(row.table, row.id)).toEqual(before);
  expect(local.sqlite.prepare('SELECT * FROM flagged_writes').all()).toEqual([]);
  expect(local.repo.get(peer.table, peer.id)).toMatchObject(peer);
  expect(local.repo.cursor(row.table)).toBe('9');
  expect(pull).toHaveBeenCalledWith(row.table, '9', 2);
  expect(local.repo.conflicts()).toEqual([{table: row.table, id: row.id, reason: 'provenance'}]);
  expect(local.repo.pending()).toEqual([]);
  await engine.sync();
  expect(push).not.toHaveBeenCalled();
  expect(local.repo.get(row.table, row.id)).toEqual(before);
  expect(local.repo.cursor(row.table)).toBe('9');
  expect(local.sqlite.prepare('SELECT * FROM flagged_writes').all()).toEqual([]);
 } finally { engine?.close(); local.sqlite.close(); }
});
