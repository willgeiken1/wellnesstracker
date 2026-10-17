import { rmSync } from 'node:fs';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { OWNER_A, OWNER_B, DEVICE_A, syntheticRow } from '../../fixtures/sync';

test('row and outbox survive restart; accounts and demo cannot see each other', async () => {
  const path = `/tmp/insight-repository-${process.pid}.db`;
  const first = await localDatabase(path);
  first.repo.putLocal(syntheticRow());
  first.repo.save('settings',{theme_override:'dark',accent:'dusk'});
  first.sqlite.close();
  const second = await localDatabase(path);
  expect(second.repo.pending()).toHaveLength(2);
  expect(second.repo.list('settings')[0].data).toMatchObject({theme_override:'dark',accent:'dusk'});
  expect(second.repo.list('sessions')).toHaveLength(1);
  for (const owner of [OWNER_B,'demo']) {
    const other = new Repository(second.db, owner, DEVICE_A, () => syntheticRow().id);
    expect(other.list('sessions')).toEqual([]);
    expect(other.pending()).toEqual([]);
    expect(() => other.putLocal(syntheticRow())).toThrow();
  }
  second.sqlite.close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(path+suffix, {force:true});
});
test('committed mutations notify; stale ack cannot erase in-flight edits; parents do not cascade', async () => {
  const {repo,sqlite} = await localDatabase();
  const notify = jest.fn(); repo.subscribe(notify);
  const row = syntheticRow(); repo.putLocal(row);
  const snapshot = repo.pending();
  repo.putLocal({...row, updated_at: 101, deleted_at: 101});
  repo.ack(snapshot);
  expect(repo.pending()).toHaveLength(1);
  repo.putLocal({...syntheticRow('sets'), data: {entry_id: row.id, reps: 5}, updated_at: 102});
  expect(repo.list('sets')).toHaveLength(1);
  expect(notify).toHaveBeenCalledTimes(4);
  sqlite.close();
});
test('health provenance stays local; local Oura has no outbox; rollback is atomic', async () => {
  const {repo,db,sqlite} = await localDatabase();
  repo.putLocal({...syntheticRow('weigh_ins'),data:{...syntheticRow('weigh_ins').data,source:'healthkit'}});
  expect(repo.pending()).toEqual([]);
  expect(repo.list('weigh_ins')[0].data.source).toBe('healthkit');
  repo.cacheOura('2026-01-01', {fixture: true});
  expect(repo.pending()).toEqual([]);
  db.run(require('drizzle-orm').sql.raw("CREATE TRIGGER fail_outbox BEFORE INSERT ON sync_outbox BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;"));
  expect(() => repo.putLocal(syntheticRow())).toThrow();
  expect(repo.list('sessions')).toEqual([]);
  sqlite.close();
});
test('local monotonic stamps beat same-millisecond and backward clocks; cursor is arbitrary precision text', async () => {
  const {repo,sqlite} = await localDatabase();
  const a = repo.save('sessions', {}, undefined, 100);
  const b = repo.save('sessions', {}, a.id, 100);
  const c = repo.save('sessions', {}, a.id, 10);
  expect(b.updated_at).toBeGreaterThan(a.updated_at);
  expect(c.updated_at).toBeGreaterThan(b.updated_at);
  repo.applyPage('sessions', [], '90071992547409930');
  expect(repo.cursor('sessions')).toBe('90071992547409930');
  sqlite.close();
});
test('editing or deleting a pulled future-dated row always creates a newer local revision', async () => {
  const {repo,sqlite}=await localDatabase();
  const remote={...syntheticRow(),updated_at:5000000000000,device_id:'ffffffff-ffff-4fff-afff-ffffffffffff'};
  repo.applyPage('sessions',[{row:remote,server_seq:'1'}],'1');
  const edited=repo.save('sessions',{name:'fixture edit'},remote.id,100);
  expect(edited.updated_at).toBeGreaterThan(remote.updated_at);
  expect(repo.get('sessions',remote.id)?.data.name).toBe('fixture edit');
  repo.remove('sessions',remote.id,100);
  expect(repo.get('sessions',remote.id)?.deleted_at).toBeGreaterThan(edited.updated_at);
  sqlite.close();
});
test('every local physical table has explicit fields matching the row catalog',async()=>{
 const {sqlite}=await localDatabase();
 const {columns,syncedTables}=require('../../src/data/rows') as typeof import('../../src/data/rows');
 for(const table of syncedTables){
  const names=sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
  expect(names).toEqual(['owner_id','id','updated_at','deleted_at','device_id',...Object.keys(columns[table])]);
 }
 sqlite.close();
});
