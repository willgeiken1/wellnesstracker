import { exportBootDatabase } from '../src/data/boot-export';
import { openDatabaseAsync } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
const mockCopies: string[] = [], mockWrites: unknown[] = [], mockDeletes: string[] = [];
let mockCopyGate: Promise<void> | undefined;
let mockCopyStarted = false;
const mockSnapshot = new Uint8Array([83,81,76]);
const mockDB = { execAsync: jest.fn(async()=>{}), serializeAsync: jest.fn(async()=>mockSnapshot), closeAsync: jest.fn(async()=>{}) };
jest.mock('expo-crypto',()=>({randomUUID:()=> 'fixture-id'}));
jest.mock('expo-sqlite',()=>({defaultDatabaseDirectory:'file:///documents/SQLite',openDatabaseAsync:jest.fn()}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-file-system',()=>({Paths:{cache:'file:///cache'},Directory:class {
 uri:string;constructor(...parts:string[]){this.uri=parts.map(p=>typeof p==='string'?p:(p as {uri:string}).uri).join('/');}create(){}delete(){mockDeletes.push(this.uri);}
},File:class {
 uri:string;exists=true;constructor(...parts:unknown[]){this.uri=parts.map(p=>typeof p==='string'?p:(p as {uri:string}).uri).join('/');}
 async copy(dest:{uri:string}){mockCopyStarted=true;await mockCopyGate;mockCopies.push(`${this.uri} -> ${dest.uri}`);}async write(bytes:unknown){await Promise.resolve();mockWrites.push(bytes);}
}}));
beforeEach(()=>{jest.clearAllMocks();mockCopyGate=undefined;mockCopyStarted=false;mockCopies.length=0;mockWrites.length=0;mockDeletes.length=0;jest.mocked(openDatabaseAsync).mockResolvedValue(mockDB as never);});
test('exports a WAL-aware SQLite snapshot from a private copy without migrating or writing to the source',async()=>{
 await exportBootDatabase();
 expect(mockCopies).toEqual([
  'file:///documents/SQLite/insight.db -> file:///cache/boot-export-fixture-id/insight.db',
  'file:///documents/SQLite/insight.db-wal -> file:///cache/boot-export-fixture-id/insight.db-wal',
 ]);
 expect(openDatabaseAsync).toHaveBeenCalledWith('insight.db',{useNewConnection:true},'file:///cache/boot-export-fixture-id');
 expect(mockDB.execAsync).toHaveBeenCalledWith('PRAGMA query_only = ON;');
 expect(mockWrites).toEqual([mockSnapshot]);
 expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/boot-export-fixture-id/backup.sqlite',expect.objectContaining({mimeType:'application/vnd.sqlite3'}));
 expect(mockDB.closeAsync).toHaveBeenCalled();expect(mockDeletes).toEqual(['file:///cache/boot-export-fixture-id']);
});
test('when SQLite cannot open, shares only the copied raw file and cleans the temporary directory',async()=>{
 jest.mocked(openDatabaseAsync).mockRejectedValueOnce(new Error('synthetic locked file'));
 await exportBootDatabase();
 expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/boot-export-fixture-id/insight.db',expect.anything());
 expect(mockWrites).toEqual([]);expect(mockDeletes).toHaveLength(1);
});
test('share cancellation/failure still cleans the backup and preserves the source',async()=>{
 jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('synthetic sharing failure'));
 await expect(exportBootDatabase()).rejects.toThrow();expect(mockDeletes).toEqual(['file:///cache/boot-export-fixture-id']);
});
test('unavailable sharing does not read or copy any files',async()=>{
 jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
 await expect(exportBootDatabase()).rejects.toThrow();expect(mockCopies).toEqual([]);expect(openDatabaseAsync).not.toHaveBeenCalled();
});

test('waits for asynchronous file copies before opening SQLite or sharing',async()=>{
 let release!:()=>void;mockCopyGate=new Promise<void>(resolve=>{release=resolve;});
 const flight=exportBootDatabase();
 for(let tick=0;tick<5;tick++)await Promise.resolve();
 expect(mockCopyStarted).toBe(true);expect(openDatabaseAsync).not.toHaveBeenCalled();expect(Sharing.shareAsync).not.toHaveBeenCalled();
 release();await flight;expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});
