import type { PGlite } from '@electric-sql/pglite';
import { serverDatabase, asUser, testTransport } from './pglite';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { SyncEngine } from '../../src/data/sync/engine';
import { columns, syncedTables } from '../../src/data/rows';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
let db: PGlite;
beforeAll(async () => { db = await serverDatabase(); });
afterAll(async () => { await db?.close(); });

test.each(syncedTables.filter(t=>t!=='purges'))('%s wipes pushed and directly updated tombstones, including pull values; resurrection follows LWW', async table => {
 const transport = testTransport(db, OWNER_A);
 const data = Object.fromEntries(Object.entries(columns[table]).map(([key, type]) => [key, key === 'source' ? 'app' : /day$/.test(key) ? '2026-01-01' : key === 'mode' ? 'rotation' : key === 'unit_override' ? 'kg' : key === 'days_per_week' ? 3 : type === 'text' ? 'synthetic' : 42]));
 const row = {...syntheticRow(table), data};
 const expected = Object.fromEntries(Object.keys(data).map(key => [key, key === 'source' ? 'app' : null]));
 await transport.push([{...row, deleted_at: 100}]);
 expect((await transport.pull(table, '0', 100))[0].row.data).toEqual(expected);
 // Unmodified raw RPC transport intentionally supplies values on the tombstone.
 const stored = (await db.query<Record<string, unknown>>(`SELECT * FROM public.${table} WHERE owner_id=$1 AND id=$2`, [OWNER_A,row.id])).rows[0];
 for (const key of Object.keys(data)) expect(stored[key]).toBe(expected[key]);
 await transport.push([{...row, updated_at: 200}]);
 expect((await transport.pull(table, '0', 100))[0].row.data).toEqual(data);
 await asUser(db, OWNER_A, tx => tx.query(`UPDATE public.${table} SET updated_at=300,deleted_at=300 WHERE id=$1`, [row.id]));
 expect((await transport.pull(table, '0', 100))[0].row.data).toEqual(expected);
 await transport.push([{...row, updated_at: 250}]);
 expect((await transport.pull(table, '0', 100))[0].row.deleted_at).toBe(300);
});

test('far-future RPC and direct writes clamp to transaction now before LWW; a later legitimate edit wins', async () => {
 const row = {...syntheticRow(), id:'30000000-0000-4000-8000-000000000501', updated_at: 8000000000000};
 await asUser(db, OWNER_A, async tx => {
  const now = Number((await tx.query<{stamp:string}>("SELECT floor(extract(epoch FROM now())*1000)::bigint::text AS stamp")).rows[0].stamp);
  await tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify([row])]);
  expect(Number((await tx.query<{updated_at:string}>('SELECT updated_at FROM public.sessions WHERE id=$1',[row.id])).rows[0].updated_at)).toBe(now);
  await tx.query('UPDATE public.sessions SET updated_at=$1,name=$2 WHERE id=$3',[now+1,'legitimate',row.id]);
  await tx.query('UPDATE public.sessions SET updated_at=8000000000000,name=$1 WHERE id=$2',['bad clock',row.id]);
  expect((await tx.query('SELECT name FROM public.sessions WHERE id=$1',[row.id])).rows).toEqual([{name:'legitimate'}]);
 });
});
test('exact +5 minute boundary survives; +5 minutes and 1ms clamps', async () => {
 await asUser(db, OWNER_A, async tx => {
  const now = Number((await tx.query<{stamp:string}>("SELECT floor(extract(epoch FROM now())*1000)::bigint::text AS stamp")).rows[0].stamp);
  for (const [offset, expected] of [[300000,now+300000],[300001,now]]) {
   const row = {...syntheticRow('profile'), id:`30000000-0000-4000-8000-000000000${offset===300000?'502':'503'}`,updated_at:now+offset};
   await tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify([row])]);
   expect(Number((await tx.query<{updated_at:string}>('SELECT updated_at FROM public.profile WHERE id=$1',[row.id])).rows[0].updated_at)).toBe(expected);
  }
 });
});
test('a clamped server row replaces an acknowledged future local revision and a legitimate edit converges', async () => {
 const local=await localDatabase(), row={...syntheticRow('meals'),updated_at:8000000000000};
 const engine=new SyncEngine(local.repo,testTransport(db,OWNER_A));
 try {
  local.repo.putLocal(row); await engine.sync();
  expect(local.repo.get(row.table,row.id)!.updated_at).toBeLessThan(Date.now()+300000);
  local.repo.save(row.table,{name:'later legitimate'},row.id);await engine.sync();
  expect((await testTransport(db,OWNER_A).pull(row.table,'0',100))[0].row.data.name).toBe('later legitimate');
 } finally {engine.close();local.sqlite.close();}
});
test('a clamped stale push reconciles even when its existing server sequence is behind the cursor',async()=>{
 const local=await localDatabase(),transport=testTransport(db,OWNER_A);
 const row={...syntheticRow('goals'),updated_at:Date.now()+120000};
 const engine=new SyncEngine(local.repo,transport);
 try {
  await transport.push([row]);await engine.sync();
  const cursor=local.repo.cursor('goals');
  local.repo.putLocal({...row,updated_at:8000000000000,data:{kind:'bad future fixture'}});
  await engine.sync();
  expect(local.repo.pending()).toEqual([]);expect(local.repo.cursor('goals')).toBe(cursor);
  expect(local.repo.get(row.table,row.id)?.updated_at).toBe(row.updated_at);
  expect(local.repo.get(row.table,row.id)?.data.kind).toBeNull();
 } finally {engine.close();local.sqlite.close();}
});

