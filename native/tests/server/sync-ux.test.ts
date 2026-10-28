import fc from 'fast-check';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { SyncEngine, type Transport } from '../../src/data/sync/engine';
import { compareRows, type Row } from '../../src/data/rows';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
const DAY = 86400000;
const DEVICE_B = '20000000-0000-4000-8000-000000000002';

// Only edits still pending when replaced are recoverable; acknowledged edits are history.
test('two offline phones converge under LWW and retain only an unsynced losing edit', async () => {
 await fc.assert(fc.asyncProperty(fc.integer({min:101,max:10000}),fc.integer({min:101,max:10000}),fc.boolean(),fc.boolean(),async (aStamp,bStamp,bFirst,tied) => {
  const a=await localDatabase(), b=await localDatabase();
  const phoneB=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id);
  const base=syntheticRow('sessions');
  const editA={...base,updated_at:aStamp,data:{day:'2026-01-01',name:'Synthetic A'}};
  const editB={...base,device_id:DEVICE_B,updated_at:tied?aStamp:bStamp,data:{day:'2026-01-01',name:'Synthetic B'}};
  let server:Row|undefined,seq=0;
  const transport:Transport={owner:OWNER_A,push:async rows=>rows.map(row=>{if(!server||compareRows(row,server)>0){server=row;seq++;}return server;}),pull:async(table,after)=>server&&table===server.table&&Number(after)<seq?[{row:server,server_seq:String(seq)}]:[]};
  const ea=new SyncEngine(a.repo,transport),eb=new SyncEngine(phoneB,transport);
  try {
   a.repo.putLocal(editA);phoneB.putLocal(editB);
   if(bFirst){await eb.sync();await ea.sync();}else{await ea.sync();await eb.sync();}
   await ea.sync();await eb.sync();
   const aWins=compareRows(editA,editB)>0,winner=aWins?editA:editB,loser=aWins?editB:editA;
   expect(a.repo.get('sessions',base.id)).toMatchObject(winner);
   expect(phoneB.get('sessions',base.id)).toMatchObject(winner);
   const losing=aWins?phoneB:a.repo,winning=aWins?a.repo:phoneB;
   expect(winning.losingVersions()).toEqual([]);
   const loserSyncedFirst=aWins?bFirst:!bFirst;
   expect(losing.losingVersions()).toHaveLength(loserSyncedFirst?0:1);
   if(!loserSyncedFirst)expect(losing.losingVersions()[0].row).toMatchObject(loser);
   expect(a.repo.unsyncedCount()+phoneB.unsyncedCount()).toBe(0);
  } finally {ea.close();eb.close();a.sqlite.close();b.sqlite.close();}
 }),{numRuns:40});
});

function collide(repo:Repository) {
 const row={...syntheticRow('sessions'),updated_at:101,data:{day:'2026-01-01',name:'Synthetic local'}};
 repo.putLocal(row);
 repo.ack(repo.pending(),[{...row,device_id:DEVICE_B,updated_at:200,data:{...row.data,name:'Synthetic other'}}]);
 return row;
}

test('restore survives repository restart and six days, authors a new outbox revision, then consumes the backup',async()=>{
 const local=await localDatabase();const now=Date.now();jest.spyOn(Date,'now').mockReturnValue(now);
 try {
  const original=collide(local.repo);
  const reopened=new Repository(local.db,OWNER_A,local.repo.device,()=>original.id);
  const saved=reopened.losingVersions(now+6*DAY)[0];expect(saved.row).toMatchObject(original);
  expect(new Repository(local.db,OWNER_B,local.repo.device,()=>original.id).losingVersions()).toEqual([]);
  expect(reopened.restoreLosingVersion(saved.key,now+6*DAY)).toBe(true);
  expect(reopened.get('sessions',original.id)).toMatchObject({data:original.data,device_id:local.repo.device});
  expect(reopened.pending()).toHaveLength(1);expect(reopened.pending()[0].row.updated_at).toBeGreaterThan(200);
  expect(reopened.losingVersions()).toEqual([]);
 }finally{jest.restoreAllMocks();local.sqlite.close();}
});

test('eight-day old versions are removed and cannot be restored',async()=>{
 const local=await localDatabase();const now=Date.now();jest.spyOn(Date,'now').mockReturnValue(now);
 try {collide(local.repo);const key=local.repo.losingVersions()[0].key;
  expect(local.repo.losingVersions(now+8*DAY)).toEqual([]);
  expect(local.repo.restoreLosingVersion(key,now+8*DAY)).toBe(false);
  expect(local.sqlite.prepare("SELECT * FROM sync_state WHERE key LIKE 'losing:%'").all()).toEqual([]);
 }finally{jest.restoreAllMocks();local.sqlite.close();}
});

