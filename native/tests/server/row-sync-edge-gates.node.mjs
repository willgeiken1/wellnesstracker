import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { deleteRange } from '../../../supabase/functions/_shared/range.ts';
const require = createRequire(import.meta.url);
const ts = require('../../node_modules/typescript');
const A = '10000000-0000-4000-8000-000000000001';
const id = '40000000-0000-4000-8000-000000000001';
const body = {from:'2026-01-01',to:'2026-01-02',deletedAt:1000,purgeRequestId:id,tz:'UTC'};
function load(path, imports, extra = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  vm.runInNewContext(source, {exports, require: name => {assert.ok(name in imports, `Unexpected import ${name}`); return imports[name];}, Response, Request, Date, console:{error:()=>{throw new Error('Unexpected sensitive logging');}}, ...extra});
  return exports;
}
function mockAdmin(options={}) {
  const calls=[]; let stored={};
  const admin = {
    from(table) {
      let selecting = false;
      const q = {
        select(...args) {selecting = true;calls.push(['select',table,...args]);return q;},
        eq(column,value) {calls.push(['eq',table,column,value]);return q;},
        gte(){return q;},lte(){return q;},in(){return q;},
        delete(){calls.push(['delete',table]);return q;},
        async maybeSingle(){return {data:{data:structuredClone(stored)},error:null};},
        async upsert(row){stored=structuredClone(row.data);calls.push(['upsert',structuredClone(row)]);return {error:options.writeError?{message:'private'}:null};},
        then(resolve){return Promise.resolve(selecting && options.selectResult ? options.selectResult(table) : {data:[],count:options.count??0,error:selecting ? (options.countError ? {message:'private'} : options.schemaError ?? null) : (options.cleanupError ? {message:'private',code:'synthetic'} : null)}).then(resolve);},
      };return q;
    },
    async rpc(name,args){calls.push(['admin-rpc',name,args]);return {error:options.legacyError?{message:'private'}:null};},
    storage:{from(){return {async remove(){return {error:null};}};}},
    auth:{admin:{async deleteUser(uid){calls.push(['deleteUser',uid]);return {error:options.alreadyDeleted?{message:'User not found'}:null};}}},
  };return {admin,calls};
}
function endpoint(path, admin, native, options={}) {
  let handler;
  const markers = new Map();
  const nativeClient = {
    async rpc(name,args) {
      const result = await native.rpc(name,args);
      if (!result.error && !markers.has(args.p_id)) markers.set(args.p_id, {
        from_day:args.p_from,to_day:args.p_to,tz:args.p_tz,cutoff_ms:Math.min(args.p_cutoff_ms,Date.now()),
      });
      return result;
    },
    from(table) {
      assert.equal(table,'purges'); let key;
      return {select(columns){assert.equal(columns,'from_day,to_day,cutoff_ms,tz');return this;},
        eq(column,value){assert.equal(column,'id');key=value;return this;},
        async single(){return options.markerSchemaError ? {data:null,error:{code:options.markerSchemaError,message:"private"}} : options.markerFailure ? {data:null,error:{message:"private"}} : {data:markers.get(key),error:null};}};
    },
  };
  load(path, {
    '../_shared/http.ts':{admin,cors:{}, json:(body,status=200)=>new Response(JSON.stringify(body),{status}),validDay: s=> typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s,
      requireUser:async()=>options.unauthorized?null:{id:A}, userClient:req=>{assert.equal(req.headers.get('Authorization'),'Bearer synthetic');return nativeClient;},
      wipeStoragePrefix:async()=>{},userStillExists:async()=>false},
    '../_shared/range.ts':{deleteRange},
    '../_shared/row-sync.ts': requireTsRowSync(),
  }, {Deno:{env:{get:name=>{assert.equal(name,'ROW_SYNC_ENABLED');return 'flag' in options ? options.flag : 'true';}},serve:fn=>{handler=fn;}}});
  return data=>handler(new Request('http://localhost/',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(data)}));
}
function requireTsRowSync() {return load('../../../supabase/functions/_shared/row-sync.ts',{});}

