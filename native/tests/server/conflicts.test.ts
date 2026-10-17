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
