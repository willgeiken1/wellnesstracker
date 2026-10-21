import { databaseDirectoryUri, exportBootDatabase } from '../src/data/boot-export';
import { Directory, File } from 'expo-file-system';
import { openDatabaseAsync } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
const mockCopies: string[] = [], mockWrites: unknown[] = [], mockDeletes: string[] = [];
let mockOwner: string | null = 'fixture-owner';
let mockCacheEntries: (Directory | File)[] = [];
let mockDeleteFailures: string[] = [];
let mockListError = false;
let mockSharingAvailable = true;
let mockCreateError = false;
let mockCopyGate: Promise<void> | undefined;
let mockCopyStarted = false;
let mockDatabaseDirectory = 'file:///documents/SQLite';
const mockSnapshot = new Uint8Array([83,81,76]);
const mockDB = { getAllAsync: jest.fn(async (query: string) => query.includes('sqlite_schema') ? [{name:'sessions',type:'table'}, {name:'oura_days',type:'table'}, {name:'oura_sleep',type:'table'}, {name:'sync_state',type:'table'}, {name:'legacy_sync',type:'table'}] : query.includes('legacy_sync') ? [] : [{name:'owner_id'}]), runAsync: jest.fn(async()=>{}), execAsync: jest.fn(async()=>{}), serializeAsync: jest.fn(async()=>mockSnapshot), closeAsync: jest.fn(async()=>{}) };
jest.mock('expo-crypto',()=>({randomUUID:()=> 'fixture-id'}));
jest.mock('expo-sqlite',()=>({get defaultDatabaseDirectory(){return mockDatabaseDirectory;},openDatabaseAsync:jest.fn()}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>mockSharingAvailable),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-file-system',()=>({Paths:{cache:'file:///cache'},Directory:class {
 uri:string;constructor(...parts:string[]){this.uri=parts.map(p=>typeof p==='string'?p:(p as {uri:string}).uri).join('/');}get name(){return this.uri.split('/').pop();}create(){if(mockCreateError)throw new Error('synthetic create failure');}list(){if(mockListError)throw new Error('synthetic list failure');return mockCacheEntries;}delete(){mockDeletes.push(this.uri);if(mockDeleteFailures.includes(this.uri))throw new Error('synthetic delete failure');}
},File:class {
 uri:string;exists=true;constructor(...parts:unknown[]){this.uri=parts.map(p=>typeof p==='string'?p:(p as {uri:string}).uri).join('/');}
 async copy(dest:{uri:string}){mockCopyStarted=true;await mockCopyGate;mockCopies.push(`${this.uri} -> ${dest.uri}`);}async write(bytes:unknown){await Promise.resolve();mockWrites.push(bytes);}
}}));
beforeEach(()=>{jest.clearAllMocks();mockOwner='fixture-owner';mockCacheEntries=[];mockDeleteFailures=[];mockListError=false;mockSharingAvailable=true;mockCreateError=false;jest.mocked(Sharing.isAvailableAsync).mockImplementation(async()=>mockSharingAvailable);mockCopyGate=undefined;mockCopyStarted=false;mockCopies.length=0;mockWrites.length=0;mockDeletes.length=0;jest.mocked(openDatabaseAsync).mockResolvedValue(mockDB as never);});
beforeEach(()=>{mockDatabaseDirectory='file:///documents/SQLite';});

test('converts a bare database directory path to a file URI',()=>{
 expect(databaseDirectoryUri('/data/user/0/com.insightwellness.app/files/SQLite')).toBe('file:///data/user/0/com.insightwellness.app/files/SQLite');
});

test('preserves a database directory that is already a file URI',()=>{
 expect(databaseDirectoryUri('file:///documents/SQLite')).toBe('file:///documents/SQLite');
});

test('exports both database and WAL using file URIs when SQLite supplies a bare Android path',async()=>{
 mockDatabaseDirectory='/data/user/0/com.insightwellness.app/files/SQLite';
 await exportBootDatabase(()=>mockOwner);
 expect(mockCopies).toEqual([
  'file:///data/user/0/com.insightwellness.app/files/SQLite/insight.db -> file:///cache/boot-export-fixture-id/insight.db',
  'file:///data/user/0/com.insightwellness.app/files/SQLite/insight.db-wal -> file:///cache/boot-export-fixture-id/insight.db-wal',
 ]);
});