test('purge endpoint uses user RPC, retains legacy path and retries exact ID/cutoff',async()=>{
  const {admin,calls}=mockAdmin();const rpc=[];
  const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async(name,args)=>{rpc.push([name,args]);return {error:null};}});
  assert.equal((await handle(body)).status,200);assert.equal((await handle(body)).status,200);
  assert.deepEqual(rpc,[['sync_purge_range',{p_id:id,p_from:body.from,p_to:body.to,p_cutoff_ms:1000,p_tz:'UTC'}],['sync_purge_range',{p_id:id,p_from:body.from,p_to:body.to,p_cutoff_ms:1000,p_tz:'UTC'}]]);
  assert.ok(calls.some(c=>c[0]==='admin-rpc' && c[1]==='purge_user_range_rows'));
  assert.ok(!calls.some(c=>c[0]==='admin-rpc' && c[1]==='sync_purge_range'));
  assert.ok(calls.some(c=>c[0]==='upsert'));
});
test('legacy callers receive deterministic marker IDs and UTC with original cutoff',async()=>{
  const {admin}=mockAdmin();const rpc=[];
  const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async(name,args)=>{rpc.push(args);return {error:null};}});
  const legacy={from:body.from,to:body.to,deletedAt:1000};
  assert.equal((await handle(legacy)).status,200);assert.equal((await handle(legacy)).status,200);
  assert.deepEqual(rpc[0],rpc[1]);assert.match(rpc[0].p_id,/^[a-f0-9-]{36}$/);assert.equal(rpc[0].p_tz,'UTC');
});
test('purge fails closed without logging private RPC errors and preserves retry arguments',async()=>{
  const {admin}=mockAdmin();let fail=true;const rpc=[];
  const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async(name,args)=>{rpc.push(args);return {error:fail?{message:'private'}:null};}});
  const response=await handle(body);assert.equal(response.status,500);assert.ok(!(await response.text()).includes('private'));
  fail=false;assert.equal((await handle(body)).status,200);assert.deepEqual(rpc[0],rpc[1]);
});
test('legacy failure cannot return success even after native purge succeeds',async()=>{
  for(const options of [{writeError:true},{legacyError:true}]) {
    const {admin}=mockAdmin(options);let called=false;
    const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async()=>{called=true;return {error:null};}});
    assert.equal((await handle(body)).status,500);assert.equal(called,true);
  }
});
test('purge rejects invalid contract before side effects and requires verified user',async()=>{
  for(const invalid of [{purgeRequestId:'bad'},{tz:'Factory'},{tz:'right/UTC'},{tz:'not/a-zone'},{deletedAt:-1},{deletedAt:1.5},{deletedAt:Number.MAX_SAFE_INTEGER+1},{deletedAt:null},{from:'2026-02-30'}]) {
    const {admin,calls}=mockAdmin();const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async()=>{throw Error('RPC must not run');}});
    assert.equal((await handle({...body,...invalid})).status,400);assert.deepEqual(calls,[]);
  }
  const {admin,calls}=mockAdmin();
  const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{}, {unauthorized:true});
  assert.equal((await handle(body)).status,401);assert.deepEqual(calls,[]);
});
test('F3 checks all 23 tables with admin exact HEAD counts after hard delete, including not-found retries',async()=>{
  for(const alreadyDeleted of [false,true]) {
    const {admin,calls}=mockAdmin({alreadyDeleted});const handle=endpoint('../../../supabase/functions/delete-account/index.ts',admin,{});
    assert.equal((await handle({confirm:'DELETE'})).status,200);
    const selects=calls.filter(c=>c[0]==='select');assert.equal(selects.length,23);
    const {rowSyncTables}=requireTsRowSync();assert.deepEqual(selects.map(c=>c[1]),Array.from(rowSyncTables));
    for(const c of selects){assert.equal(c[2],'id');assert.equal(c[3].count,'exact');assert.equal(c[3].head,true);}
    assert.ok(calls.indexOf(selects[0])>calls.findIndex(c=>c[0]==='deleteUser'));
    for(const table of rowSyncTables) assert.ok(calls.some(c=>c[0]==='eq'&&c[1]===table&&c[2]==='owner_id'&&c[3]===A));
    assert.ok(!calls.some(c=>c[0]==='delete'&&rowSyncTables.includes(c[1])));
  }
});
test('F3 fails closed on remaining rows, missing counts or count errors',async()=>{
  for(const options of [{count:1},{countError:true},{count:undefined}]) {
    const {admin}=mockAdmin(options);
    if(options.count===undefined&&!options.countError) admin.from=()=>({select(){return this;},delete(){return this;},eq(){return Promise.resolve({count:null,error:null});}});
    const handle=endpoint('../../../supabase/functions/delete-account/index.ts',admin,{});
    const response=await handle({confirm:'DELETE'});assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{error:'Account deletion verification failed.'});
  }
});
test('user client factory forwards verified Authorization with only public configuration',()=>{
  const clients=[];
  const http=load('../../../supabase/functions/_shared/http.ts',{'npm:@supabase/supabase-js@2':{createClient:(url,key,options)=>{const client={url,key,options};clients.push(client);return client;}}}, {Deno:{env:{get:name=>({SUPABASE_URL:'http://localhost:54321',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SECRET_KEYS:JSON.stringify({default:'synthetic-server'})}[name])}}});
  const client=http.userClient(new Request('http://localhost/',{headers:{Authorization:'Bearer synthetic'}}));
  assert.equal(client.key,'synthetic-public');assert.equal(client.options.global.headers.Authorization,'Bearer synthetic');
  assert.equal(client.options.auth.persistSession,false);assert.equal(client.options.auth.autoRefreshToken,false);
  assert.notEqual(client,clients[0]);
  assert.equal(clients[0].key,'synthetic-server');assert.notEqual(client.key,clients[0].key);
});
test('edge table list matches the canonical native catalog',()=>{
  const catalog=readFileSync(new URL('../../src/data/catalog.ts',import.meta.url),'utf8');
  const tables=Array.from(catalog.matchAll(/^  "([a-z_]+)": \{/gm),m=>m[1]);
  assert.equal(tables.length,23);assert.deepEqual(Array.from(requireTsRowSync().rowSyncTables),tables);
});

test('future cutoff retries keep the original RPC input and use the persisted server cutoff for legacy',async()=>{
  const {admin,calls}=mockAdmin();const rpc=[];
  const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async(name,args)=>{rpc.push(args);return {error:null};}});
  const request={...body,deletedAt:Date.now()+600000};
  assert.equal((await handle(request)).status,200);
  assert.equal((await handle(request)).status,200);
  assert.deepEqual(rpc[0],rpc[1]);assert.equal(rpc[0].p_cutoff_ms,request.deletedAt);
  const writes=calls.filter(c=>c[0]==='upsert');
  assert.equal(writes[0][1].data.purges[0].deletedAt,writes[1][1].data.purges[0].deletedAt);
  assert.ok(writes[0][1].data.purges[0].deletedAt<request.deletedAt);
});

