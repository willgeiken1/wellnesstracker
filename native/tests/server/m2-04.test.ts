import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../src/data/migrations';
import { Repository } from '../../src/data/repository';
import { SyncEngine } from '../../src/data/sync/engine';
import { canonicalRow } from '../../src/data/rows';
import { syncFields, syncTables, projectSyncRow, mergeSyncRow, hasGatedColumns, DEFAULT_SYNC_FLAGS } from '../../src/data/sync/flags';
import { OWNER_A, OWNER_B, DEVICE_A, syntheticRow } from '../../fixtures/sync';
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


test('steady-state ON edits after a completed replay preserve the cursor and create no marker across restart',async()=>{
 const server=await serverDatabase(),local=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 const engine=new SyncEngine(enabled,transport);
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  await transport.push([row]);await engine.sync();
  expect(engine.status).toBe('idle');
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,'replay:v1:sets')?.value).toBe('complete');
  enabled.applyPage('sets',[{row,server_seq:'5'}],'5');
  const restarted=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  restarted.save('sets',{...restarted.get('sets',row.id)!.data,reps:9},row.id,300);
  expect(restarted.cursor('sets')).toBe('5');
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,`dormant-v1:sets:${row.id}`)).toBeUndefined();
  expect(restarted.pending()[0].row.data).toMatchObject({reps:9,tag:'warmup'});
 }finally{engine.close();local.sqlite.close();await server.close();}
});


test('interrupted paginated ON replay stays needed until the final empty page',async()=>{
 const server=await serverDatabase(),local=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
 const interrupted=new SyncEngine(enabled,{...transport,pull:async(table,after,limit)=>{
  if(table==='sets'&&after==='1')throw new Error('Synthetic interruption');
  return transport.pull(table,after,limit);
 }},1);
 let resumed: SyncEngine | undefined;
 try {
  local.repo.applyPage('sets',[],'0');
  await transport.push([row]);await interrupted.sync();
  expect(interrupted.status).toBe('offline');expect(enabled.cursor('sets')).toBe('1');
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,'replay:v1:sets')?.value).toBe('needed');
  interrupted.close();
  const restarted=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  restarted.save('sets',{...restarted.get('sets',row.id)!.data,reps:9},row.id,300);
  expect(restarted.cursor('sets')).toBe('0');
  resumed=new SyncEngine(restarted,transport,1);await resumed.sync();
  expect(resumed.status).toBe('idle');expect(restarted.pending()).toEqual([]);
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,'replay:v1:sets')?.value).toBe('complete');
  const cursor=restarted.cursor('sets');expect(BigInt(cursor)).toBeGreaterThan(0n);
  restarted.save('sets',{...restarted.get('sets',row.id)!.data,reps:10},row.id,400);
  expect(restarted.cursor('sets')).toBe(cursor);
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,`dormant-v1:sets:${row.id}`)).toBeUndefined();
 }finally{interrupted.close();resumed?.close();local.sqlite.close();await server.close();}
});

test('unchanged gated value re-saved before the first ON replay takes the server value',async()=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  local.repo.applyPage('sets',[{row:{...row,updated_at:200,data:{reps:9,tag:'drop'}},server_seq:'2'}],'2');
  enabled.save('sets',{...enabled.get('sets',row.id)!.data,reps:10,tag:'warmup'},row.id,300);
  enabled.applyPage('sets',[{row:{...row,updated_at:200,data:{reps:9,tag:'drop'}},server_seq:'2'}],'2');
  expect(enabled.pending()[0].row.data).toMatchObject({reps:10,tag:'drop'});
 }finally{local.sqlite.close();}
});

test.each(['{broken', '{"tag":true}', 'null', '"tag"', ''])('invalid dormant marker %p refills all gated fields',async(marker)=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  local.repo.applyPage('sets',[{row,server_seq:'1'}],'1');
  local.repo.save('sets',{reps:10},row.id,300);
  local.sqlite.prepare('UPDATE sync_state SET value=? WHERE owner_id=? AND key=?').run(marker,OWNER_A,`dormant-v1:sets:${row.id}`);
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  expect(enabled.pending()[0].row.data).toMatchObject({reps:10,tag:'warmup'});
 }finally{local.sqlite.close();}
});