test('exports a WAL-aware SQLite snapshot from a private copy without migrating or writing to the source',async()=>{
 await exportBootDatabase(()=>mockOwner);
 expect(mockCopies).toEqual([
  'file:///documents/SQLite/insight.db -> file:///cache/boot-export-fixture-id/insight.db',
  'file:///documents/SQLite/insight.db-wal -> file:///cache/boot-export-fixture-id/insight.db-wal',
 ]);
 expect(openDatabaseAsync).toHaveBeenCalledWith('insight.db',{useNewConnection:true},'file:///cache/boot-export-fixture-id');
 expect(mockDB.runAsync).toHaveBeenCalledWith('DELETE FROM "sessions" WHERE "owner_id" IS NULL OR "owner_id" != ?', 'fixture-owner');
 expect(mockDB.runAsync).toHaveBeenCalledWith('DELETE FROM "sync_state" WHERE "owner_id" IS NULL OR "owner_id" != ?', 'fixture-owner');
 for(const name of ['oura_days','oura_sleep','legacy_sync'])expect(mockDB.execAsync).toHaveBeenCalledWith(`DROP TABLE "${name}"`);
 expect(mockDB.execAsync).toHaveBeenCalledWith('VACUUM;');
 expect(mockWrites).toEqual([mockSnapshot]);
 expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/boot-export-fixture-id/backup.sqlite',expect.objectContaining({mimeType:'application/vnd.sqlite3'}));
 expect(mockDB.closeAsync).toHaveBeenCalled();expect(mockDeletes).toEqual(['file:///cache/boot-export-fixture-id']);
});
test('when SQLite cannot open, never shares the raw file',async()=>{
 jest.mocked(openDatabaseAsync).mockRejectedValueOnce(new Error('synthetic locked file'));
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow('synthetic locked file');
 expect(Sharing.shareAsync).not.toHaveBeenCalled();
 expect(mockWrites).toEqual([]);expect(mockDeletes).toHaveLength(1);
});
test.each(['filter', 'serialize', 'write'])('%s failure never falls back to raw data',async phase=>{
 if(phase==='filter')mockDB.runAsync.mockRejectedValueOnce(new Error('synthetic failure'));
 if(phase==='serialize')mockDB.serializeAsync.mockRejectedValueOnce(new Error('synthetic failure'));
 if(phase==='write')jest.spyOn(File.prototype,'write').mockRejectedValueOnce(new Error('synthetic failure'));
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow('synthetic failure');
 expect(Sharing.shareAsync).not.toHaveBeenCalled();expect(mockDB.closeAsync).toHaveBeenCalled();
 jest.restoreAllMocks();
});
test('unknown owner exports nothing and never copies or opens the database',async()=>{
 mockOwner=null;
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow();
 expect(mockCopies).toEqual([]);expect(openDatabaseAsync).not.toHaveBeenCalled();expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
test.each([null,'other-owner'])('an owner changing to %s during export prevents sharing',async owner=>{
 mockDB.serializeAsync.mockImplementationOnce(async()=>{mockOwner=owner;return mockSnapshot;});
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow();
 expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
test('share cancellation/failure still cleans the backup and preserves the source',async()=>{
 jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('synthetic sharing failure'));
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow();expect(mockDeletes).toEqual(['file:///cache/boot-export-fixture-id']);
});
test('unavailable sharing does not read or copy any files',async()=>{
 jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow();expect(mockCopies).toEqual([]);expect(openDatabaseAsync).not.toHaveBeenCalled();
});

test('waits for asynchronous file copies before opening SQLite or sharing',async()=>{
 let release!:()=>void;mockCopyGate=new Promise<void>(resolve=>{release=resolve;});
 const flight=exportBootDatabase(()=>mockOwner);
 for(let tick=0;tick<5;tick++)await Promise.resolve();
 expect(mockCopyStarted).toBe(true);expect(openDatabaseAsync).not.toHaveBeenCalled();expect(Sharing.shareAsync).not.toHaveBeenCalled();
 release();await flight;expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});


test('sweeps only stale boot-export directories before starting each export',async()=>{
 const stale=new Directory('file:///cache/boot-export-stale');
 mockCacheEntries=[stale,new Directory('file:///cache/unrelated'),new File('file:///cache/boot-export-file')];
 jest.mocked(Sharing.isAvailableAsync).mockImplementation(async()=>{
  expect(mockDeletes).toEqual([stale.uri]);
  return true;
 });
 await exportBootDatabase(()=>mockOwner);
 expect(mockDeletes).toEqual([stale.uri,'file:///cache/boot-export-fixture-id']);
 mockDeletes.length=0;
 await exportBootDatabase(()=>mockOwner);
 expect(mockDeletes).toEqual([stale.uri,'file:///cache/boot-export-fixture-id']);
});

test('sweeps stale exports even when sharing is unavailable',async()=>{
 mockCacheEntries=[new Directory('file:///cache/boot-export-stale')];
 mockSharingAvailable=false;
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow('Sharing is unavailable.');
 expect(mockDeletes).toEqual(['file:///cache/boot-export-stale']);
 expect(mockCopies).toEqual([]);
});

test('a stale directory delete failure does not prevent sweeping later directories or exporting',async()=>{
 mockCacheEntries=[new Directory('file:///cache/boot-export-locked'),new Directory('file:///cache/boot-export-stale')];
 mockDeleteFailures=['file:///cache/boot-export-locked'];
 await expect(exportBootDatabase(()=>mockOwner)).resolves.toBeUndefined();
 expect(mockDeletes).toEqual(['file:///cache/boot-export-locked','file:///cache/boot-export-stale','file:///cache/boot-export-fixture-id']);
 expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});

test('a cache listing failure does not prevent exporting',async()=>{
 mockListError=true;
 await expect(exportBootDatabase(()=>mockOwner)).resolves.toBeUndefined();
 expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});

test('a staging delete failure preserves a successful export result',async()=>{
 mockDeleteFailures=['file:///cache/boot-export-fixture-id'];
 await expect(exportBootDatabase(()=>mockOwner)).resolves.toBeUndefined();
 expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
 expect(mockDeletes).toEqual(['file:///cache/boot-export-fixture-id']);
});

test('a staging delete failure preserves the original sharing error',async()=>{
 const failure=new Error('synthetic sharing failure');
 jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(failure);
 mockDeleteFailures=['file:///cache/boot-export-fixture-id'];
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toBe(failure);
 expect(mockDeletes).toEqual(['file:///cache/boot-export-fixture-id']);
});

test('a staging creation failure attempts cleanup and preserves the creation error',async()=>{
 mockCreateError=true;
 mockDeleteFailures=['file:///cache/boot-export-fixture-id'];
 await expect(exportBootDatabase(()=>mockOwner)).rejects.toThrow('synthetic create failure');
 expect(mockDeletes).toEqual(['file:///cache/boot-export-fixture-id']);
 expect(mockCopies).toEqual([]);
});
