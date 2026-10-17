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
    expect((await tx.query(`DELETE FROM public.${table} WHERE owner_id=$1 RETURNING id`,[OWNER_A])).rows).toHaveLength(0);
  });
  await expect(asUser(db,OWNER_B,tx => tx.query(`INSERT INTO public.${table}(owner_id,id,updated_at,device_id${table==='weigh_ins'?',source':''}) VALUES($1,$2,100,$3${table==='weigh_ins'?",'app'":''})`,[OWNER_A,row.id,row.device_id]))).rejects.toThrow();
  await expect(asUser(db,OWNER_A,tx => tx.query(`UPDATE public.${table} SET owner_id=$1,updated_at=200`,[OWNER_B]))).rejects.toThrow();
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
 await expect(asUser(db,OWNER_A,tx=>tx.query('DELETE FROM public.sessions'))).rejects.toThrow('Use a row tombstone');
});
test('server cursor remains exact above JavaScript safe integer range',async()=>{
 await db.query("SELECT setval('public.row_sync_seq',$1::bigint)",['90071992547409930']);
 const transport=testTransport(db,OWNER_A);
 const row={...syntheticRow(),id:'30000000-0000-4000-8000-000000000077',updated_at:900};
 await transport.push([row]);const page=await transport.pull('sessions','90071992547409930',100);
 expect(page[0].server_seq).toBe('90071992547409931');
});