test('dormant marker arrays refill only gated fields',async()=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  local.repo.applyPage('sets',[{row,server_seq:'1'}],'1');
  local.repo.save('sets',{reps:10},row.id,300);
  local.sqlite.prepare('UPDATE sync_state SET value=? WHERE owner_id=? AND key=?').run('["tag","reps",null,42]',OWNER_A,`dormant-v1:sets:${row.id}`);
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  expect(enabled.pending()[0].row.data).toMatchObject({reps:10,tag:'warmup'});
 }finally{local.sqlite.close();}
});

test('ON explicit null and OFF tombstone are not overwritten by dormant refill',async()=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  local.repo.save('sets',{reps:10},row.id,300);
  // Author a tag change before clearing it; an unchanged dormant null is not an edit.
  enabled.save('sets',{reps:10,tag:'drop'},row.id,350);
  enabled.save('sets',{reps:11,tag:null},row.id,400);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  expect(enabled.pending()[0].row.data).toMatchObject({reps:11,tag:null});
  local.repo.remove('sets',row.id,500);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1');
  expect(enabled.pending()[0].row.deleted_at).toBe(500);
  expect(Object.values(enabled.pending()[0].row.data).every(value=>value===null)).toBe(true);
 }finally{local.sqlite.close();}
});


test.each(['retained', 'never ON', 'pending OFF'] as const)('%s: ON edit before first ON pull preserves the other device tag',async(history)=>{
 const server=await serverDatabase(),a=await localDatabase(),b=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const ra=new Repository(a.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 const off=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id);
 const ea=new SyncEngine(ra,transport);
 const initial=new SyncEngine(new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id,on),transport);
 const ebOff=new SyncEngine(off,testTransport(server,OWNER_A));
 let eb: SyncEngine | undefined;
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  ra.putLocal(row);await ea.sync();
  if(history==='retained')await initial.sync();
  ra.save('sets',{reps:8,tag:'drop'},row.id,200);await ea.sync();
  await ebOff.sync();
  expect(off.get('sets',row.id)?.data.tag).toBe(history==='retained'?'warmup':null);
  if(history==='pending OFF')off.save('sets',{reps:9},row.id,250);
  const rb=new Repository(b.db,OWNER_A,DEVICE_B,()=>row.id,on);
  // Edit the base field before any enabled replay, retaining the local gated values.
  rb.save('sets',{...rb.get('sets',row.id)!.data,reps:10},row.id,300);
  const push=jest.fn(transport.push);
  eb=new SyncEngine(rb,{...transport,push});await eb.sync();
  expect(eb.status).toBe('idle');expect(push).toHaveBeenCalledTimes(1);
  expect((await transport.pull('sets','0',100))[0].row.data).toMatchObject({reps:10,tag:'drop'});
  await ea.sync();await eb.sync();
  expect(ra.get('sets',row.id)).toEqual(rb.get('sets',row.id));
  expect(ra.get('sets',row.id)?.data).toMatchObject({reps:10,tag:'drop'});
  expect(ra.pending()).toEqual([]);expect(rb.pending()).toEqual([]);
 }finally{ea.close();initial.close();ebOff.close();eb?.close();a.sqlite.close();b.sqlite.close();await server.close();}
});


