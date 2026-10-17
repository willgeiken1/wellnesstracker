import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { serverDatabase, asUser, testTransport } from './pglite';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import { syncedTables } from '../../src/data/rows';
let db: PGlite;
beforeAll(async () => { db = await serverDatabase(); });
afterAll(async () => { await db?.close(); });
test.each(syncedTables)('%s enforces SELECT/INSERT/UPDATE/DELETE ownership and WITH CHECK', async table => {
  const a = testTransport(db,OWNER_A), row = syntheticRow(table);
  await a.push([row]);
  await asUser(db,OWNER_B,async tx => {
    expect((await tx.query(`SELECT * FROM public.${table}`)).rows).toHaveLength(0);
    expect((await tx.query(`UPDATE public.${table} SET updated_at=200 WHERE owner_id=$1 RETURNING id`,[OWNER_A])).rows).toHaveLength(0);

  });
  await expect(asUser(db,OWNER_B,tx => tx.query(`INSERT INTO public.${table}(owner_id,id,updated_at,device_id${table==='weigh_ins'?',source':''}) VALUES($1,$2,100,$3${table==='weigh_ins'?",'app'":''})`,[OWNER_A,row.id,row.device_id]))).rejects.toThrow();
  await expect(asUser(db,OWNER_A,tx => tx.query(`UPDATE public.${table} SET owner_id=$1,updated_at=200`,[OWNER_B]))).rejects.toThrow();
  await expect(asUser(db,OWNER_B,tx=>tx.query(`DELETE FROM public.${table} WHERE owner_id=$1`,[OWNER_A]))).rejects.toThrow(/permission denied/);
  await expect(testTransport(db,OWNER_B).push([row])).rejects.toThrow();
});
test('server LWW ignores old writes, resolves device ties, retries, tombstones and assigns increasing sequences', async () => {
  const a = testTransport(db,OWNER_A), row = {...syntheticRow(),id:'30000000-0000-4000-8000-000000000099'};
  await a.push([row]);
  const first = (await a.pull('sessions','0',100)).find(r => r.row.id===row.id)!;
  await a.push([row, {...row,updated_at:99}]);
  expect((await a.pull('sessions',first.server_seq,100)).filter(r => r.row.id===row.id)).toEqual([]);
  await a.push([{...row,updated_at:101,deleted_at:101}]);
  const deleted = (await a.pull('sessions',first.server_seq,100)).find(r => r.row.id===row.id)!;
  expect(BigInt(deleted.server_seq)).toBeGreaterThan(BigInt(first.server_seq));
  expect(deleted.row.deleted_at).toBe(101);
  await a.push([{...row,updated_at:101,device_id:'ffffffff-ffff-4fff-afff-ffffffffffff'}]);
  const restored = (await a.pull('sessions',deleted.server_seq,100))[0];
  expect(restored.row.deleted_at).toBeNull();
});
test('RPC rejects local-only tables, non-app sources and envelope-field spoofing atomically', async () => {
  const a = testTransport(db,OWNER_A);
  await expect(a.push([{...syntheticRow(),table:'oura_days'} as never])).rejects.toThrow();
  await expect(a.push([{...syntheticRow('weigh_ins'),data:{source:'health_connect'}}])).rejects.toThrow();
  await expect(a.push([{...syntheticRow(),data:{owner_id:OWNER_B}}])).rejects.toThrow();
});
test('WITH CHECK independently blocks spoofed inserts and owner reassignment on every table',async()=>{
 for(const table of syncedTables){
  await db.exec(`ALTER TABLE public.${table} DISABLE TRIGGER ${table}_guard`);
  try{
   const row=syntheticRow(table);
   await expect(asUser(db,OWNER_B,tx=>tx.query(`INSERT INTO public.${table}(owner_id,id,updated_at,device_id,server_seq${table==='weigh_ins'?',source':''}) VALUES($1,$2,100,$3,999${table==='weigh_ins'?",'app'":''})`,[OWNER_A,'30000000-0000-4000-8000-000000000088',row.device_id]))).rejects.toThrow(/row-level security/);
   await expect(asUser(db,OWNER_A,tx=>tx.query(`UPDATE public.${table} SET owner_id=$1`,[OWNER_B]))).rejects.toThrow(/row-level security/);
  }finally{await db.exec(`ALTER TABLE public.${table} ENABLE TRIGGER ${table}_guard`);}
 }
});
test('anonymous role cannot read row tables or execute the push RPC; physical deletes require tombstones',async()=>{
 await expect(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM public.sessions');})).rejects.toThrow();
 await expect(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT public.sync_push($1::jsonb)',['[]']);})).rejects.toThrow();
 await expect(asUser(db,OWNER_A,tx=>tx.query('DELETE FROM public.sessions'))).rejects.toThrow(/permission denied/);
});
test('server cursor remains exact above JavaScript safe integer range',async()=>{
 await db.query("SELECT setval('public.row_sync_seq',$1::bigint)",['90071992547409930']);
 const transport=testTransport(db,OWNER_A);
 const row={...syntheticRow(),id:'30000000-0000-4000-8000-000000000077',updated_at:900};
 await transport.push([row]);const page=await transport.pull('sessions','90071992547409930',100);
 expect(page[0].server_seq).toBe('90071992547409931');
});

test.each(syncedTables)('%s has exact privileges and forced RLS despite Supabase defaults', async table => {
 for (const role of ['anon','authenticated']) {
  for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
   const result=await db.query<{allowed:boolean}>('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,`public.${table}`,privilege]);
   expect({role,table,privilege,allowed:result.rows[0].allowed}).toEqual({role,table,privilege,allowed:role==='authenticated'&&['SELECT','INSERT','UPDATE'].includes(privilege)});
  }
 }
 expect((await db.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[`public.${table}`])).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
});
test('sequence and function privilege matrix; all public functions are invoker with pinned search_path',async()=>{
 for(const role of ['anon','authenticated']) {
  for(const privilege of ['USAGE','SELECT','UPDATE']) {
   expect((await db.query<{allowed:boolean}>('SELECT has_sequence_privilege($1,$2,$3) AS allowed',[role,'public.row_sync_seq',privilege])).rows[0].allowed).toBe(role==='authenticated'&&privilege==='USAGE');
  }
  for(const signature of ['public.row_sync_guard()','public.sync_push(jsonb)']) {
   expect((await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,signature])).rows[0].allowed).toBe(role==='authenticated'&&signature==='public.sync_push(jsonb)');
  }
 }
 const functions=await db.query<{proname:string;prosecdef:boolean;proconfig:string[]}>("SELECT proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname");
 expect(functions.rows.map(f=>f.proname)).toEqual(['row_sync_guard','sync_push']);
 for(const f of functions.rows){expect(f.prosecdef).toBe(false);expect(f.proconfig).toEqual(['search_path=""']);}
});
test.each(syncedTables)('%s rejects anonymous access, owner DELETE and TRUNCATE; server_seq stays server-assigned',async table=>{
 for(const query of [`SELECT * FROM public.${table}`,`INSERT INTO public.${table} DEFAULT VALUES`,`UPDATE public.${table} SET updated_at=1`,`DELETE FROM public.${table}`,`TRUNCATE public.${table}`]) {
  await expect(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query(query);})).rejects.toThrow(/permission denied/);
 }
 await expect(asUser(db,OWNER_A,tx=>tx.query(`DELETE FROM public.${table}`))).rejects.toThrow(/permission denied/);
 await expect(asUser(db,OWNER_A,tx=>tx.query(`TRUNCATE public.${table}`))).rejects.toThrow(/permission denied/);
 const row=syntheticRow(table);
 await asUser(db,OWNER_A,async tx=>{
  const result=await tx.query<{server_seq:string}>(`UPDATE public.${table} SET updated_at=updated_at+1,server_seq=42 WHERE id=$1 RETURNING server_seq::text`,[row.id]);
  expect(result.rows).toHaveLength(1);expect(result.rows[0].server_seq).not.toBe('42');
 });
});
test('direct guard calls and anonymous sequence manipulation are denied',async()=>{
 for(const role of ['anon','authenticated']) {
  await expect(db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query('SELECT public.row_sync_guard()');})).rejects.toThrow(/permission denied/);
 }
 for(const query of ["SELECT nextval('public.row_sync_seq')","SELECT setval('public.row_sync_seq',42)"]) {
  await expect(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query(query);})).rejects.toThrow(/permission denied/);
 }
 await expect(asUser(db,OWNER_A,tx=>tx.query("SELECT setval('public.row_sync_seq',42)"))).rejects.toThrow(/permission denied/);
});