test('offline sign-out count equals the actual outbox including provenance conflicts',async()=>{
 const local=await localDatabase();
 const engine=new SyncEngine(local.repo,{owner:OWNER_A,push:async()=>{throw new Error('Offline fixture');},pull:async()=>{throw new Error('Offline fixture');}});
 try {local.repo.putLocal(syntheticRow('sessions'));local.repo.putLocal(syntheticRow('weigh_ins'));
  local.repo.flagConflict(local.repo.pending().find(p=>p.row.table==='weigh_ins')!);
  await engine.sync();
  expect(engine.status).toBe('offline');expect(local.repo.pending()).toHaveLength(1);
  expect(local.repo.unsyncedCount()).toBe(2);
  expect(local.repo.unsyncedCount()).toBe(local.sqlite.prepare('SELECT count(*) AS n FROM sync_outbox WHERE owner_id=?').get(OWNER_A)?.n);
 }finally{engine.close();local.sqlite.close();}
});

test('wipe removes owner backups; replaying identical acknowledgements does not create notices',async()=>{
 const local=await localDatabase();
 try {const row=syntheticRow();local.repo.putLocal(row);local.repo.ack(local.repo.pending(),[row]);expect(local.repo.losingVersions()).toEqual([]);
  collide(local.repo);expect(local.repo.losingVersions()).toHaveLength(1);local.repo.wipe();expect(local.repo.losingVersions()).toEqual([]);
 }finally{local.sqlite.close();}
});

test('remote deletion removes backups and prevents resurrection',async()=>{
 const local=await localDatabase();
 try {
  const row=collide(local.repo),key=local.repo.losingVersions()[0].key;
  local.repo.applyPage('sessions',[{row:{...row,device_id:DEVICE_B,updated_at:300,deleted_at:300},server_seq:'1'}],'1');
  expect(local.repo.losingVersions()).toEqual([]);
  expect(local.repo.restoreLosingVersion(key)).toBe(false);
 }finally{local.sqlite.close();}
});

test('purges erase recoverable payloads as well as live rows',async()=>{
 const local=await localDatabase();
 try {
  collide(local.repo);expect(local.repo.losingVersions()).toHaveLength(1);
  const purge={...syntheticRow('purges'),device_id:DEVICE_B,updated_at:400,data:{from_day:'2026-01-01',to_day:'2026-01-01',cutoff_ms:1000,tz:'UTC'}};
  local.repo.applyPage('purges',[{row:purge,server_seq:'1'}],'1');
  expect(local.repo.losingVersions()).toEqual([]);
  expect(local.repo.get('sessions',syntheticRow().id)?.deleted_at).toBe(400);
 }finally{local.sqlite.close();}
});

test('replaying an old losing revision does not extend its recovery deadline',async()=>{
 const local=await localDatabase(),now=Date.now();jest.spyOn(Date,'now').mockReturnValue(now);
 try {
  const row=collide(local.repo),saved=local.repo.losingVersions()[0];
  // Same revision seen again after a replay/reset must retain its original expiry.
  local.sqlite.prepare('UPDATE sessions SET updated_at=?, device_id=?, name=? WHERE owner_id=? AND id=?').run(row.updated_at,row.device_id,String(row.data.name),OWNER_A,row.id);
  local.sqlite.prepare('INSERT INTO sync_outbox(owner_id,table_name,row_id,revision) VALUES(?,?,?,?)').run(OWNER_A,row.table,row.id,`${row.updated_at}:${row.device_id}`);
  jest.spyOn(Date,'now').mockReturnValue(now+6*DAY);
  local.repo.applyPage('sessions',[{row:{...row,updated_at:200,device_id:DEVICE_B,data:{...row.data,name:'Synthetic remote'}},server_seq:'1'}],'1');
  expect(local.repo.losingVersions()[0].expiresAt).toBe(saved.expiresAt);
 }finally{jest.restoreAllMocks();local.sqlite.close();}
});

