import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { serverDatabase, asUser, testTransport } from './pglite';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import { syncedTables } from '../../src/data/rows';
let db: PGlite;
beforeAll(async () => { db = await serverDatabase(); });
afterAll(async () => { await db?.close(); });
test.each(syncedTables.filter(t=>t!=='purges'))('%s enforces SELECT/INSERT/UPDATE/DELETE ownership and WITH CHECK', async table => {
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
 for(const table of syncedTables.filter(t=>t!=='purges')){
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
   expect({role,table,privilege,allowed:result.rows[0].allowed}).toEqual({role,table,privilege,allowed:role==='authenticated'&&(table==='purges'?privilege==='SELECT':['SELECT','INSERT','UPDATE'].includes(privilege))});
  }
 }
 expect((await db.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[`public.${table}`])).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);
});
test('sequence and function privilege matrix; public functions have explicit security modes and pinned search_path',async()=>{
 for(const role of ['anon','authenticated']) {
  for(const privilege of ['USAGE','SELECT','UPDATE']) {
   expect((await db.query<{allowed:boolean}>('SELECT has_sequence_privilege($1,$2,$3) AS allowed',[role,'public.row_sync_seq',privilege])).rows[0].allowed).toBe(role==='authenticated'&&privilege==='USAGE');
  }
  for(const signature of ['public.row_sync_guard()','public.sync_push(jsonb)']) {
   expect((await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,signature])).rows[0].allowed).toBe(role==='authenticated'&&signature==='public.sync_push(jsonb)');
  }
 }
 for (const role of ['anon','authenticated','service_role']) {
  expect((await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,'public.native_pwa_invalidate_on_purge()','EXECUTE') AS allowed",[role])).rows[0].allowed).toBe(false);
 }
 const functions=await db.query<{proname:string;prosecdef:boolean;proconfig:string[]}>("SELECT proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname");
 expect(functions.rows.map(f=>f.proname)).toEqual(['native_pwa_invalidate_on_purge','row_sync_guard','sync_purge_range','sync_push']);
 for(const f of functions.rows){expect(f.prosecdef).toBe(['native_pwa_invalidate_on_purge','sync_purge_range'].includes(f.proname));expect(f.proconfig).toEqual(['search_path=""']);}
});
test.each(syncedTables.filter(t=>t!=='purges'))('%s rejects anonymous access, owner DELETE and TRUNCATE; server_seq stays server-assigned',async table=>{
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


// Raw SQL/RPC calls deliberately bypass client validation and use the existing
// authenticated-role harness, including its permissive Supabase default grants.
test.each(syncedTables.filter(t=>t!=='purges'))('%s isolates B tombstones and rejects forged ownership without changing A rows', async table => {
 const row = {...syntheticRow(table), id: '30000000-0000-4000-8000-000000000201'};
 await testTransport(db, OWNER_A).push([row]);
 const before = (await db.query(`SELECT * FROM public.${table} WHERE id=$1`, [row.id])).rows;
 await expect(testTransport(db, OWNER_B).push([{...row, updated_at: 200, deleted_at: 200}]))
  .rejects.toThrow('Row owner mismatch');
 expect((await db.query(`SELECT * FROM public.${table} WHERE id=$1`, [row.id])).rows).toEqual(before);
 expect((await asUser(db, OWNER_B, tx => tx.query(`SELECT * FROM public.${table} WHERE id=$1`, [row.id]))).rows).toEqual([]);
 // With a truthful B envelope, the composite owner/id key permits only B's own tombstone.
 await testTransport(db, OWNER_B).push([{...row, owner_id: OWNER_B, updated_at: 200, deleted_at: 200}]);
 expect((await db.query(`SELECT * FROM public.${table} WHERE owner_id=$1 AND id=$2`, [OWNER_A, row.id])).rows).toEqual(before);
 const own = (await asUser(db, OWNER_B, tx => tx.query<{owner_id: string; deleted_at: number}>(
  `SELECT owner_id,deleted_at FROM public.${table} WHERE id=$1`, [row.id]))).rows;
 expect(own).toHaveLength(1);
 expect(own[0].owner_id).toBe(OWNER_B);
 expect(Number(own[0].deleted_at)).toBe(200);
});

test.each(syncedTables.filter(t=>t!=='purges'))('%s rolls back a valid first batch row when a later row forges owner_id', async table => {
 const valid = {...syntheticRow(table), id: '30000000-0000-4000-8000-000000000202'};
 const forged = {...valid, id: '30000000-0000-4000-8000-000000000203', owner_id: OWNER_B};
 // The legitimate row must run first to distinguish atomic rollback from early rejection.
 await expect(asUser(db, OWNER_A, tx => tx.query('SELECT public.sync_push($1::jsonb)', [JSON.stringify([valid, forged])])))
  .rejects.toThrow('Row owner mismatch');
 expect((await db.query(`SELECT * FROM public.${table} WHERE id IN ($1,$2)`, [valid.id, forged.id])).rows).toEqual([]);
});

test.each(syncedTables.filter(t=>t!=='purges'))('%s RPC rejects a missing owner_id and rolls back the preceding valid row', async table => {
 const valid = {...syntheticRow(table), id: '30000000-0000-4000-8000-000000000204'};
 const missing = Object.fromEntries(Object.entries({...valid, id: '30000000-0000-4000-8000-000000000205'})
  .filter(([key]) => key !== 'owner_id'));
 // Table defaults do not apply here: sync_push explicitly requires the envelope owner.
 await expect(asUser(db, OWNER_A, tx => tx.query('SELECT public.sync_push($1::jsonb)', [JSON.stringify([valid, missing])])))
  .rejects.toThrow('Row owner mismatch');
 // Superuser inspection covers every owner namespace, not just the caller's visible rows.
 expect((await db.query(`SELECT * FROM public.${table} WHERE id IN ($1,$2)`, [valid.id, missing.id])).rows).toEqual([]);
});

test.each(syncedTables.filter(t=>t!=='purges'))('%s RPC rejects server_seq in either envelope or data; accepted writes get a server sequence', async table => {
 const row = {...syntheticRow(table), id: '30000000-0000-4000-8000-000000000206'};
 const transport = testTransport(db, OWNER_A);
 await transport.push([row]);
 const before = (await db.query<{server_seq: string}>(`SELECT *,server_seq::text AS server_seq FROM public.${table} WHERE id=$1`, [row.id])).rows;
 const updated = {...row, updated_at: 200};
 for (const forged of [{...updated, server_seq: '42'}, {...updated, data: {...updated.data, server_seq: '42'}}]) {
  await expect(asUser(db, OWNER_A, tx => tx.query('SELECT public.sync_push($1::jsonb)', [JSON.stringify([forged])])))
   .rejects.toThrow('Invalid row fields');
  expect((await db.query(`SELECT *,server_seq::text AS server_seq FROM public.${table} WHERE id=$1`, [row.id])).rows).toEqual(before);
 }
 await transport.push([updated]);
 const stored = (await db.query<{server_seq: string; updated_at: number}>(`SELECT server_seq::text,updated_at FROM public.${table} WHERE id=$1`, [row.id])).rows[0];
 expect(BigInt(stored.server_seq)).toBeGreaterThan(BigInt(before[0].server_seq));
 expect(stored.server_seq).not.toBe('42');
 expect(Number(stored.updated_at)).toBe(200);
});

test.each(syncedTables.filter(t=>t!=='purges'))('%s direct authenticated INSERT overwrites a forged server_seq', async table => {
 const row = {...syntheticRow(table), id: '30000000-0000-4000-8000-000000000207'};
 const result = await asUser(db, OWNER_A, tx => tx.query<{owner_id: string; server_seq: string}>(
  `INSERT INTO public.${table}(owner_id,id,updated_at,device_id,server_seq${table === 'weigh_ins' ? ',source' : ''})
   VALUES($1,$2,100,$3,42${table === 'weigh_ins' ? ",'app'" : ''}) RETURNING owner_id,server_seq::text`,
  [OWNER_A, row.id, row.device_id]));
 expect(result.rows).toHaveLength(1);
 expect(result.rows[0].owner_id).toBe(OWNER_A);
 expect(BigInt(result.rows[0].server_seq)).toBeGreaterThan(0n);
 expect(result.rows[0].server_seq).not.toBe('42');
 expect((await db.query(`SELECT owner_id,server_seq::text FROM public.${table} WHERE id=$1`, [row.id])).rows).toEqual(result.rows);
});

test.each(syncedTables.filter(t=>t!=='purges'))('%s guard skips direct stale UPDATE and preserves the entire stored row and sequence', async table => {
 const row = {...syntheticRow(table), id: '30000000-0000-4000-8000-000000000208', updated_at: 300};
 await testTransport(db, OWNER_A).push([row]);
 const before = (await db.query(`SELECT * FROM public.${table} WHERE id=$1`, [row.id])).rows;
 const result = await asUser(db, OWNER_A, tx => tx.query(
  `UPDATE public.${table} SET updated_at=299,deleted_at=299,device_id='ffffffff-ffff-4fff-afff-ffffffffffff',server_seq=42
   WHERE id=$1 RETURNING *`, [row.id]));
 expect(result.rows).toEqual([]);
 expect(result.affectedRows).toBe(0);
 expect((await db.query(`SELECT * FROM public.${table} WHERE id=$1`, [row.id])).rows).toEqual(before);
});

test.each(syncedTables.filter(t=>t!=='purges'))('%s guard rejects owner changes, including reassignment to the calling owner', async table => {
 const row = {...syntheticRow(table), id: '30000000-0000-4000-8000-000000000209'};
 await testTransport(db, OWNER_A).push([row]);
 const before = (await db.query(`SELECT * FROM public.${table} WHERE id=$1`, [row.id])).rows;
 await expect(asUser(db, OWNER_A, tx => tx.query(
  `UPDATE public.${table} SET owner_id=$1,updated_at=200 WHERE id=$2`, [OWNER_B, row.id])))
  .rejects.toThrow('Row owner mismatch');
 // A test-only permissive policy exposes the alternate path independently of RLS:
 // B can see A's row, and NEW.owner_id equals auth.uid(), so OLD identity must protect it.
 await db.exec(`CREATE POLICY test_owner_change_path ON public.${table} FOR ALL TO authenticated USING (true) WITH CHECK (true)`);
 try {
  expect((await asUser(db, OWNER_B, tx => tx.query(`SELECT id FROM public.${table} WHERE id=$1`, [row.id]))).rows).toHaveLength(1);
  await expect(asUser(db, OWNER_B, tx => tx.query(
   `UPDATE public.${table} SET owner_id=$1,updated_at=200 WHERE id=$2`, [OWNER_B, row.id])))
   .rejects.toThrow('Row identity is immutable');
 } finally { await db.exec(`DROP POLICY test_owner_change_path ON public.${table}`); }
 expect((await db.query(`SELECT * FROM public.${table} WHERE id=$1`, [row.id])).rows).toEqual(before);
});