test.each(['rpc','direct'])('future tombstone clamps both timestamps through %s; ordinary tombstone keeps deletion time',async path=>{
 await asUser(db,OWNER_A,async tx=>{
  const now=Number((await tx.query<{stamp:string}>("SELECT floor(extract(epoch FROM now())*1000)::bigint::text AS stamp")).rows[0].stamp);
  const row={...syntheticRow('photos'),id:path==='rpc'?'30000000-0000-4000-8000-000000000601':'30000000-0000-4000-8000-000000000602',updated_at:8000000000000,deleted_at:8000000000000};
  if(path==='rpc')await tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify([row])]);
  else await tx.query('INSERT INTO public.photos(owner_id,id,device_id,updated_at,deleted_at) VALUES($1,$2,$3,$4,$4)',[OWNER_A,row.id,row.device_id,row.updated_at]);
  const stored=(await tx.query<{updated_at:string;deleted_at:string}>('SELECT updated_at,deleted_at FROM public.photos WHERE id=$1',[row.id])).rows[0];
  expect(Number(stored.updated_at)).toBe(now);expect(Number(stored.deleted_at)).toBe(now);
  await tx.query('UPDATE public.photos SET updated_at=$1,deleted_at=$2 WHERE id=$3',[now+1,77,row.id]);
  expect(Number((await tx.query<{deleted_at:string}>('SELECT deleted_at FROM public.photos WHERE id=$1',[row.id])).rows[0].deleted_at)).toBe(77);
 });
});

test('clamped tombstone RPC acknowledgment reconciles both client timestamps and next local stamp',async()=>{
 const local=await localDatabase(),row={...syntheticRow('photos'),id:'30000000-0000-4000-8000-000000000603',updated_at:8000000000000,deleted_at:8000000000000};
 const engine=new SyncEngine(local.repo,testTransport(db,OWNER_A));
 try {
  local.repo.putLocal(row);await engine.sync();
  const stored=local.repo.get(row.table,row.id)!;
  expect(stored.updated_at).toBeLessThan(Date.now()+300000);expect(stored.deleted_at).toBe(stored.updated_at);
  expect(local.repo.pending()).toEqual([]);
  const next=local.repo.save('photos',{},row.id,10).updated_at;
  expect(next).toBeGreaterThan(stored.updated_at);expect(next).toBeLessThan(Date.now()+300002);
 } finally {engine.close();local.sqlite.close();}
});