test('sequential edits on two phones create no losing copy or recovery notice',async()=>{
 const a=await localDatabase(),b=await localDatabase();
 const phoneB=new Repository(b.db,OWNER_A,DEVICE_B,()=>syntheticRow().id);
 try {
  const row=syntheticRow('sessions');a.repo.putLocal(row);a.repo.ack(a.repo.pending(),[row]);
  phoneB.applyPage('sessions',[{row,server_seq:'1'}],'1');
  const later=phoneB.save('sessions',{day:'2026-01-01',name:'Synthetic later'},row.id,200);
  phoneB.ack(phoneB.pending(),[later]);
  a.repo.applyPage('sessions',[{row:later,server_seq:'2'}],'2');
  expect(a.repo.get('sessions',row.id)).toMatchObject(later);
  expect(a.repo.losingVersions()).toEqual([]);
 }finally{a.sqlite.close();b.sqlite.close();}
});

test.each(['remote','local'] as const)('restore refuses a later %s edit and immediately drops the stale copy',async(source)=>{
 const local=await localDatabase();
 try {
  const row=collide(local.repo),saved=local.repo.losingVersions()[0];
  const later={...row,device_id:source==='remote'?DEVICE_B:local.repo.device,updated_at:300,data:{...row.data,name:'Synthetic later'}};
  if(source==='remote')local.repo.applyPage('sessions',[{row:later,server_seq:'1'}],'1');
  else local.repo.putLocal(later);
  const pending=local.repo.pending();
  expect(local.repo.restoreLosingVersion(saved.key)).toBe(false);
  expect(local.repo.get('sessions',row.id)).toMatchObject(later);
  expect(local.repo.pending()).toEqual(pending);
  expect(local.repo.losingVersions()).toEqual([]);
  expect(local.sqlite.prepare("SELECT * FROM sync_state WHERE key LIKE 'losing:%'").all()).toEqual([]);
 }finally{local.sqlite.close();}
});

