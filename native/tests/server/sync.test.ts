import fc from 'fast-check';
import type { PGlite } from '@electric-sql/pglite';
import { serverDatabase, asUser, testTransport } from './pglite';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { SyncEngine } from '../../src/data/sync/engine';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import { syncedTables } from '../../src/data/rows';
let db: PGlite;
beforeAll(async () => { db = await serverDatabase(); });
afterAll(async () => { await db?.close(); });
test('random 2–3 device create/edit/delete interleavings, duplicate pushes and retries converge with server', async () => {
  let run = 0;
  await fc.assert(fc.asyncProperty(
    fc.integer({min:2,max:3}),
    fc.array(fc.record({device:fc.nat(2),id:fc.nat(3),stamp:fc.integer({min:1,max:100}),deleted:fc.boolean(),sync:fc.boolean()}),{minLength:1,maxLength:30}),
    async (count,operations) => {
      run++;
      const locals = await Promise.all(Array.from({length:count},() => localDatabase()));
      const repos = locals.map((l,i) => new Repository(l.db,OWNER_A,`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,() => syntheticRow().id));
      const transport = testTransport(db,OWNER_A);
      const engines = repos.map(r => new SyncEngine(r,transport));
      try {
        for (const op of operations) {
          const index = op.device % count, repo = repos[index];
          const row = {...syntheticRow(),id:`30000000-0000-4000-8000-${String(run*10+op.id).padStart(12,'0')}`, device_id:repo.device, updated_at:op.stamp,deleted_at:op.deleted?op.stamp:null,data:{name:`fixture ${op.stamp}`}};
          repo.putLocal(row);
          if (op.sync) {
            const snapshot=repo.pending().map(p=>p.row);
            await transport.push(snapshot); await transport.push(snapshot);
            await engines[index].sync();
          }
        }
        for (const engine of engines) await engine.sync();
        for (const engine of [...engines].reverse()) await engine.sync();
        const server = (await transport.pull('sessions','0',10000)).map(r=>r.row).sort((a,b)=>a.id.localeCompare(b.id));
        for (const repo of repos) {
          expect(repo.list('sessions',true)).toEqual(server);
          expect(repo.pending()).toEqual([]);
        }
      } finally { locals.forEach(l=>l.sqlite.close()); engines.forEach(e=>e.close()); }
    }),{numRuns:25});
});
test('failed push retries after restart; no cross-account or demo transport; interrupted sync cannot acknowledge', async () => {
  const local=await localDatabase();
  local.repo.putLocal(syntheticRow());
  const bad={owner:OWNER_A,push:jest.fn(async()=>{throw new Error('sensitive fixture must not escape');}),pull:jest.fn()};
  const failed=new SyncEngine(local.repo,bad);
  await failed.sync();
  expect(failed.status).toBe('offline'); expect(local.repo.pending()).toHaveLength(1);
  failed.close();
  const restarted=new SyncEngine(local.repo,testTransport(db,OWNER_A));
  await restarted.sync(); expect(local.repo.pending()).toEqual([]);
  expect(()=>new SyncEngine(local.repo,testTransport(db,OWNER_B))).toThrow();
  const demo=new Repository(local.db,'demo',local.repo.device,()=>syntheticRow().id);
  expect(()=>new SyncEngine(demo,{...bad,owner:'demo'})).toThrow();
  local.sqlite.close(); restarted.close();
});
test('all synced tables pull independently and cursors never use device time', async () => {
  const local=await localDatabase(':memory:',{syncedV1Columns:true});
  const transport=testTransport(db,OWNER_A,{syncedV1Columns:true});
  for (const table of syncedTables.filter(t=>t!=='purges')) await transport.push([{...syntheticRow(table),updated_at:500}]);
  await asUser(db,OWNER_A,tx=>tx.query("SELECT public.sync_purge_range($1,'2026-10-01','2026-10-01',0,'UTC')",[syntheticRow().id]));
  const engine=new SyncEngine(local.repo,transport,1);
  await engine.sync();
  for (const table of syncedTables) expect(local.repo.list(table,true).length).toBeGreaterThan(0);
  engine.close();local.sqlite.close();
});