test('immutable source collisions use the dedicated SQLSTATE on direct updates and RPC pushes',async()=>{
 const row={...syntheticRow('weigh_ins'),id:'30000000-0000-4000-8000-000000000055'};
 await testTransport(db,OWNER_A).push([row]);
 await expect(asUser(db,OWNER_A,tx=>tx.query("UPDATE public.weigh_ins SET source='healthkit',updated_at=201 WHERE id=$1",[row.id]))).rejects.toMatchObject({code:'P2001'});
 // Synthetic legacy/corrupt remote provenance; production only admits app-source rows.
 await db.exec('ALTER TABLE public.weigh_ins DROP CONSTRAINT weigh_ins_source_check; ALTER TABLE public.weigh_ins DISABLE TRIGGER weigh_ins_guard');
 try {
  await db.query("UPDATE public.weigh_ins SET source='healthkit' WHERE id=$1",[row.id]);
  await db.exec('ALTER TABLE public.weigh_ins ENABLE TRIGGER weigh_ins_guard');
  await expect(testTransport(db,OWNER_A).push([{...row,updated_at:202}])).rejects.toMatchObject({code:'P2001'});
  expect((await db.query('SELECT source FROM public.weigh_ins WHERE id=$1',[row.id])).rows).toEqual([{source:'healthkit'}]);
 } finally {
  await db.exec('ALTER TABLE public.weigh_ins DISABLE TRIGGER weigh_ins_guard');
  await db.query("UPDATE public.weigh_ins SET source='app' WHERE id=$1",[row.id]);
  await db.exec("ALTER TABLE public.weigh_ins ENABLE TRIGGER weigh_ins_guard; ALTER TABLE public.weigh_ins ADD CONSTRAINT weigh_ins_source_check CHECK(source='app')");
 }
});

test('draft SQL explicitly declares both functions SECURITY INVOKER',()=>{
 const migration=readFileSync(join(__dirname,'../../server/row-sync/0001_row_sync.sql'),'utf8');
 const declarations=migration.match(/CREATE FUNCTION[^$]+/g)!;
 expect(declarations).toHaveLength(2);
 for(const declaration of declarations){expect(declaration).toMatch(/SECURITY INVOKER/);expect(declaration).toMatch(/SET search_path = ''/);}
 expect(migration).not.toMatch(/SECURITY DEFINER/i);
});