test('pre-replay ON edits reconcile only unchanged gated columns across repeated edits and restart',async()=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow('machine_notes'),data:{step:5,bar_weight:20,unit_override:'kg'}};
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('machine_notes',[{row,server_seq:'1'}],'1');
  enabled.save('machine_notes',{...enabled.get('machine_notes',row.id)!.data,step:10,unit_override:null},row.id,300);
  enabled.save('machine_notes',{...enabled.get('machine_notes',row.id)!.data,exercise:'Fixture lift'},row.id,301);
  const restarted=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  expect(restarted.cursor('machine_notes')).toBe('0');
  restarted.applyPage('machine_notes',[{row:{...row,updated_at:200,data:{step:7,bar_weight:30,unit_override:'lb'}},server_seq:'2'}],'2');
  expect(restarted.pending()[0].row).toMatchObject({updated_at:301,data:{step:10,bar_weight:30,unit_override:null,exercise:'Fixture lift'}});
 }finally{local.sqlite.close();}
});


test('pending ON edit survives OFF newer-row merge then ON edit before replay without uploading stale gated values', async () => {
 const server=await serverDatabase(),local=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
 const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
 const engine=new SyncEngine(enabled,transport);
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  await transport.push([row]);await engine.sync();
  enabled.save('sets',{...enabled.get('sets',row.id)!.data,reps:9},row.id,200);
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,`dormant-v1:sets:${row.id}`)).toBeUndefined();
  const remote={...row,device_id:DEVICE_B,updated_at:300,data:{reps:10,tag:'drop'}};
  await transport.push([remote]);
  const page=await transport.pull('sets','0',100);
  off.applyPage('sets',page,page.at(-1)!.server_seq);
  expect(off.get('sets',row.id)?.data).toMatchObject({reps:10,tag:'warmup'});
  expect(enabled.pending()).toHaveLength(1);
  const restarted=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  restarted.save('sets',{...restarted.get('sets',row.id)!.data,reps:11},row.id,400);
  const resumed=new SyncEngine(restarted,transport);
  try {
   await resumed.sync();expect(resumed.status).toBe('idle');
   expect((await transport.pull('sets','0',100))[0].row.data).toMatchObject({reps:11,tag:'drop'});
   expect(restarted.pending()).toEqual([]);
  } finally { resumed.close(); }
 } finally { engine.close();local.sqlite.close();await server.close(); }
});

test('OFF pulls reset completed replay across OFF ON OFF ON cycles, isolated for two owners', async () => {
 const local=await localDatabase();
 const state=(owner:string)=>local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(owner,'replay:v1:sets')?.value;
 try {
  const a=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
  const b=new Repository(local.db,OWNER_B,DEVICE_A,()=>syntheticRow().id,on);
  a.applyPage('sets',[],'5',true);b.applyPage('sets',[],'8',true);
  expect(state(OWNER_A)).toBe('complete');expect(state(OWNER_B)).toBe('complete');
  const off=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id);
  for(const cursor of ['1','2']) {
   // Empty OFF pulls must also invalidate the previous ON completion.
   off.applyPage('sets',[],cursor,true);
   expect(state(OWNER_A)).toBe('needed');expect(a.cursor('sets')).toBe('0');
   expect(state(OWNER_B)).toBe('complete');expect(b.cursor('sets')).toBe('8');
   const restarted=new Repository(local.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on);
   restarted.applyPage('sets',[],'5',true);
   expect(state(OWNER_A)).toBe('complete');
  }
  new Repository(local.db,OWNER_B,DEVICE_A,()=>syntheticRow().id).save('sets',{reps:9},syntheticRow().id,300);
  expect(state(OWNER_B)).toBe('needed');expect(b.cursor('sets')).toBe('0');
  expect(state(OWNER_A)).toBe('complete');expect(a.cursor('sets')).toBe('5');
 } finally { local.sqlite.close(); }
});

