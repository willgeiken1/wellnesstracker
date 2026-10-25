import { DatabaseSync } from 'node:sqlite';
import { sqliteClient } from './sqlite';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import { syncTables } from '../../src/data/sync/flags';
import { syncedTables } from '../../src/data/rows';

jest.mock('expo-sqlite',()=>({openDatabaseSync:jest.fn(),addDatabaseChangeListener:jest.fn()}));
jest.mock('expo-crypto',()=>({randomUUID:()=> '20000000-0000-4000-8000-000000000001'}));

test.each([false,true])('production openLocalDatabase all-owner wipe is atomic (failure=%s)',async fail=>{
 const sqlite=new DatabaseSync(':memory:');
 const client=Object.assign(sqliteClient(sqlite),{execSync:(query:string)=>sqlite.exec(query)});
 try {
  let database!:Awaited<ReturnType<typeof import('../../src/data/database').openLocalDatabase>>;
  await jest.isolateModulesAsync(async()=>{
   const expo=require('expo-sqlite');expo.openDatabaseSync.mockReturnValue(client);
   database=await require('../../src/data/database').openLocalDatabase();
   expect(expo.openDatabaseSync).toHaveBeenCalledWith('insight.db');
  });
  for(const owner of [OWNER_A,OWNER_B,'demo','guest']){
   const repo=database.forOwner(owner);
   for(const table of syncedTables){if(table==='purges')repo.applyPage(table,[{row:{...syntheticRow(table),owner_id:owner},server_seq:'1'}],'1');else repo.putLocal({...syntheticRow(table),owner_id:owner});if(repo.syncTables().includes(table))repo.applyPage(table,[],'17');}
   repo.cacheOura('2026-01-01',{fixture:true});if(repo.pending().length)repo.flagConflict(repo.pending()[0]);
  }
  // Legacy pull-only markers must not inflate the all-owner recovery warning.
  for(const owner of [OWNER_A,OWNER_B])sqlite.prepare('INSERT INTO sync_outbox(owner_id,table_name,row_id,revision) VALUES(?,?,?,?)').run(owner,'purges',syntheticRow('purges').id,'100:fixture');
  // Includes flagged rows excluded from pending(), and every owner namespace.
  expect(database.countAllUnsynced!()).toBe((syncTables().length-1)*2);
  const tables=[...syncedTables,'sync_outbox','sync_state','sync_conflicts','oura_days'];
  const before=tables.map(table=>sqlite.prepare(`SELECT * FROM ${table}`).all());
  if(fail)sqlite.exec("CREATE TRIGGER deny_wipe BEFORE DELETE ON photos BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  if(fail)expect(()=>database.wipeAll()).toThrow('Local data is unavailable.');else {database.wipeAll();database.wipeAll();}
  tables.forEach((table,index)=>expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(fail?before[index]:[]));
  if(fail){sqlite.exec('DROP TRIGGER deny_wipe');database.wipeAll();}
  expect(database.countAllUnsynced!()).toBe(0);
 } finally {sqlite.close();}
});


test('all-owner pending count reaches zero with only OFF-held rows remaining',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 const client=Object.assign(sqliteClient(sqlite),{execSync:(query:string)=>sqlite.exec(query)});
 try {
  await jest.isolateModulesAsync(async()=>{
   require('expo-sqlite').openDatabaseSync.mockReturnValue(client);
   const database=await require('../../src/data/database').openLocalDatabase();
   for(const owner of [OWNER_A,OWNER_B]) {
    const repo=database.forOwner(owner);
    repo.putLocal({...syntheticRow('pauses'),owner_id:owner});
    repo.putLocal({...syntheticRow('sessions'),owner_id:owner});
    expect(database.countAllUnsynced()).toBe(1);
    repo.ack(repo.pending());
    expect(database.countAllUnsynced()).toBe(0);
   }
   expect(sqlite.prepare('SELECT count(*) AS count FROM sync_outbox').get()?.count).toBe(2);
  });
 }finally{sqlite.close();}
});


test.each([false,true])('all-owner count uses the same live v1 flag as repositories (%s)',async syncedV1Columns=>{
 const sqlite=new DatabaseSync(':memory:');
 const client=Object.assign(sqliteClient(sqlite),{execSync:(query:string)=>sqlite.exec(query)});
 try {
  await jest.isolateModulesAsync(async()=>{
   require('expo-sqlite').openDatabaseSync.mockReturnValue(client);
   const database=await require('../../src/data/database').openLocalDatabase({syncedV1Columns});
   for(const owner of [OWNER_A,OWNER_B]) {
    const repo=database.forOwner(owner);
    expect(repo.syncFlags.syncedV1Columns).toBe(syncedV1Columns);
    repo.putLocal({...syntheticRow('pauses'),owner_id:owner});
    repo.putLocal({...syntheticRow('sessions'),owner_id:owner});
   }
   expect(database.countAllUnsynced()).toBe(syncedV1Columns?4:2);
  });
 }finally{sqlite.close();}
});