test.each(['insert','rpc','update'])('independent deletion bound through %s preserves the five-minute window',async path=>{
 await asUser(db,OWNER_A,async tx=>{
  const now=Number((await tx.query<{stamp:string}>("SELECT floor(extract(epoch FROM now())*1000)::bigint::text AS stamp")).rows[0].stamp);
  for(const [index,deletion] of [8000000000000,now+300000].entries()) {
   const row={...syntheticRow('photos'),id:`30000000-0000-4000-8000-0000000007${['insert','rpc','update'].indexOf(path)}${index}`,updated_at:now,deleted_at:deletion};
   if(path==='rpc')await tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify([row])]);
   else {
    await tx.query('INSERT INTO public.photos(owner_id,id,device_id,updated_at,deleted_at) VALUES($1,$2,$3,$4,$5)',[OWNER_A,row.id,row.device_id,path==='update'?now-1:now,path==='update'?null:deletion]);
    if(path==='update')await tx.query('UPDATE public.photos SET updated_at=$1,deleted_at=$2 WHERE id=$3',[now,deletion,row.id]);
   }
   const stored=(await tx.query<{updated_at:string;deleted_at:string}>('SELECT updated_at,deleted_at FROM public.photos WHERE id=$1',[row.id])).rows[0];
   expect(Number(stored.updated_at)).toBe(now);expect(Number(stored.deleted_at)).toBe(index===0?now:deletion);
  }
 });
});

test('account deletion cascades all owner FKs and preserves the other owner', async () => {
 for(const table of syncedTables) {
  const row={...syntheticRow(table),id:'30000000-0000-4000-8000-000000000504'};
  if(table==='purges') {
   for(const owner of [OWNER_A,OWNER_B])await asUser(db,owner,tx=>tx.query("SELECT public.sync_purge_range($1,'2026-10-01','2026-10-01',0,'UTC')",[row.id]));
  }else {
   await testTransport(db,OWNER_A).push([row]);
   await testTransport(db,OWNER_B).push([{...row,owner_id:OWNER_B}]);
  }
 }
 const constraints=await db.query<{table_name:string;confdeltype:string}>(`SELECT conrelid::regclass::text AS table_name,confdeltype FROM pg_constraint WHERE contype='f' AND confrelid='auth.users'::regclass`);
 expect(constraints.rows.map(row=>row.table_name.replace(/^public\./,'')).sort()).toEqual([...syncedTables].sort());
 expect(constraints.rows.every(row=>row.confdeltype==='c')).toBe(true);
 await db.query('DELETE FROM auth.users WHERE id=$1',[OWNER_A]);
 for(const table of syncedTables) {
  expect((await db.query(`SELECT id FROM public.${table} WHERE owner_id=$1`,[OWNER_A])).rows).toEqual([]);
  expect((await db.query(`SELECT id FROM public.${table} WHERE owner_id=$1`,[OWNER_B])).rows).toHaveLength(1);
 }
});

test.each([OWNER_A,'demo'])('wipe erases every local table and sync metadata for %s only',async owner=>{
 const local=await localDatabase(), repo=new Repository(local.db,owner,local.repo.device,()=>syntheticRow().id);
 const other=new Repository(local.db,OWNER_B,local.repo.device,()=>syntheticRow().id);
 try {
  for(const table of syncedTables) {
   if(table==='purges') {
    repo.applyPage(table,[{row:{...syntheticRow(table),owner_id:owner},server_seq:'1'}],'1');
    other.applyPage(table,[{row:{...syntheticRow(table),owner_id:OWNER_B},server_seq:'1'}],'1');
   }else {repo.putLocal({...syntheticRow(table),owner_id:owner});other.putLocal({...syntheticRow(table),owner_id:OWNER_B});}
   repo.applyPage(table,[],'17');
  }
  if(owner===OWNER_A)repo.flagConflict(repo.pending()[0]);
  repo.cacheOura('2026-01-01',{fixture:true});
  repo.wipe();
  for(const table of [...syncedTables,'sync_state','sync_outbox','sync_conflicts','oura_days']) {
   expect(local.sqlite.prepare(`SELECT * FROM ${table} WHERE owner_id=?`).all(owner)).toEqual([]);
  }
  for(const table of syncedTables)expect(other.list(table)).toHaveLength(1);
  const returned=new Repository(local.db,owner,local.repo.device,()=>syntheticRow().id);
  expect(returned.pending()).toEqual([]);expect(returned.conflicts()).toEqual([]);expect(returned.cursor('sessions')).toBe('0');
 } finally {local.sqlite.close();}
});