test('native marker read failure is fail-closed before legacy writes',async()=>{
  const {admin,calls}=mockAdmin();
  const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async()=>({error:null})},{markerFailure:true});
  const response=await handle(body);assert.equal(response.status,500);
  assert.ok(!(await response.text()).includes('private'));
  assert.ok(!calls.some(c=>c[0]==='upsert'||c[0]==='admin-rpc'));
});

// Deployment compatibility: all fixtures and errors are synthetic.
test('row sync is disabled unless the server flag is exactly true', async()=>{
  for (const flag of [undefined, 'false', '1', 'TRUE']) {
    for (const path of ['purge-range', 'delete-account']) {
      const {admin,calls}=mockAdmin();
      const handle=endpoint(`../../../supabase/functions/${path}/index.ts`,admin,{rpc:async()=>{throw Error('native RPC must not run');}},{flag});
      const response=await handle(path==='purge-range'?body:{confirm:'DELETE'});
      assert.equal(response.status,200);assert.equal((await response.json()).rowSync,'disabled');
      assert.ok(!calls.some(c=>c[0]==='select' && c[3]?.head));
      if(path==='purge-range') assert.ok(calls.some(c=>c[0]==='upsert'));
    }
  }
});
test('missing native RPC/schema skips only row sync and completes legacy purge',async()=>{
  for(const code of ['42883','42P01','PGRST202','PGRST205']) {
    const {admin,calls}=mockAdmin();
    const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async()=>({error:{code,message:'private'}})});
    const response=await handle(body);assert.equal(response.status,200);
    assert.equal((await response.json()).rowSync,'not_set_up');
    assert.ok(calls.some(c=>c[0]==='upsert'));
    assert.ok(calls.some(c=>c[0]==='admin-rpc'&&c[1]==='purge_user_range_rows'));
  }
});
test('missing row tables after auth deletion return not_set_up',async()=>{
  for(const code of ['42883','42P01','PGRST202','PGRST205']) {
    const {admin,calls}=mockAdmin({schemaError:{code,message:'private'}});
    const handle=endpoint('../../../supabase/functions/delete-account/index.ts',admin,{});
    const response=await handle({confirm:'DELETE'});assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,rowSync:'not_set_up',cleanupErrors:0});
    assert.ok(calls.some(c=>c[0]==='deleteUser'));
  }
});
test('available row schema reports complete for both endpoints',async()=>{
  for(const path of ['purge-range','delete-account']) {
    const {admin}=mockAdmin();const handle=endpoint(`../../../supabase/functions/${path}/index.ts`,admin,{rpc:async()=>({error:null})});
    const response=await handle(path==='purge-range'?body:{confirm:'DELETE'});
    assert.equal(response.status,200);assert.equal((await response.json()).rowSync,'complete');
  }
});
test('legacy from/to payload defaults cutoff to server now',async()=>{
  for(const flag of [undefined,'true']) {
    const {admin,calls}=mockAdmin();const rpc=[];const before=Date.now();
    const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async(name,args)=>{rpc.push(args);return {error:null};}},{flag});
    const response=await handle({from:body.from,to:body.to});assert.equal(response.status,200);
    const cutoff=calls.find(c=>c[0]==='upsert')[1].data.purges[0].deletedAt;
    assert.ok(cutoff>=before && cutoff<=Date.now());
    if(flag==='true') assert.equal(rpc[0].p_cutoff_ms,cutoff);
  }
});
test('cleanup errors are reported only as a numeric aggregate',async()=>{
  for(const cleanupError of [false,true]) {
    const {admin}=mockAdmin({cleanupError});const handle=endpoint('../../../supabase/functions/delete-account/index.ts',admin,{});
    const response=await handle({confirm:'DELETE'});assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,rowSync:'complete',cleanupErrors:cleanupError?34:0});
  }
});

