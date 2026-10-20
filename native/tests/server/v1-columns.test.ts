import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { serverDatabase, asUser, testTransport } from './pglite';
import { localDatabase } from './sqlite';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import { canonicalRow, pushRow, fromWire, validateRow, syncedTables, type Row, type Table } from '../../src/data/rows';
let db: PGlite;
let serial = 7000;
const id = () => `30000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
const row = (table: Table, data: Row['data'], stamp=100): Row => ({...syntheticRow(table),id:id(),updated_at:stamp,data});
const purge = (key=id(), cutoff=100) => asUser(db,OWNER_A,tx=>tx.query("SELECT public.sync_purge_range($1,'2026-10-01','2026-10-31',$2,'America/Chicago')",[key,cutoff]));
beforeEach(async()=>{db=await serverDatabase();});
afterEach(async()=>{await db?.close();});
const examples: [Table,Row['data']][] = [
 ['sets',{tag:'warmup'}], ['routine_exercises',{rep_min:6,rep_max:10,superset_group:'fixture'}],
 ['entries',{superset_group:'fixture'}], ['machine_notes',{step:5,bar_weight:20,unit_override:'kg'}],
 ['custom_exercises' as Table,{name:'Fixture lift',main_muscle:'quads',helpers:'["glutes"]',equipment:'barbell'}],
 ['settings',{plate_set:'[20,10,5]',rest_per_exercise:'{"Fixture lift":90}',rest_style:'countdown'}],
 ['plans' as Table,{mode:'rotation',days_per_week:3}], ['food_entries',{fiber_g:3,sugar_g:null,sodium_mg:20}],
 ['saved_foods',{fiber_g:null,sugar_g:0,sodium_mg:null}], ['pauses' as Table,{start_day:'2026-10-01',end_day:'2026-10-03'}],
];
test.each(examples)('%s new values round-trip through SQLite and server; LWW, nulls and tombstone wipe',async(table,data)=>{
 await fc.assert(fc.asyncProperty(fc.integer({min:101,max:500}),async stamp=>{
  const local=await localDatabase();const transport=testTransport(db,OWNER_A);const original=row(table,data,stamp);
  try {
   local.repo.putLocal(original);const [accepted]=await transport.push([local.repo.pending()[0].row]);
   expect(accepted).toEqual(canonicalRow(original));
   await transport.push([{...original,updated_at:stamp-1,data:{}}]);
   const pulled=(await transport.pull(table,'0',10000)).find(r=>r.row.id===original.id)!;
   expect(pulled.row).toEqual(canonicalRow(original));
   local.repo.applyPage(table,[pulled],pulled.server_seq);
   expect(local.repo.get(table,original.id)?.data).toMatchObject(data);
   const [dead]=await transport.push([{...original,updated_at:stamp+1,deleted_at:stamp+1}]);
   expect(Object.values(dead.data).every(v=>v===null)).toBe(true);
  }finally{local.sqlite.close();}
 }),{numRuns:5});
});
test('old wire readers discard unknown columns and keep nulls',()=>{
 const wire={...syntheticRow(),server_seq:'1',day:'2026-10-01',name:null,future_column:'ignored'};
 expect(fromWire('sessions',wire).row.data.name).toBeNull();
 expect(fromWire('sessions',wire).row.data).not.toHaveProperty('future_column');
});
test.each(['weigh_ins','measurements','sessions','cardio_sessions','food_entries','food_targets','plan_days','goals'] as Table[])('%s canonical day validation matches SQL; tombstone null accepted',async table=>{
 const key=table==='goals'?'target_day':'day';
 for(const day of ['2026-1-01','2026-10-1','2026-10-01junk','x2026-10-01','2026/10/01']) {
  const bad=row(table,{[key]:day,...(table==='weigh_ins'?{source:'app'}:{})});
  expect(()=>validateRow(bad)).toThrow();
  await expect(testTransport(db,OWNER_A).push([bad])).rejects.toThrow();
 }
 const good=row(table,{[key]:'2026-10-01',...(table==='weigh_ins'?{source:'app'}:{})});
 await testTransport(db,OWNER_A).push([good,{...good,updated_at:101,deleted_at:101,data:table==='weigh_ins'?{source:'app'}:{}}]);
});
test('purge blocks stale and never-synced rows, keeps post-cutoff edits, retries do nothing and isolates owners',async()=>{
 const t=testTransport(db,OWNER_A);const old=row('sessions',{day:'2026-10-04'});const edited=row('sessions',{day:'2026-10-04'},101);
 await t.push([old,edited]);await testTransport(db,OWNER_B).push([{...old,owner_id:OWNER_B}]);
 const key=id();await purge(key);
 const before=(await db.query('SELECT * FROM public.purges WHERE id=$1',[key])).rows;
 await purge(key,999);
 expect((await db.query('SELECT * FROM public.purges WHERE id=$1',[key])).rows).toEqual(before);
 for(const incoming of [old,row('sessions',{day:'2026-10-04'})]) expect((await t.push([incoming]))[0].deleted_at).not.toBeNull();
 expect((await t.pull('sessions','0',10000)).find(r=>r.row.id===edited.id)?.row.deleted_at).toBeNull();
 expect((await testTransport(db,OWNER_B).pull('sessions','0',10000)).find(r=>r.row.id===old.id)?.row.deleted_at).toBeNull();
});
test('purge wins exact +5 minute clock tie without changing clamp-to-now',async()=>{
 await asUser(db,OWNER_A,async tx=>{
  const now=Number((await tx.query<{n:string}>('SELECT floor(extract(epoch FROM now())*1000)::bigint::text n')).rows[0].n);
  const original=row('sessions',{day:'2026-10-04'});
  await tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify([original])]);
  await tx.query("SELECT public.sync_purge_range($1,'2026-10-01','2026-10-31',$2,'UTC')",[id(),now]);
  const result=await tx.query<{sync_push:Row[]}>('SELECT public.sync_push($1::jsonb)',[JSON.stringify([{...original,updated_at:now+300000}])]);
  expect(result.rows[0].sync_push[0].deleted_at).not.toBeNull();
 });
});
test('purge children through sessions, including late offline children after parent payload wipe',async()=>{
 const t=testTransport(db,OWNER_A);const session=row('sessions',{day:'2026-10-04'});const entry=row('entries',{session_id:session.id});const set=row('sets',{entry_id:entry.id});
 await t.push([session,entry,set]);await purge();
 for(const original of [session,entry,set]) expect((await t.pull(original.table,'0',10000)).find(r=>r.row.id===original.id)?.row.deleted_at).not.toBeNull();
 const lateEntry=row('entries',{session_id:session.id});expect((await t.push([lateEntry]))[0].deleted_at).not.toBeNull();
 expect((await t.push([row('sets',{entry_id:lateEntry.id})]))[0].deleted_at).not.toBeNull();
});
test('pulled purges erase unsynced local payloads, children first, and persist for later arrivals',async()=>{
 const local=await localDatabase();
 try {
  const session=row('sessions',{day:'2026-10-04'});const entry=row('entries',{session_id:session.id});const set=row('sets',{entry_id:entry.id});const keep=row('sessions',{day:'2026-10-04'},101);
  for(const r of [session,entry,set,keep])local.repo.putLocal(r);
  const marker=row('purges' as Table,{from_day:'2026-10-01',to_day:'2026-10-31',cutoff_ms:100,tz:'UTC'},500);
  local.repo.applyPage('purges' as Table,[{row:marker,server_seq:'1'}],'1');
  for(const r of [session,entry,set]) {
   expect(local.repo.get(r.table,r.id)?.deleted_at).not.toBeNull();
   expect(Object.values(local.repo.get(r.table,r.id)!.data).every(v=>v===null)).toBe(true);
   const pending=local.repo.pending().find(p=>p.row.id===r.id);
   if(pending)expect(Object.values(pending.row.data).every(v=>v===null)).toBe(true);
  }
  expect(local.repo.get('sessions',keep.id)?.deleted_at).toBeNull();
  const late=row('sessions',{day:'2026-10-02'});local.repo.putLocal(late);
  expect(local.repo.get('sessions',late.id)?.deleted_at).not.toBeNull();
  const delayed=row('sessions',{day:'2026-10-03'});
  local.repo.applyPage('sessions',[{row:delayed,server_seq:'2'}],'2');
  expect(local.repo.get('sessions',delayed.id)?.deleted_at).not.toBeNull();
 }finally{local.sqlite.close();}
});
test('F4 executable final block refuses user_id on a guarded table',async()=>{
 const sql=readFileSync(join(__dirname,'../../server/row-sync/0002_v1_columns.sql'),'utf8');
 const block=sql.slice(sql.lastIndexOf('DO $$'),sql.lastIndexOf('COMMIT;'));
 await db.exec('ALTER TABLE public.pauses ADD COLUMN user_id uuid');
 try{await expect(db.exec(block)).rejects.toThrow('row-sync tables must use owner_id');}
 finally{await db.exec('ALTER TABLE public.pauses DROP COLUMN user_id');}
});

test('offline workout child-first push cannot leave live children after the session is rejected by a purge',async()=>{
 await purge();
 const session=row('sessions',{day:'2026-10-04'});const entry=row('entries',{session_id:session.id});const set=row('sets',{entry_id:entry.id});
 const t=testTransport(db,OWNER_A);
 await t.push([set,entry,session]);
 for(const r of [session,entry,set])expect((await t.pull(r.table,'0',10000)).find(p=>p.row.id===r.id)?.row.deleted_at).not.toBeNull();
});
test('every row-sync table denies service_role truncate, trigger installation and references',async()=>{
 for(const table of syncedTables) {
  for(const privilege of ['TRUNCATE','TRIGGER','REFERENCES'])expect((await db.query<{allowed:boolean}>('SELECT has_table_privilege($1,$2,$3) allowed',['service_role',`public.${table}`,privilege])).rows[0].allowed).toBe(false);
  await expect(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');await tx.query(`TRUNCATE public.${table}`);})).rejects.toThrow(/permission denied/);
 }
});

test('an older writer preserves columns absent from its schema but can explicitly clear a known value',async()=>{
 const t=testTransport(db,OWNER_A),original=row('sets',{tag:'warmup',reps:8});
 await t.push([original]);
 const [older]=await t.push([{...original,updated_at:101,data:{reps:9}}]);
 expect(older.data).toMatchObject({tag:'warmup',reps:9});
 const [cleared]=await t.push([{...original,updated_at:102,data:{tag:null}}]);
 expect(cleared.data.tag).toBeNull();expect(cleared.data.reps).toBe(9);
});

test('child cutoff is independent of post-cutoff parent edits even in child-first batches',async()=>{
 await purge();
 const session=row('sessions',{day:'2026-10-04'},101),entry=row('entries',{session_id:session.id}),set=row('sets',{entry_id:entry.id});
 const t=testTransport(db,OWNER_A);await t.push([set,entry,session]);
 expect((await t.pull('sessions','0',10000)).find(p=>p.row.id===session.id)?.row.deleted_at).toBeNull();
 for(const r of [entry,set])expect((await t.pull(r.table,'0',10000)).find(p=>p.row.id===r.id)?.row.deleted_at).not.toBeNull();
 const lateSet=row('sets',{entry_id:entry.id});expect((await t.push([lateSet]))[0].deleted_at).not.toBeNull();
});

test('different purge ranges cannot share the tombstone provenance version',async()=>{
 const october=id(),september=id();
 await expect(asUser(db,OWNER_A,async tx=>{
  await tx.query("SELECT public.sync_purge_range($1,'2026-10-01','2026-10-31',100,'UTC')",[october]);
  await tx.query("SELECT public.sync_purge_range($1,'2026-09-01','2026-09-30',1000,'UTC')",[september]);
 })).rejects.toMatchObject({code:'23505'});
 // The failed transaction leaves neither range partially applied.
 expect((await testTransport(db,OWNER_A).pull('purges','0',1000))).toEqual([]);
 await purge(october);
 const t=testTransport(db,OWNER_A),session=row('sessions',{day:'2026-10-04'});
 await t.push([session]);
 expect((await t.push([row('entries',{session_id:session.id},500)]))[0].deleted_at).toBeNull();
});

test('child-first RPC acknowledgments reflect the final stored tombstones',async()=>{
 await purge();
 const session=row('sessions',{day:'2026-10-04'}),entry=row('entries',{session_id:session.id}),set=row('sets',{entry_id:entry.id});
 const accepted=await testTransport(db,OWNER_A).push([set,entry,session]);
 expect(accepted.every(r=>r.deleted_at!==null)).toBe(true);
 expect(accepted.every(r=>Object.values(r.data).every(value=>value===null))).toBe(true);
});

test('property: purge cutoff rejects stale and never-synced dated rows and retains later edits',async()=>{
 let dayIndex=0;
 await fc.assert(fc.asyncProperty(fc.integer({min:100,max:10000}),fc.nat(10000),async(cutoff,offset)=>{
  const day=`2026-08-${String(++dayIndex).padStart(2,'0')}`;
  const t=testTransport(db,OWNER_A),stale=row('sessions',{day},offset%(cutoff+1));
  await t.push([stale]);
  await asUser(db,OWNER_A,tx=>tx.query('SELECT public.sync_purge_range($1,$2::date,$2::date,$3,$4)',[id(),day,cutoff,'UTC']));
  for(const incoming of [stale,row('sessions',{day},offset%(cutoff+1))]) {
   const [dead]=await t.push([incoming]);expect(dead.deleted_at).not.toBeNull();expect(dead.data.day).toBeNull();
  }
  const [kept]=await t.push([row('sessions',{day},cutoff+1)]);expect(kept.deleted_at).toBeNull();expect(kept.data.day).toBe(day);
 }),{numRuns:12,endOnFailure:true});
});

const purgeTables: Table[] = ['weigh_ins','measurements','cardio_sessions','food_entries','plan_days','sessions','photos'];
// 04:30 UTC is October 31 in Chicago, but November 1 in UTC.
const rangeData = (table: Table, inside=true): Row['data'] => table==='photos'
 ? {captured_at:Date.parse(inside?'2026-11-01T04:30:00Z':'2026-11-01T06:00:00Z'),file_name:'fixture.jpg'}
 : {day:inside?'2026-10-31':'2026-11-01',...(table==='weigh_ins'?{source:'app'}:{})};
test.each(purgeTables)('%s RPC sweep and late-write backstop cover the range only',async table=>{
 const t=testTransport(db,OWNER_A);
 const inside=row(table,rangeData(table)),outside=row(table,rangeData(table,false)),edited=row(table,rangeData(table),101);
 await t.push([inside,outside,edited]);
 await testTransport(db,OWNER_B).push([{...inside,owner_id:OWNER_B}]);await purge();
 expect((await testTransport(db,OWNER_B).pull(table,'0',1000))[0].row.deleted_at).toBeNull();
 expect(await testTransport(db,OWNER_B).pull('purges','0',1000)).toEqual([]);
 const swept=(await t.pull(table,'0',1000)).find(r=>r.row.id===inside.id)!.row;
 expect(swept.deleted_at).not.toBeNull();
 expect(Object.entries(swept.data).every(([k,v])=>k==='source'?v==='app':v===null)).toBe(true);
 for(const live of [outside,edited])expect((await t.pull(table,'0',1000)).find(r=>r.row.id===live.id)!.row.deleted_at).toBeNull();
 const [late,lateOutside,lateEdit]=await t.push([row(table,rangeData(table)),row(table,rangeData(table,false)),row(table,rangeData(table),101)]);
 expect(late.deleted_at).not.toBeNull();expect(lateOutside.deleted_at).toBeNull();expect(lateEdit.deleted_at).toBeNull();
 const direct=row(table,rangeData(table)),fields=Object.keys(direct.data);
 await asUser(db,OWNER_A,tx=>tx.query(`INSERT INTO public.${table}(owner_id,id,updated_at,device_id,${fields.join(',')}) VALUES($1,$2,$3,$4,${fields.map((_,i)=>`$${i+5}`).join(',')})`,[OWNER_A,direct.id,100,direct.device_id,...Object.values(direct.data)]));
 expect((await t.pull(table,'0',1000)).find(r=>r.row.id===direct.id)!.row.deleted_at).not.toBeNull();
});
test.each(purgeTables)('%s local purge sweeps queued rows and protects later arrivals',async table=>{
 const local=await localDatabase();
 try {
  const inside=row(table,rangeData(table)),outside=row(table,rangeData(table,false));
  local.repo.putLocal(inside);local.repo.putLocal(outside);
  const marker=row('purges',{from_day:'2026-10-01',to_day:'2026-10-31',cutoff_ms:100,tz:'America/Chicago'},500);
  local.repo.applyPage('purges',[{row:marker,server_seq:'1'}],'1');
  expect(local.repo.get(table,inside.id)!.deleted_at).toBe(500);expect(local.repo.get(table,outside.id)!.deleted_at).toBeNull();
  const late=row(table,rangeData(table));local.repo.putLocal(late);
  expect(local.repo.get(table,late.id)!.deleted_at).toBe(500);
  expect(local.repo.pending().find(p=>p.row.id===inside.id)!.row.deleted_at).toBe(500);
 }finally{local.sqlite.close();}
});
test('purges reject RPC inserts and tombstones; guard rejects even with accidental grants',async()=>{
 const marker=row('purges',{from_day:'2000-01-01',to_day:'2099-12-31',cutoff_ms:Number.MAX_SAFE_INTEGER,tz:'UTC'});
 await expect(testTransport(db,OWNER_A).push([marker])).rejects.toThrow(/pull-only/);
 const key=id();await purge(key);
 await expect(testTransport(db,OWNER_A).push([{...marker,id:key,updated_at:900,deleted_at:900}])).rejects.toThrow(/pull-only/);
 await db.exec('GRANT INSERT, UPDATE ON public.purges TO authenticated');
 try {
  await expect(asUser(db,OWNER_A,tx=>tx.query('INSERT INTO public.purges(owner_id,id,updated_at,device_id) VALUES($1,$2,100,$3)',[OWNER_A,marker.id,marker.device_id]))).rejects.toThrow(/pull-only/);
  await expect(asUser(db,OWNER_A,tx=>tx.query('UPDATE public.purges SET deleted_at=1 WHERE id=$1',[key]))).rejects.toThrow(/pull-only/);
 }finally{await db.exec('REVOKE INSERT, UPDATE ON public.purges FROM authenticated');}
 expect((await testTransport(db,OWNER_A).pull('purges','0',100))[0].row.deleted_at).toBeNull();
});
test('purges are pull-only locally, including stale outbox entries and serialization',async()=>{
 const local=await localDatabase();
 try {
  const marker=row('purges',{from_day:'2026-10-01',to_day:'2026-10-31',cutoff_ms:100,tz:'UTC'},500);
  expect(()=>local.repo.putLocal(marker)).toThrow();expect(()=>local.repo.save('purges',marker.data)).toThrow();
  local.repo.applyPage('purges',[{row:marker,server_seq:'1'}],'1');
  expect(()=>local.repo.remove('purges',marker.id)).toThrow();
  local.sqlite.prepare('INSERT INTO sync_outbox(owner_id,table_name,row_id,revision) VALUES(?,?,?,?)').run(OWNER_A,'purges',marker.id,'500:'+marker.device_id);
  expect(local.repo.pending()).toEqual([]);expect(()=>pushRow(marker)).toThrow(/pull-only/);
  expect(local.repo.get('purges',marker.id)).toEqual(canonicalRow(marker));
 }finally{local.sqlite.close();}
});
test('purge cutoff caps to transaction now and retains accepted future edits',async()=>{
 await asUser(db,OWNER_A,async tx=>{
  const now=Number((await tx.query<{n:string}>('SELECT floor(extract(epoch FROM now())*1000)::bigint::text n')).rows[0].n);
  const future=row('sessions',{day:'2026-10-04'},now+1),key=id();
  await tx.query('SELECT public.sync_push($1::jsonb)',[JSON.stringify([future])]);
  await tx.query("SELECT public.sync_purge_range($1,'2026-10-01','2026-10-31',$2,'UTC')",[key,Number.MAX_SAFE_INTEGER]);
  expect(Number((await tx.query<{cutoff_ms:string}>('SELECT cutoff_ms FROM public.purges WHERE id=$1',[key])).rows[0].cutoff_ms)).toBe(now);
  expect((await tx.query<{deleted_at:string|null}>('SELECT deleted_at FROM public.sessions WHERE id=$1',[future.id])).rows[0].deleted_at).toBeNull();
 });
});
const invalidChecks: [Table,Row['data'],string][] = [
 ['plans',{mode:'other'},'plans_mode'],['plans',{days_per_week:0},'plans_days_per_week'],['plans',{days_per_week:8},'plans_days_per_week'],
 ['machine_notes',{unit_override:'stone'},'machine_notes_unit_override'],
 ['pauses',{start_day:'2026-10-02',end_day:'2026-10-01'},'pauses_range'],
 ['pauses',{start_day:'2026/10/01'},'pauses_start_day_iso'],['pauses',{end_day:'bad'},'pauses_end_day_iso'],
 ['purges',{from_day:'bad'},'purges_from_day_iso'],['purges',{to_day:'bad'},'purges_to_day_iso'],
 ['purges',{from_day:'2026-10-02',to_day:'2026-10-01'},'purges_range'],
 ['purges',{cutoff_ms:-1},'purges_cutoff'],['purges',{cutoff_ms:9007199254740992},'purges_cutoff'],
];
test.each(invalidChecks)('%s rejects invalid CHECK values %j on client and server',async(table,data,constraint)=>{
 expect(()=>validateRow(row(table,data))).toThrow();
 // Isolate actual SQL CHECKs from guard wiping/rejection and RPC validation.
 await db.exec(`ALTER TABLE public.${table} DISABLE TRIGGER ${table}_guard`);
 try {
  const r=row(table,data),fields=Object.keys(data);
  await expect(db.query(`INSERT INTO public.${table}(owner_id,id,updated_at,device_id,server_seq,${fields.join(',')}) VALUES($1,$2,100,$3,1,${fields.map((_,i)=>`$${i+4}`).join(',')})`,[OWNER_A,r.id,r.device_id,...Object.values(data)])).rejects.toMatchObject({code:'23514',constraint});
 }finally{await db.exec(`ALTER TABLE public.${table} ENABLE TRIGGER ${table}_guard`);}
});
test('0002 reapplication gives an explicit error and leaves schema intact',async()=>{
 const sql=readFileSync(join(__dirname,'../../server/row-sync/0002_v1_columns.sql'),'utf8');
 await expect(db.exec(sql)).rejects.toThrow('0002 already applied');await db.exec('ROLLBACK');
 expect((await db.query('SELECT * FROM public.purges')).rows).toEqual([]);
});

test('purge RPC requires authenticated identity and denies anonymous and service roles',async()=>{
 const sql="SELECT public.sync_purge_range($1,'2026-10-01','2026-10-31',100,'UTC')";
 for(const role of ['anon','service_role'])await expect(db.transaction(async tx=>{
  await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query(sql,[id()]);
 })).rejects.toThrow(/permission denied/);
 await expect(db.query(sql,[id()])).rejects.toThrow('bad purge');
});
