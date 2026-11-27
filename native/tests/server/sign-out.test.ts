import { rmSync } from 'node:fs';
import { localDatabase } from './sqlite';
import { syncedTables } from '../../src/data/rows';
import { Repository, wipeAllOwners } from '../../src/data/repository';
import { OWNER_A, OWNER_B, DEVICE_A, syntheticRow } from '../../fixtures/sync';
import { beginSignOut, completeSignOut, recoverSignOut, escapeSignOut, type SignOutMarker, type SignOutStorage } from '../../src/auth/sign-out';

// A small file system for the photo files kept outside the database: addresses of files that exist.
// A file in mockStuck can't be deleted, nor can a folder holding one.
const mockFiles=new Set<string>(),mockStuck=new Set<string>();
jest.mock('expo-file-system',()=>{
 class Directory{uri:string;constructor(base:{uri:string},name:string){this.uri=`${base.uri}${name}/`;}get exists(){return [...mockFiles].some(f=>f.startsWith(this.uri));}delete(){if([...mockStuck].some(f=>f.startsWith(this.uri)))throw new Error('synthetic delete failure');for(const f of [...mockFiles])if(f.startsWith(this.uri))mockFiles.delete(f);}}
 class File{uri:string;constructor(a:string|Directory,b?:string){this.uri=typeof a==='string'?a:a.uri+b;}get exists(){return mockFiles.has(this.uri);}delete(){if(mockStuck.has(this.uri))throw new Error('synthetic delete failure');mockFiles.delete(this.uri);}}
 return {Directory,File,Paths:{document:{uri:'file:///docs/'}}};
});
beforeEach(()=>{mockFiles.clear();mockStuck.clear();});
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
   for(const table of syncedTables){if(table==='purges')repo.applyPage(table,[{row:{...syntheticRow(table),owner_id:owner},server_seq:'1'}],'1');else repo.putLocal({...syntheticRow(table),owner_id:owner});if(repo.syncTables().includes(table))repo.applyPage(table,[],'17');}
   // An old build's Oura copy, so the wipe is shown to clear it.
   local.sqlite.prepare('INSERT INTO oura_days(owner_id,day,cache) VALUES(?,?,?)').run(owner,'2026-01-01','{"fixture":true}');if(repo.pending().length)repo.flagConflict(repo.pending()[0]);
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