test('missing marker schema completes legacy purge with not_set_up status',async()=>{
  for(const code of ['42P01','PGRST205']) {
    const {admin,calls}=mockAdmin();
    const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{rpc:async()=>({error:null})},{markerSchemaError:code});
    const response=await handle(body);assert.equal(response.status,200);
    assert.equal((await response.json()).rowSync,'not_set_up');
    assert.ok(calls.some(c=>c[0]==='upsert'));
  }
});
test('missing tables do not skip verification of tables that exist',async()=>{
  for(const result of [{count:1,error:null},{count:null,error:{code:'42501',message:'private'}}]) {
    const {admin,calls}=mockAdmin({selectResult:table=>table==='purges'?result:{count:null,error:{code:'42P01',message:'private'}}});
    const handle=endpoint('../../../supabase/functions/delete-account/index.ts',admin,{});
    const response=await handle({confirm:'DELETE'});assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{error:'Account deletion verification failed.'});
    assert.equal(calls.filter(c=>c[0]==='select').length,23);
  }
});
test('explicit invalid cutoff is rejected even with row sync disabled',async()=>{
  for(const deletedAt of [null,'invalid',-1,1.5]) {
    const {admin,calls}=mockAdmin();
    const handle=endpoint('../../../supabase/functions/purge-range/index.ts',admin,{}, {flag:undefined});
    assert.equal((await handle({...body,deletedAt})).status,400);assert.deepEqual(calls,[]);
  }
});