test.each(['ack','pull','delete','purge'] as const)('corrupt recovery entries cannot roll back %s',async(operation)=>{
 const local=await localDatabase();
 try {
  const row=collide(local.repo),valid=local.repo.losingVersions()[0];
  const next=operation==='ack'?local.repo.save('sessions',{day:'2026-01-01',name:'Synthetic next'},row.id,300):undefined;
  const corruptValues=[
   ()=>'{',()=> 'null',()=> '[]',()=> '{}',
   (saved:typeof valid)=>JSON.stringify({...saved,expiresAt:undefined}),
   (saved:typeof valid)=>JSON.stringify({...saved,expiresAt:'tomorrow'}),
   (saved:typeof valid)=>JSON.stringify({...saved,row:{...saved.row,owner_id:OWNER_B}}),
   (saved:typeof valid)=>JSON.stringify({...saved,row:{...saved.row,data:[]}}),
   (saved:typeof valid)=>JSON.stringify({...saved,winningRevision:'invalid'}),
   (saved:typeof valid)=>JSON.stringify({...saved,winningRevision:undefined}),
   (saved:typeof valid)=>JSON.stringify({...saved,expiresAt:null}),
  ];
  const corruptKeys=corruptValues.map((encode,index)=>{
   const corruptRow={...valid.row,id:`30000000-0000-4000-8000-${String(index+2).padStart(12,'0')}`};
   const key=`losing:sessions:${corruptRow.id}:${corruptRow.updated_at}:${corruptRow.device_id}`;
   local.sqlite.prepare('INSERT INTO sync_state(owner_id,key,value) VALUES(?,?,?)').run(OWNER_A,key,encode({...valid,key,row:corruptRow}));
   return key;
  });
  if(operation==='ack') {
   local.repo.ack(local.repo.pending(),[next!]);expect(local.repo.unsyncedCount()).toBe(0);
  } else if(operation==='delete') {
   local.repo.remove('sessions',row.id,300);expect(local.repo.get('sessions',row.id)?.deleted_at).toBe(300);
  } else {
   const next=operation==='pull'?{...row,device_id:DEVICE_B,updated_at:300}: {...syntheticRow('purges'),device_id:DEVICE_B,updated_at:400,data:{from_day:'2026-01-01',to_day:'2026-01-01',cutoff_ms:1000,tz:'UTC'}};
   local.repo.applyPage(next.table,[{row:next,server_seq:'1'}],'1');expect(local.repo.cursor(next.table)).toBe('1');
  }
  for(const key of corruptKeys)expect(local.sqlite.prepare('SELECT key FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,key)).toBeUndefined();
  if(operation==='ack'||operation==='pull')expect(local.repo.losingVersions().map(v=>v.key)).toEqual([valid.key]);
 }finally{local.sqlite.close();}
});

test('offline local deletion physically removes losing copies before another sync',async()=>{
 const local=await localDatabase();
 try {
  const row=collide(local.repo),key=local.repo.losingVersions()[0].key;
  local.repo.remove('sessions',row.id,300);
  expect(local.sqlite.prepare("SELECT * FROM sync_state WHERE key LIKE 'losing:%'").all()).toEqual([]);
  expect(local.repo.restoreLosingVersion(key)).toBe(false);
  expect(local.repo.pending()[0].row.deleted_at).toBe(300);
 }finally{local.sqlite.close();}
});

test('keeps the newest 50 copies per owner and physically drops the oldest',async()=>{
 const local=await localDatabase(),now=Date.now();jest.spyOn(Date,'now').mockReturnValue(now);
 try {
  const first=collide(local.repo),oldKey=local.repo.losingVersions()[0].key;
  const other=new Repository(local.db,OWNER_B,local.repo.device,()=>first.id);
  const otherRow={...first,owner_id:OWNER_B};other.putLocal(otherRow);
  other.ack(other.pending(),[{...otherRow,device_id:DEVICE_B,updated_at:200,data:{...otherRow.data,name:'Synthetic other'}}]);
  for(let i=1;i<=50;i++){
   jest.spyOn(Date,'now').mockReturnValue(now+i);
   const row={...first,id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`};
   local.repo.putLocal(row);local.repo.ack(local.repo.pending(),[{...row,device_id:DEVICE_B,updated_at:200,data:{...row.data,name:'Synthetic other'}}]);
  }
  expect(local.repo.losingVersions()).toHaveLength(50);
  expect(local.repo.losingVersions().some(v=>v.key===oldKey)).toBe(false);
  expect(local.sqlite.prepare("SELECT count(*) AS n FROM sync_state WHERE owner_id=? AND key LIKE 'losing:%'").get(OWNER_A)?.n).toBe(50);
  expect(other.losingVersions()).toHaveLength(1);
 }finally{jest.restoreAllMocks();local.sqlite.close();}
});

test('equal values with different key order do not create a recovery copy',async()=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow(),data:{day:'2026-01-01',name:'Synthetic same'}};local.repo.putLocal(row);
  local.repo.applyPage('sessions',[{row:{...row,device_id:DEVICE_B,updated_at:200,data:{name:'Synthetic same',day:'2026-01-01'}},server_seq:'1'}],'1');
  expect(local.repo.losingVersions()).toEqual([]);
 }finally{local.sqlite.close();}
});

test('a winning pull retains an unsynced local conflict and permits explicit restore',async()=>{
 const local=await localDatabase();
 try {
  const row={...syntheticRow(),data:{day:'2026-01-01',name:'Synthetic offline'}};
  local.repo.putLocal(row);
  local.repo.applyPage('sessions',[{row:{...row,device_id:DEVICE_B,updated_at:200,data:{...row.data,name:'Synthetic winner'}},server_seq:'1'}],'1');
  const saved=local.repo.losingVersions()[0];
  expect(saved.row).toMatchObject(row);
  expect(saved.winningRevision).toBe('200:20000000-0000-4000-8000-000000000002');
  expect(local.repo.restoreLosingVersion(saved.key)).toBe(true);
  expect(local.repo.get('sessions',row.id)).toMatchObject({data:row.data,device_id:local.repo.device});
 }finally{local.sqlite.close();}
});

test.each(['missing expiry','invalid expiry','missing winner','invalid winner','invalid row','wrong owner'])('recovery listing physically drops a copy with %s',async(kind)=>{
 const local=await localDatabase();
 try {
  collide(local.repo);const saved=local.repo.losingVersions()[0];
  const corrupt={...saved,
   ...(kind==='missing expiry'?{expiresAt:undefined}:kind==='invalid expiry'?{expiresAt:'tomorrow'}:
    kind==='missing winner'?{winningRevision:undefined}:kind==='invalid winner'?{winningRevision:'bad'}:
    kind==='invalid row'?{row:{...saved.row,data:[]}}:{row:{...saved.row,owner_id:OWNER_B}})};
  local.sqlite.prepare('UPDATE sync_state SET value=? WHERE owner_id=? AND key=?').run(JSON.stringify(corrupt),OWNER_A,saved.key);
  expect(local.repo.losingVersions()).toEqual([]);
  expect(local.sqlite.prepare('SELECT key FROM sync_state WHERE owner_id=? AND key=?').get(OWNER_A,saved.key)).toBeUndefined();
 }finally{local.sqlite.close();}
});