test('ON edit while a replay page is in flight preserves server gated values through final empty page', async () => {
 const server=await serverDatabase(),local=await localDatabase();
 const transport=testTransport(server,OWNER_A,on);
 const row={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
 const remote={...row,updated_at:200,device_id:DEVICE_B,data:{reps:9,tag:'drop'}};
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
 let edited=false;
 const engine=new SyncEngine(enabled,{...transport,pull:async(table,after,limit)=>{
  const page=await transport.pull(table,after,limit);
  if(table==='sets'&&after==='1'&&!edited) {
   edited=true;
   enabled.save('sets',{...enabled.get('sets',row.id)!.data,reps:10},row.id,300);
  }
  return page;
 }},1);
 try {
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1',true);
  await transport.push([remote]);
  local.repo.applyPage('sets',await transport.pull('sets','0',100),'1');
  await engine.sync();expect(engine.status).toBe('idle');expect(edited).toBe(true);
  expect((await transport.pull('sets','0',100))[0].row.data).toMatchObject({reps:10,tag:'drop'});
  expect(enabled.pending()).toEqual([]);
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,'replay:v1:sets')?.value).toBe('complete');
 } finally { engine.close();local.sqlite.close();await server.close(); }
});

test('missing replay record requires upgrade replay and stale final page cannot overwrite an ON edit reset', async () => {
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'drop'}};
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,'replay:v1:sets')).toBeUndefined();
  enabled.applyPage('sets',[{row,server_seq:'5'}],'5');
  enabled.save('sets',{...row.data,reps:9},row.id,300);
  expect(enabled.cursor('sets')).toBe('0');
  enabled.applyPage('sets',[],'5',true,'5');
  expect(enabled.cursor('sets')).toBe('0');
  expect(local.sqlite.prepare('SELECT value FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,'replay:v1:sets')?.value).not.toBe('complete');
  enabled.applyPage('sets',[{row,server_seq:'5'}],'5',true,'0');
  expect(enabled.cursor('sets')).toBe('5');
 } finally {local.sqlite.close();}
});

test('repeat ON edits to a still dormant row keep replay page progress', async () => {
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'drop'}};
  local.repo.putLocal(row);
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('sets',[],'5');
  enabled.save('sets',{...enabled.get('sets',row.id)!.data,reps:9},row.id,300);
  enabled.save('sets',{...enabled.get('sets',row.id)!.data,reps:10},row.id,301);
  expect(enabled.cursor('sets')).toBe('5');
  enabled.applyPage('sets',[{row,server_seq:'6'}],'6',true);
  expect(enabled.pending()[0].row.data).toMatchObject({reps:10,tag:'drop'});
 } finally {local.sqlite.close();}
});

test('non-gated-only dormant marker refills all gated columns', async () => {
 const local=await localDatabase();
 try {
  const row={...syntheticRow('sets'),data:{reps:8,tag:'drop'}};
  local.repo.putLocal(row);
  local.sqlite.prepare('UPDATE sync_state SET value=? WHERE owner_id=? AND key=?').run('["x"]',OWNER_A,`dormant-v1:sets:${row.id}`);
  const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
  enabled.applyPage('sets',[{row,server_seq:'1'}],'1',true);
  expect(enabled.get('sets',row.id)!.data.tag).toBe('drop');
 } finally {local.sqlite.close();}
});

test('engine retries a reset final page before pushing the ON edit', async () => {
 const local=await localDatabase();
 const row={...syntheticRow('sets'),data:{reps:8,tag:'drop'}};
 const enabled=new Repository(local.db,OWNER_A,DEVICE_A,()=>row.id,on);
 const pulls:string[]=[],pushed:unknown[]=[];
 let edited=false;
 const engine=new SyncEngine(enabled,{
  owner:OWNER_A,syncFlags:on,
  pull:async(table,after)=>{
   if(table!=='sets')return [];
   pulls.push(after);
   if(!edited) {
    edited=true;
    enabled.save('sets',{...enabled.get('sets',row.id)!.data,reps:9},row.id,300);
    return [];
   }
   return after==='0'?[{row,server_seq:'5'}]:[];
  },
  push:async rows=>{pushed.push(...rows);expect(pulls).toEqual(['5','0','5']);},
 },1);
 try {
  enabled.applyPage('sets',[{row,server_seq:'5'}],'5');
  await engine.sync();
  expect(engine.status).toBe('idle');
  expect(pushed).toMatchObject([{data:{reps:9,tag:'drop'}}]);
 } finally {engine.close();local.sqlite.close();}
});
