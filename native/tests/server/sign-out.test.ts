import { rmSync } from 'node:fs';
import { localDatabase } from './sqlite';
import { syncedTables } from '../../src/data/rows';
import { Repository, wipeAllOwners } from '../../src/data/repository';
import { OWNER_A, OWNER_B, DEVICE_A, syntheticRow } from '../../fixtures/sync';
import { beginSignOut, completeSignOut, recoverSignOut, escapeSignOut, type SignOutMarker, type SignOutStorage } from '../../src/auth/sign-out';

function journal() {
 let value:SignOutMarker|null=null;
 const storage:SignOutStorage={read:async()=>value,write:async marker=>{value={...marker};},remove:async()=>{value=null;}};
 return storage;
}
test.each(['pending','wiped','session-cleared'] as const)('restart recovers a crash at %s with real SQLite and leaves the owner signed out',async phase=>{
 const path=`/tmp/insight-signout-${phase}-${process.pid}.db`,storage=journal();
 const first=await localDatabase(path);first.repo.putLocal(syntheticRow());
 const other=new Repository(first.db,OWNER_B,DEVICE_A,()=>syntheticRow().id);other.putLocal({...syntheticRow(),owner_id:OWNER_B});
 let storedSession:string|null=OWNER_A;
 const marker=await beginSignOut(OWNER_A,storage,1234);
 if(phase!=='pending'){first.repo.wipe();await storage.write({...marker,phase:'wiped'});}
 if(phase==='session-cleared'){storedSession=null;await storage.write({...marker,phase:'session-cleared'});}
 first.sqlite.close();
 const next=await localDatabase(path),wipe=jest.spyOn(next.repo,'wipe');
 const clear=jest.fn(async()=>{storedSession=null;});
 try {
  expect(await recoverSignOut({forOwner:owner=>owner===OWNER_A?next.repo:new Repository(next.db,owner,DEVICE_A,()=>syntheticRow().id)},storage,clear)).toBe(OWNER_A);
  expect(next.repo.list('sessions',true)).toEqual([]);expect(next.repo.unsyncedCount()).toBe(0);expect(storedSession).toBeNull();expect(await storage.read()).toBeNull();
  expect(wipe).toHaveBeenCalledTimes(phase==='pending'?1:0);expect(clear).toHaveBeenCalledTimes(phase==='session-cleared'?0:1);
  expect(new Repository(next.db,OWNER_B,DEVICE_A,()=>syntheticRow().id).list('sessions')).toHaveLength(1);
  expect(await recoverSignOut({forOwner:()=>next.repo},storage,clear)).toBeNull();
 } finally {next.sqlite.close();for(const suffix of ['', '-wal', '-shm'])rmSync(path+suffix,{force:true});}
});
test.each([OWNER_A,'demo'])('normal departure for %s writes marker before wipe and removes it after session clear',async owner=>{
 const local=await localDatabase(),storage=journal(),repo=new Repository(local.db,owner,DEVICE_A,()=>syntheticRow().id);
 repo.putLocal({...syntheticRow(),owner_id:owner});const wipe=jest.spyOn(repo,'wipe');
 const clear=jest.fn(async()=>{expect(repo.list('sessions',true)).toEqual([]);expect(await storage.read()).toMatchObject({owner,startedAt:1234,phase:'wiped'});});
 try {
  const marker=await beginSignOut(owner,storage,1234);expect(wipe).not.toHaveBeenCalled();expect(await storage.read()).toEqual({owner,startedAt:1234,phase:'pending'});
  await completeSignOut(marker,repo,storage,clear);expect(clear).toHaveBeenCalledTimes(1);expect(await storage.read()).toBeNull();
 } finally {local.sqlite.close();}
});
test('failed session clear leaves a recoverable marker after wipe commit',async()=>{
 const local=await localDatabase(),storage=journal();local.repo.putLocal(syntheticRow());
 try {
  const marker=await beginSignOut(OWNER_A,storage,1234);
  await expect(completeSignOut(marker,local.repo,storage,async()=>{throw new Error('synthetic crash');})).rejects.toThrow('synthetic crash');
  expect(local.repo.list('sessions',true)).toEqual([]);expect(await storage.read()).toMatchObject({owner:OWNER_A,phase:'wiped'});
  await recoverSignOut({forOwner:()=>local.repo},storage,async()=>{});expect(await storage.read()).toBeNull();
 } finally {local.sqlite.close();}
});
test('failed marker deletion resumes without repeating wipe or session clear',async()=>{
 const local=await localDatabase(),storage=journal(),remove=storage.remove;
 try {
  const marker=await beginSignOut(OWNER_A,storage,1234);storage.remove=async()=>{throw new Error('synthetic crash');};
  await expect(completeSignOut(marker,local.repo,storage,async()=>{})).rejects.toThrow('synthetic crash');
  expect(await storage.read()).toMatchObject({phase:'session-cleared'});
  storage.remove=remove;const wipe=jest.spyOn(local.repo,'wipe'),clear=jest.fn(async()=>{});
  await recoverSignOut({forOwner:()=>local.repo},storage,clear);expect(wipe).not.toHaveBeenCalled();expect(clear).not.toHaveBeenCalled();expect(await storage.read()).toBeNull();
 } finally {local.sqlite.close();}
});
test('a failed marker write prevents the wipe',async()=>{
 const local=await localDatabase(),storage=journal(),wipe=jest.spyOn(local.repo,'wipe');
 storage.write=async()=>{throw new Error('synthetic unavailable');};
 try {await expect(beginSignOut(OWNER_A,storage,1234).then(marker=>completeSignOut(marker,local.repo,storage,async()=>{}))).rejects.toThrow();expect(wipe).not.toHaveBeenCalled();}
 finally {local.sqlite.close();}
});

