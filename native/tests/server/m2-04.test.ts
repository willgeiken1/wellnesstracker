import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../src/data/migrations';
import { Repository } from '../../src/data/repository';
import { SyncEngine } from '../../src/data/sync/engine';
import { canonicalRow } from '../../src/data/rows';
import { syncFields, syncTables, projectSyncRow, DEFAULT_SYNC_FLAGS } from '../../src/data/sync/flags';
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
test.each(examples)('%s two simulated devices: LWW ties/stale writes, nullable values and tombstones',async(table,data)=>{
 const server=await serverDatabase();let serial=0;
 try {
  await fc.assert(fc.asyncProperty(fc.integer({min:101,max:500}),fc.boolean(),fc.integer({min:1,max:7}),async(stamp,nullable,n)=>{
   const a=await localDatabase(),b=await localDatabase();
   const ra=new Repository(a.db,OWNER_A,DEVICE_A,()=>syntheticRow().id,on),rb=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id,on);
   const transport=testTransport(server,OWNER_A),ea=new SyncEngine(ra,transport),eb=new SyncEngine(rb,transport);
   const id=`30000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
   const generated=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,typeof value==='number'?n: key==='tag'||key==='superset_group'?`fixture ${n}`:value]));
   const original={...syntheticRow(table),id,updated_at:stamp,data:nullable?Object.fromEntries(Object.keys(data).map(k=>[k,null])):generated};
   try {
    ra.putLocal(original);await ea.sync();await eb.sync();expect(rb.get(table,id)).toEqual(canonicalRow(original));
    const winner={...original,device_id:DEVICE_B,updated_at:stamp+1,data};
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
  }),{numRuns:5});
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
  expect(()=>new SyncEngine(local.repo,{owner:OWNER_A,syncFlags:DEFAULT_SYNC_FLAGS,push,pull})).toThrow('Sync feature flags must match.');
  expect(push).not.toHaveBeenCalled();expect(pull).not.toHaveBeenCalled();
 }finally{local.sqlite.close();}
});

test('OFF device syncs old fields without uploading/accepting v1 fields or querying gated tables',async()=>{
 const server=await serverDatabase(),a=await localDatabase(),b=await localDatabase();
 const transport=testTransport(server,OWNER_A);
 const off=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id);
 const pull=jest.fn(transport.pull),push=jest.fn(transport.push);
 const enabledEngine=new SyncEngine(a.repo,transport),offEngine=new SyncEngine(off,{owner:OWNER_A,push,pull});
 try {
  const original={...syntheticRow('sets'),data:{reps:8,tag:'warmup'}};
  a.repo.putLocal(original);a.repo.putLocal({...syntheticRow('pauses'),data:{start_day:'2026-10-01'}});
  await enabledEngine.sync();await offEngine.sync();expect(offEngine.status).toBe('idle');
  expect(off.get('sets',original.id)?.data.tag).toBeNull();expect(off.list('pauses')).toEqual([]);
  for(const [table] of pull.mock.calls)expect(['custom_exercises','plans','pauses']).not.toContain(table);
  off.save('sets',{reps:9},original.id,200);await offEngine.sync();
  for(const [rows] of push.mock.calls)for(const row of rows)expect(row.data).not.toHaveProperty('tag');
  const remote=(await transport.pull('sets','0',100))[0].row;expect(remote.data).toMatchObject({reps:9,tag:'warmup'});
  const enabled=new Repository(b.db,OWNER_A,DEVICE_B,()=>original.id,on),engine=new SyncEngine(enabled,transport);
  await engine.sync();expect(engine.status).toBe('idle');expect(enabled.get('sets',original.id)?.data.tag).toBe('warmup');engine.close();
 }finally{enabledEngine.close();offEngine.close();a.sqlite.close();b.sqlite.close();await server.close();}
});
