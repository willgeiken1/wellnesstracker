import { localDatabase } from './sqlite';
import { SyncEngine,syncTriggers, type Transport } from '../../src/data/sync/engine';
import { OWNER_A, syntheticRow } from '../../fixtures/sync';
const flush = async () => { for(let i=0;i<8;i++)await Promise.resolve(); };
test('committed changes debounce 2s; foreground/reconnect/manual trigger; stop cancels pending work',async()=>{
 jest.useFakeTimers();const local=await localDatabase();
 const transport:Transport={owner:OWNER_A,push:jest.fn(async()=>{}),pull:jest.fn(async()=>[])};
 const engine=new SyncEngine(local.repo,transport),triggers=syncTriggers(engine);
 local.repo.putLocal(syntheticRow());jest.advanceTimersByTime(1999);expect(transport.push).not.toHaveBeenCalled();
 local.repo.putLocal({...syntheticRow(),updated_at:101});jest.advanceTimersByTime(1999);expect(transport.push).not.toHaveBeenCalled();
 jest.advanceTimersByTime(1);await engine.sync();expect(transport.push).toHaveBeenCalledTimes(1);
 await triggers.foreground();await triggers.reconnect();await triggers.now();expect(transport.pull).toHaveBeenCalled();
 local.repo.putLocal({...syntheticRow(),updated_at:102});triggers.stop();jest.runOnlyPendingTimers();expect(transport.push).toHaveBeenCalledTimes(1);
 local.sqlite.close();jest.useRealTimers();
});
test('an edit while a slow sync is in flight is automatically flushed afterward',async()=>{
 jest.useFakeTimers();const local=await localDatabase();let resolve!:()=>void;
 let first=true;const transport:Transport={owner:OWNER_A,push:jest.fn(async()=>{if(first){first=false;await new Promise<void>(r=>{resolve=r;});}}),pull:async()=>[]};
 const engine=new SyncEngine(local.repo,transport),triggers=syncTriggers(engine);
 local.repo.putLocal(syntheticRow());jest.advanceTimersByTime(2000);await flush();
 local.repo.putLocal({...syntheticRow(),updated_at:101});jest.advanceTimersByTime(2000);
 resolve();await engine.sync();await Promise.resolve();jest.advanceTimersByTime(2000);await engine.sync();
 expect(local.repo.pending()).toHaveLength(0);expect(transport.push).toHaveBeenCalledTimes(2);
 triggers.stop();local.sqlite.close();jest.useRealTimers();
});
test('closing during an upload leaves the old outbox unacknowledged',async()=>{
 const local=await localDatabase();local.repo.putLocal(syntheticRow());let resolve!:()=>void;
 const transport:Transport={owner:OWNER_A,push:async()=>new Promise<void>(r=>{resolve=r;}),pull:jest.fn(async()=>[])};
 const engine=new SyncEngine(local.repo,transport);const flight=engine.sync();await flush();const pulls=(transport.pull as jest.Mock).mock.calls.length;engine.close();resolve();await flight;
 expect(local.repo.pending()).toHaveLength(1);expect(transport.pull).toHaveBeenCalledTimes(pulls);local.sqlite.close();
});
test('closing during a pull prevents applying rows or advancing the old account cursor',async()=>{
 const local=await localDatabase();let resolve!:(rows:import('../../src/data/rows').ServerRow[])=>void;
 const transport:Transport={owner:OWNER_A,push:async()=>{},pull:async()=>new Promise(r=>{resolve=r;})};
 const engine=new SyncEngine(local.repo,transport),flight=engine.sync();
 engine.close();resolve([{row:{...syntheticRow('profile'),updated_at:200},server_seq:'1'}]);await flight;
 expect(local.repo.list('profile')).toEqual([]);expect(local.repo.cursor('profile')).toBe('0');local.sqlite.close();
});
test('a debounced edit during a failed slow upload still receives its own sync attempt',async()=>{
 jest.useFakeTimers();const local=await localDatabase();let reject!:(reason:Error)=>void;
 const push=jest.fn().mockImplementationOnce(()=>new Promise<void>((_resolve,fail)=>{reject=fail;})).mockResolvedValue(undefined);
 const engine=new SyncEngine(local.repo,{owner:OWNER_A,push,pull:async()=>[]}),triggers=syncTriggers(engine);
 local.repo.putLocal(syntheticRow());const running=engine.sync();await flush();
 local.repo.putLocal({...syntheticRow(),updated_at:101});jest.advanceTimersByTime(2000);
 reject(new Error('fixture offline'));await running;
 expect(push).toHaveBeenCalledTimes(2);expect(local.repo.pending()).toHaveLength(0);
 triggers.stop();local.sqlite.close();jest.useRealTimers();
});

test('a pushed provenance collision is flagged once while other rows drain and never hot-retries',async()=>{
 const {ProvenanceConflict}=require('../../src/data/sync/conflict') as typeof import('../../src/data/sync/conflict');
 const local=await localDatabase(),bad=syntheticRow('weigh_ins'),good=syntheticRow('sessions');
 local.repo.putLocal(bad);local.repo.putLocal(good);
 const pushed:string[]=[];
 const transport:Transport={owner:OWNER_A,pull:async()=>[],push:jest.fn(async rows=>{
  if(rows.some(r=>r.id===bad.id&&r.table===bad.table))throw new ProvenanceConflict();
  pushed.push(...rows.map(r=>r.id));
 })};
 const engine=new SyncEngine(local.repo,transport);await engine.sync();
 expect(engine.status).toBe('idle');expect(pushed).toEqual([good.id]);
 expect(local.repo.pending()).toEqual([]);expect(local.repo.conflicts()).toEqual([{table:bad.table,id:bad.id,reason:'provenance'}]);
 const calls=(transport.push as jest.Mock).mock.calls.length;
 local.repo.putLocal({...bad,updated_at:300});await engine.sync();
 expect(transport.push).toHaveBeenCalledTimes(calls);expect(local.repo.get(bad.table,bad.id)?.updated_at).toBe(300);
 engine.close();local.sqlite.close();
});