test('concurrent boot consumers share recovery and never clear a newly restored session twice',async()=>{
 const local=await localDatabase(),storage=journal();await beginSignOut(OWNER_A,storage,1234);
 let finish!:()=>void;const flight=new Promise<void>(resolve=>{finish=resolve;});const clear=jest.fn(()=>flight);
 try {
  const database={forOwner:()=>local.repo};
  const first=recoverSignOut(database,storage,clear),second=recoverSignOut(database,storage,clear);
  await new Promise<void>(resolve=>setImmediate(resolve));expect(clear).toHaveBeenCalledTimes(1);
  finish();expect(await first).toBe(OWNER_A);expect(await second).toBe(OWNER_A);expect(await storage.read()).toBeNull();
 } finally {local.sqlite.close();}
});

test('departure closes the engine before wipe; late pull cannot repopulate SQLite',async()=>{
 const {SyncEngine}=await import('../../src/data/sync/engine');
 const local=await localDatabase();local.repo.putLocal(syntheticRow());
 let resolve!: (rows: import('../../src/data/rows').ServerRow[])=>void;
 const pull=jest.fn(()=>new Promise<import('../../src/data/rows').ServerRow[]>(r=>{resolve=r;}));
 const engine=new SyncEngine(local.repo,{owner:OWNER_A,push:async()=>{},pull});
 try {
  const flight=engine.sync();await new Promise<void>(r=>setImmediate(r));expect(pull).toHaveBeenCalledTimes(1);
  engine.close();local.repo.wipe();const upsert=jest.spyOn(local.repo,'applyPage');
  resolve([{row:syntheticRow('profile'),server_seq:'1'}]);await flight;
  expect(upsert).not.toHaveBeenCalled();expect(local.repo.list('profile',true)).toEqual([]);expect(local.repo.list('sessions',true)).toEqual([]);
 } finally {engine.close();local.sqlite.close();}
});

test.each([false,true])('escape all-owner wipe is one transaction (injected failure=%s)',async fail=>{
 const local=await localDatabase();
 try {
  for(const owner of [OWNER_A,OWNER_B,'demo','guest']) {
   const repo=new Repository(local.db,owner,DEVICE_A,()=>syntheticRow().id);
   for(const table of syncedTables){repo.putLocal({...syntheticRow(table),owner_id:owner});repo.applyPage(table,[],'17');}
   repo.cacheOura('2026-01-01',{fixture:true});if(repo.pending().length)repo.flagConflict(repo.pending()[0]);
  }
  if(fail)local.sqlite.exec("CREATE TRIGGER deny_wipe BEFORE DELETE ON photos BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  let marker=true,session=true;
  const storage={read:async()=>{throw new Error('synthetic corrupt marker');},write:async()=>{},remove:async()=>{expect(session).toBe(false);marker=false;}};
  const clear=jest.fn(async()=>{expect(local.sqlite.prepare('SELECT * FROM sessions').all()).toEqual([]);session=false;});
  const escape=()=>escapeSignOut({wipeAll:()=>wipeAllOwners(local.db)},storage,clear);
  if(fail){await expect(escape()).rejects.toThrow();expect(marker).toBe(true);expect(session).toBe(true);expect(clear).not.toHaveBeenCalled();}
  else {await escape();expect(marker).toBe(false);expect(session).toBe(false);await escape();}
  for(const table of [...syncedTables,'sync_outbox','sync_state','sync_conflicts','oura_days']) {
   const rows=local.sqlite.prepare(`SELECT * FROM ${table}`).all();
   if(fail)expect(rows.length).toBeGreaterThan(0);else expect(rows).toEqual([]);
  }
  if(!fail)wipeAllOwners(local.db);
 } finally {local.sqlite.close();}
});
