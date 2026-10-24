import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../src/data/migrations';
import { Repository } from '../../src/data/repository';
import { SyncEngine } from '../../src/data/sync/engine';
import { canonicalRow } from '../../src/data/rows';
import { syncFields, syncTables, projectSyncRow, mergeSyncRow, hasGatedColumns, DEFAULT_SYNC_FLAGS } from '../../src/data/sync/flags';
import { OWNER_A, DEVICE_A, syntheticRow } from '../../fixtures/sync';
import { localDatabase, sqliteClient } from './sqlite';
import { serverDatabase, testTransport } from './pglite';
import { syncedV1Examples as examples } from '../../fixtures/synced-v1';
const DEVICE_B='20000000-0000-4000-8000-000000000002';
const on = { syncedV1Columns: true };
test('forward-only upgrade preserves old columns and outbox revisions; additions stay null', async()=>{
 const sqlite=new DatabaseSync(':memory:'),db=drizzle(sqliteClient(sqlite));
 const old={journal:{entries:migrations.journal.entries.slice(0,4)},migrations:Object.fromEntries(Object.entries(migrations.migrations).slice(0,4))};
 try {
  await migrate(db,old);
  const tables=examples.map(([t])=>t).filter(t=>!['custom_exercises','plans','pauses'].includes(t));
  for(const table of tables)sqlite.prepare(`INSERT INTO ${table}(owner_id,id,updated_at,deleted_at,device_id) VALUES(?,?,100,NULL,?)`).run(OWNER_A,syntheticRow().id,DEVICE_A);
  for(const table of tables) {
   const fields=sqlite.prepare(`PRAGMA table_info(${table})`).all().filter(c=>!['owner_id','id','updated_at','deleted_at','device_id'].includes(String(c.name)));
   sqlite.prepare(`UPDATE ${table} SET ${fields.map(c=>`${c.name}=?`).join(',')}`).run(...fields.map(c=>c.type==='TEXT'?'synthetic fixture':7));
  }
  sqlite.prepare('INSERT INTO sync_outbox VALUES(?,?,?,?)').run(OWNER_A,'sets',syntheticRow().id,'100:'+DEVICE_A);
  const before=tables.map(t=>sqlite.prepare(`SELECT * FROM ${t}`).all());
  await migrate(db,migrations);await migrate(db,migrations);
  tables.forEach((t,i)=>{
   const [after]=sqlite.prepare(`SELECT * FROM ${t}`).all();expect(after).toMatchObject(before[i][0]);
   for(const k of Object.keys(after).filter(k=>!Object.hasOwn(before[i][0],k)))expect(after[k]).toBeNull();
  });
  expect(sqlite.prepare('SELECT revision FROM sync_outbox').get()?.revision).toBe('100:'+DEVICE_A);
  for(const table of ['custom_exercises','plans','pauses'])expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
 }finally{sqlite.close();}
});
test('default OFF omits new fields/tables and ignores unknown columns',()=>{
 expect(DEFAULT_SYNC_FLAGS.syncedV1Columns).toBe(false);
 for(const [table,data] of examples) {
  const row={...syntheticRow(table),data:{...data,future_column:'ignored'}};
  if(['custom_exercises','plans','pauses'].includes(table)) {
   expect(syncTables()).not.toContain(table);expect(()=>projectSyncRow(row)).toThrow();
  } else {
   const projected=projectSyncRow(row);
   for(const key of Object.keys(data))expect(projected.data).not.toHaveProperty(key);
   expect(projected.data).not.toHaveProperty('future_column');
   expect(Object.keys(syncFields(table))).toEqual(Object.keys(projected.data));
  }
 }
});
test('OFF outbox/apply gates fields/tables, preserves dormant values and isolates cursors',async()=>{
 const local=await localDatabase();
 try {
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
  const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
  enabled.putLocal({...syntheticRow('sets'),data:{reps:8,tag:'warmup'}});
  enabled.putLocal({...syntheticRow('pauses'),data:{start_day:'2026-10-01'}});
  const pending=off.pending();expect(pending).toHaveLength(1);expect(pending[0].row.data).not.toHaveProperty('tag');
  off.ack(pending,[{...pending[0].row,data:{reps:8,tag:'ignored'}}]);
  expect(off.get('sets',pending[0].row.id)?.data.tag).toBe('warmup');
  off.applyPage('sets',[{row:{...pending[0].row,updated_at:200,data:{reps:9,tag:'ignored'}},server_seq:'1'}],'1');
  expect(off.get('sets',pending[0].row.id)?.data).toMatchObject({reps:9,tag:'warmup'});
  expect(()=>off.applyPage('pauses',[],'0')).toThrow();
  expect(enabled.pending().some(p=>p.row.table==='pauses')).toBe(true);
  expect(off.cursor('sets')).toBe('1');expect(enabled.cursor('sets')).toBe('0');
  off.applyPage('sets',[{row:{...pending[0].row,updated_at:201,deleted_at:201,data:{}},server_seq:'2'}],'2');
  expect(off.get('sets',pending[0].row.id)?.data.tag).toBeNull();
 }finally{local.sqlite.close();}
});
test.each([false,true].flatMap(syncedV1Columns=>examples.filter(([table])=>syncTables({syncedV1Columns}).includes(table)).map(([table,data])=>({table,data,flags:{syncedV1Columns}}))))('$table flag=$flags.syncedV1Columns two simulated devices: LWW ties/stale writes, nullable values and tombstones',async({table,data,flags})=>{
 const server=await serverDatabase();let serial=0;
 try {
  await fc.assert(fc.asyncProperty(fc.integer({min:101,max:500}),fc.boolean(),fc.integer({min:1,max:7}),async(stamp,nullable,n)=>{
   const a=await localDatabase(),b=await localDatabase();
   const ra=new Repository(a.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,flags),rb=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id,flags);
   const transport=testTransport(server,OWNER_A,flags),ea=new SyncEngine(ra,transport),eb=new SyncEngine(rb,transport);
   const id=`30000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
   const generated=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,typeof value==='number'?n: key==='tag'||key==='superset_group'?`fixture ${n}`:value]));
   const baseKey={sets:'reps',routine_exercises:'target_reps',entries:'position',machine_notes:'exercise',settings:'rest_seconds',food_entries:'name',saved_foods:'name'}[table as string];
   const base=baseKey?{[baseKey]:['exercise','name'].includes(baseKey)?`fixture ${n}`:n}:{};
   const original={...syntheticRow(table),id,updated_at:stamp,data:flags.syncedV1Columns?(nullable?Object.fromEntries(Object.keys(data).map(k=>[k,null])):generated):base};
   try {
    ra.putLocal(original);await ea.sync();await eb.sync();expect(rb.get(table,id)).toEqual(canonicalRow(original));
    const winner={...original,device_id:DEVICE_B,updated_at:stamp+1,data:flags.syncedV1Columns?data:base};
    rb.putLocal(winner);ra.putLocal({...original,updated_at:stamp+1,data:{}});
    await eb.sync();await ea.sync();await eb.sync();
    expect(ra.get(table,id)).toEqual(canonicalRow(winner));expect(rb.get(table,id)).toEqual(canonicalRow(winner));
    await transport.push([original]);await ea.sync();expect(ra.get(table,id)).toEqual(canonicalRow(winner));
    rb.save(table,Object.fromEntries(Object.keys(data).map(key=>[key,null])),id,stamp+2);
    await eb.sync();await ea.sync();
    for(const key of Object.keys(data))expect(ra.get(table,id)!.data[key]).toBeNull();
    expect(ra.get(table,id)!.deleted_at).toBeNull();
    rb.remove(table,id,stamp+3);await eb.sync();await ea.sync();expect(ra.get(table,id)).toEqual(rb.get(table,id));
    expect(ra.get(table,id)!.deleted_at).not.toBeNull();
    expect(ea.status).toBe('idle');expect(eb.status).toBe('idle');
    expect(Object.values(ra.get(table,id)!.data).every(v=>v===null)).toBe(true);
    expect(ra.pending()).toEqual([]);expect(rb.pending()).toEqual([]);
   }finally{ea.close();eb.close();a.sqlite.close();b.sqlite.close();}
  }),{numRuns:10});
 }finally{await server.close();}
});

test('enabling after an OFF pull replays same-revision fields without overwriting pending edits',async()=>{
 const local=await localDatabase();
 try {
  const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  off.applyPage('sets',[{row,server_seq:'1'}],'1');expect(off.get('sets',row.id)?.data.tag).toBeNull();
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  expect(enabled.cursor('sets')).toBe('0');
  enabled.applyPage('sets',[{row:{...row,data:{...row.data,reps:99}},server_seq:'1'}],'1');
  expect(enabled.get('sets',row.id)?.data).toMatchObject({tag:'warmup',reps:8});
  enabled.save('sets',{reps:9,tag:'drop'},row.id,200);
  enabled.applyPage('sets',[{row,server_seq:'2'}],'2');expect(enabled.get('sets',row.id)?.data.tag).toBe('drop');
 }finally{local.sqlite.close();}
});

test('engine rejects mismatched transport/repository capabilities before network work',async()=>{
 const local=await localDatabase();
 try {
  const push=jest.fn(),pull=jest.fn();
  expect(()=>new SyncEngine(local.repo,{owner:OWNER_A,syncFlags:on,push,pull})).toThrow('Sync feature flags must match.');
  expect(push).not.toHaveBeenCalled();expect(pull).not.toHaveBeenCalled();
 }finally{local.sqlite.close();}
});

test('OFF device syncs old fields without uploading/accepting v1 fields or querying gated tables',async()=>{
 const server=await serverDatabase(),a=await localDatabase(),b=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const off=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id);
 const offTransport=testTransport(server,OWNER_A);
 const pull=jest.fn(offTransport.pull),push=jest.fn(offTransport.push);
 const enabledRepo=new Repository(a.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 const enabledEngine=new SyncEngine(enabledRepo,{...transport,syncFlags:on}),offEngine=new SyncEngine(off,{owner:OWNER_A,push,pull});
 try {
  const original={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  enabledRepo.putLocal(original);enabledRepo.putLocal({...syntheticRow('pauses'),data:{start_day:'2026-10-01'}});
  await enabledEngine.sync();await offEngine.sync();expect(offEngine.status).toBe('idle');
  expect(off.get('sets',original.id)?.data.tag).toBeNull();expect(off.list('pauses')).toEqual([]);
  for(const [table] of pull.mock.calls)expect(['custom_exercises','plans','pauses']).not.toContain(table);
  off.save('sets',{reps:9},original.id,200);await offEngine.sync();
  for(const [rows] of push.mock.calls)for(const row of rows)expect(row.data).not.toHaveProperty('tag');
  const remote=(await transport.pull('sets','0',100))[0].row;expect(remote.data).toMatchObject({reps:9,tag:'warmup'});
  const enabled=new Repository(b.db,OWNER_A,DEVICE_B,()=>original.id,on),engine=new SyncEngine(enabled,{...transport,syncFlags:on});
  await engine.sync();expect(engine.status).toBe('idle');expect(enabled.get('sets',original.id)?.data.tag).toBe('warmup');engine.close();
 }finally{enabledEngine.close();offEngine.close();a.sqlite.close();b.sqlite.close();await server.close();}
});


test('SQLite helper defaults OFF',async()=>{
 const local=await localDatabase();
 try {expect(local.repo.syncFlags).toEqual(DEFAULT_SYNC_FLAGS);}finally{local.sqlite.close();}
});

test('merge tombstone wipes dormant fields before canonicalization',()=>{
 const local={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
 const dead=mergeSyncRow({...local,deleted_at:101,data:{}},local,DEFAULT_SYNC_FLAGS);
 expect(dead.data.tag).toBeNull();
 expect(mergeSyncRow(local,undefined,DEFAULT_SYNC_FLAGS).data.tag).toBeNull();
 expect(mergeSyncRow(local,local,DEFAULT_SYNC_FLAGS).data.tag).toBe('warmup');
});

test('applyPage projects disabled invalid values before validation and hydration',async()=>{
 const local=await localDatabase();
 const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:42,future_column:'ignored'}};
  expect(()=>off.applyPage('sets',[{row,server_seq:'1'}],'1')).not.toThrow();
  expect(off.get('sets',row.id)?.data).toMatchObject({reps:8,tag:null});
  expect(off.get('sets',row.id)?.data).not.toHaveProperty('future_column');
 }finally{local.sqlite.close();}
});

test('undefined transport flags are OFF, so enabled repositories reject them',async()=>{
 const local=await localDatabase();
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 try {
  expect(()=>new SyncEngine(enabled,{owner:OWNER_A,push:jest.fn(),pull:jest.fn()})).toThrow('Sync feature flags must match.');
 }finally{local.sqlite.close();}
});

test('OFF delete wipes server v1 columns and an ON device pulls the tombstone',async()=>{
 const server=await serverDatabase(),a=await localDatabase(),b=await localDatabase();
 const enabled=new Repository(a.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 const off=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id);
 const transport=testTransport(server,OWNER_A,on);
 const ea=new SyncEngine(enabled,{...transport,syncFlags:on}),eb=new SyncEngine(off,testTransport(server,OWNER_A));
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  enabled.putLocal(row);await ea.sync();await eb.sync();
  off.remove('sets',row.id,200);
  expect(off.pending()[0].row.data).not.toHaveProperty('tag');
  await eb.sync();expect(eb.status).toBe('idle');
  const result=await server.query<{tag:null;deleted_at:string}>('SELECT tag,deleted_at FROM public.sets WHERE id=$1',[row.id]);
  expect(result.rows[0].tag).toBeNull();expect(result.rows[0].deleted_at).not.toBeNull();
  await ea.sync();expect(ea.status).toBe('idle');
  expect(enabled.get('sets',row.id)).toEqual(off.get('sets',row.id));
  expect(Object.values(enabled.get('sets',row.id)!.data).every(v=>v===null)).toBe(true);
 }finally{ea.close();eb.close();a.sqlite.close();b.sqlite.close();await server.close();}
});

test('ON rollback replays remote v1 changes before its first push',async()=>{
 const server=await serverDatabase(),local=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
 const first=new SyncEngine(enabled,{...transport,syncFlags:on});
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  enabled.putLocal(row);await first.sync();first.close();
  await transport.push([{...row,device_id:DEVICE_B,updated_at:200,data:{reps:9,tag:'drop'}}]);
  const rollback=new SyncEngine(off,testTransport(server,OWNER_A));await rollback.sync();rollback.close();
  expect(off.get('sets',row.id)?.data).toMatchObject({reps:9,tag:'warmup'});
  const push=jest.fn(transport.push),pull=jest.fn(transport.pull);
  const restored=new SyncEngine(enabled,{...transport,syncFlags:on,push,pull});
  // An unrelated pending row forces a push on the first re-enabled run.
  enabled.putLocal({...syntheticRow('sessions'),updated_at:201});
  await restored.sync();restored.close();
  expect(enabled.get('sets',row.id)?.data.tag).toBe('drop');
  const setsPull=pull.mock.calls.findIndex(([table])=>table==='sets');
  expect(pull.mock.invocationCallOrder[setsPull]).toBeLessThan(push.mock.invocationCallOrder[0]);
 }finally{first.close();local.sqlite.close();await server.close();}
});


test('OFF edits preserve server v1 values on a re-enabled push',async()=>{
 const server=await serverDatabase(),local=await localDatabase();
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
 const transport=testTransport(server,OWNER_A,on);
 const first=new SyncEngine(enabled,transport),rollback=new SyncEngine(off,testTransport(server,OWNER_A));
 const push=jest.fn(transport.push),restored=new SyncEngine(enabled,{...transport,push});
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  enabled.putLocal(row);await first.sync();first.close();
  await transport.push([{...row,device_id:DEVICE_B,updated_at:200,data:{reps:9,tag:'drop'}}]);
  await rollback.sync();rollback.close();
  expect(off.get('sets',row.id)?.data.tag).toBe('warmup');
  off.save('sets',{...off.get('sets',row.id)!.data,reps:10},row.id,300);
  expect(enabled.pending()[0].row.data).toMatchObject({reps:10,tag:null});
  await restored.sync();expect(restored.status).toBe('idle');
  expect(push).toHaveBeenCalledTimes(1);
  expect(push.mock.calls[0][0][0].data).toMatchObject({reps:10,tag:'drop'});
  expect((await transport.pull('sets','0',100))[0].row.data).toMatchObject({reps:10,tag:'drop'});
 }finally{first.close();rollback.close();restored.close();local.sqlite.close();await server.close();}
});


test('pending OFF edit refills a newer v1 value from another device after repository restart',async()=>{
 const server=await serverDatabase(),local=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  await transport.push([row]);
  const rollback=new SyncEngine(off,testTransport(server,OWNER_A));
  await rollback.sync();rollback.close();
  off.save('sets',{...off.get('sets',row.id)!.data,reps:10},row.id,300);
  // The other device changes the server after the OFF edit, with an older LWW stamp.
  await transport.push([{...row,device_id:DEVICE_B,updated_at:200,data:{reps:9,tag:'drop'}}]);
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  const push=jest.fn(transport.push),restored=new SyncEngine(enabled,{...transport,push});
  await restored.sync();restored.close();
  expect(restored.status).toBe('idle');
  expect(push.mock.calls[0][0][0].data).toMatchObject({reps:10,tag:'drop'});
  expect((await transport.pull('sets','0',100))[0].row.data).toMatchObject({reps:10,tag:'drop'});
  expect(enabled.pending()).toEqual([]);
 }finally{local.sqlite.close();await server.close();}
});


test.each(examples.filter(([table])=>hasGatedColumns(table)))('%s OFF pending edit refills every dormant column without changing its base revision',async(table,data)=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow(table),data};
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage(table,[{row,server_seq:'1'}],'1');
  local.repo.save(table,{},row.id,300);
  const restarted=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  expect(restarted.cursor(table)).toBe('0');
  const before=restarted.pending()[0];
  restarted.applyPage(table,[{row,server_seq:'1'}],'1');
  expect(restarted.pending()[0]).toMatchObject({revision:before.revision,row:{updated_at:300,data}});
  restarted.ack(restarted.pending());
  expect(restarted.pending()).toEqual([]);
 }finally{local.sqlite.close();}
});

test('ON explicit null and OFF tombstone are not overwritten by dormant refill',async()=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  local.repo.save('sets',{reps:10},row.id,300);
  enabled.save('sets',{reps:11,tag:null},row.id,400);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  expect(enabled.pending()[0].row.data).toMatchObject({reps:11,tag:null});
  local.repo.remove('sets',row.id,500);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  expect(enabled.pending()[0].row.deleted_at).toBe(500);
  expect(Object.values(enabled.pending()[0].row.data).every(value=>value===null)).toBe(true);
 }finally{local.sqlite.close();}
});