test('departure deletes the owner\'s photo files before the wipe clears their addresses, and no one else\'s',async()=>{
 const local=await localDatabase(),storage=journal(),other=new Repository(local.db,OWNER_B,DEVICE_A,()=>syntheticRow().id);
 const mine=['file:///docs/profile-photo/a-1.jpg','file:///docs/progress-photos/p-1.jpg','file:///docs/progress-photos/p-2.jpg'];
 const theirs=['file:///docs/profile-photo/b-1.jpg','file:///docs/progress-photos/b-2.jpg'];
 for(const f of [...mine,...theirs])mockFiles.add(f);
 local.repo.localSave('profilePhoto',mine[0]);
 local.repo.localSave('progressPhotos',[{id:'p-1',day:'2026-11-01',kg:null,pose:'Front',uri:mine[1]},{id:'p-2',day:'2026-11-02',kg:null,pose:'Side',uri:mine[2]}]);
 other.localSave('profilePhoto',theirs[0]);other.localSave('progressPhotos',[{id:'b-2',day:'2026-11-01',kg:null,pose:'Front',uri:theirs[1]}]);
 const wipe=jest.spyOn(local.repo,'wipe').mockImplementation(function(this:Repository){
  // The files are gone while the addresses can still be read.
  expect(mine.filter(f=>mockFiles.has(f))).toEqual([]);expect(local.repo.localGet('profilePhoto')).toBe(mine[0]);
  wipe.mockRestore();local.repo.wipe();
 });
 try {
  await completeSignOut(await beginSignOut(OWNER_A,storage,1234),local.repo,storage,async()=>{});
  expect(local.repo.localGet('profilePhoto')).toBeUndefined();expect(local.repo.localGet('progressPhotos')).toBeUndefined();
  expect([...mockFiles].sort()).toEqual([...theirs].sort());
  expect(other.localGet('profilePhoto')).toBe(theirs[0]);
 } finally {local.sqlite.close();}
});
test('departure finds a kept file by name after a restore moved the app folder, and never reaches outside the photo folders',async()=>{
 const local=await localDatabase(),storage=journal();
 mockFiles.add('file:///docs/profile-photo/a-1.jpg');mockFiles.add('file:///docs/notes.jpg');mockFiles.add('file:///docs/progress-photos/keep.txt');
 local.repo.localSave('profilePhoto','file:///old-container/Documents/profile-photo/a-1.jpg');
 local.repo.localSave('progressPhotos',[{id:'x',day:'2026-11-01',kg:null,pose:'Front',uri:'file:///docs/notes.jpg/..'},{id:'y',day:'2026-11-01',kg:null,pose:'Front',uri:'file:///docs/progress-photos/keep.txt'}]);
 try {
  await completeSignOut(await beginSignOut(OWNER_A,storage,1234),local.repo,storage,async()=>{});
  expect([...mockFiles].sort()).toEqual(['file:///docs/notes.jpg','file:///docs/progress-photos/keep.txt']);
 } finally {local.sqlite.close();}
});
test.each([false,true])('escape removes every owner\'s photo folders only once the rows are gone (injected failure=%s)',async fail=>{
 const files=['file:///docs/profile-photo/a.jpg','file:///docs/progress-photos/b.jpg'],other='file:///docs/elsewhere/c.jpg';
 for(const f of [...files,other])mockFiles.add(f);
 const storage={read:async()=>null,write:async()=>{},remove:async()=>{}};
 const wipeAll=()=>{if(fail)throw new Error('synthetic');};
 if(fail){await expect(escapeSignOut({wipeAll},storage,async()=>{})).rejects.toThrow();expect([...mockFiles].sort()).toEqual([...files,other].sort());}
 else {await escapeSignOut({wipeAll},storage,async()=>{});expect([...mockFiles]).toEqual([other]);}
});
test('a photo that cannot be deleted stops departure before the wipe, keeping every address and the marker, and a retry finishes it',async()=>{
 const local=await localDatabase(),storage=journal();
 const photos=['file:///docs/profile-photo/a-1.jpg','file:///docs/progress-photos/p-1.jpg','file:///docs/progress-photos/p-2.jpg'];
 for(const f of photos)mockFiles.add(f);mockStuck.add(photos[1]);
 local.repo.localSave('profilePhoto',photos[0]);
 const progress=[{id:'p-1',day:'2026-11-01',kg:null,pose:'Front',uri:photos[1]},{id:'p-2',day:'2026-11-02',kg:null,pose:'Side',uri:photos[2]}];
 local.repo.localSave('progressPhotos',progress);local.repo.putLocal(syntheticRow());
 const wipe=jest.spyOn(local.repo,'wipe'),clear=jest.fn(async()=>{});
 try {
  await expect(completeSignOut(await beginSignOut(OWNER_A,storage,1234),local.repo,storage,clear)).rejects.toThrow();
  expect(wipe).not.toHaveBeenCalled();expect(clear).not.toHaveBeenCalled();
  expect(local.repo.localGet('progressPhotos')).toEqual(progress);expect(local.repo.unsyncedCount()).toBeGreaterThan(0);
  expect(await storage.read()).toMatchObject({owner:OWNER_A,phase:'pending'});
  // The other files went; the stuck one and its address stay for the retry.
  expect([...mockFiles]).toEqual([photos[1]]);
  mockStuck.clear();
  expect(await recoverSignOut({forOwner:()=>local.repo},storage,clear)).toBe(OWNER_A);
  expect(wipe).toHaveBeenCalledTimes(1);expect(clear).toHaveBeenCalledTimes(1);expect([...mockFiles]).toEqual([]);
  expect(local.repo.localGet('progressPhotos')).toBeUndefined();expect(await storage.read()).toBeNull();
 } finally {local.sqlite.close();}
});
test('a photo folder that cannot be deleted stops the escape before the session goes and keeps its marker, and a retry finishes it',async()=>{
 const files=['file:///docs/profile-photo/a.jpg','file:///docs/progress-photos/b.jpg'];
 for(const f of files)mockFiles.add(f);mockStuck.add(files[1]);
 let marker=true;const storage={read:async()=>null,write:async()=>{},remove:async()=>{marker=false;}},clear=jest.fn(async()=>{});
 await expect(escapeSignOut({wipeAll:()=>{}},storage,clear)).rejects.toThrow();
 expect(marker).toBe(true);expect(clear).not.toHaveBeenCalled();expect(mockFiles.has(files[1])).toBe(true);
 mockStuck.clear();
 await escapeSignOut({wipeAll:()=>{}},storage,clear);
 expect(marker).toBe(false);expect(clear).toHaveBeenCalledTimes(1);expect([...mockFiles]).toEqual([]);
});
