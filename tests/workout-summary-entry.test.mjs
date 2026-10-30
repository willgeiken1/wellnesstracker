import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

test('entry point wires auth, quota and model; OPTIONS and all responses carry CORS', async t => {
 const calls=[];
 const deps={
  requireUser:async()=>{calls.push('auth');return {id:'synthetic-user'};},
  consumeQuota:async(...args)=>{calls.push(['consume',...args]);return {allowed:true,remaining:4,limit:5};},
  releaseQuota:async(...args)=>{calls.push(['release',...args]);},
 };
 // Execute the actual index/handler and HTTP response helpers. Replace only
 // auth/quota/provider I/O; never import the live HTTP client's initialization.
 const priorDeno=Object.getOwnPropertyDescriptor(globalThis,'Deno');
 globalThis.workoutEntryTestDeps=deps;
 t.after(()=>{
  delete globalThis.workoutEntryTestDeps;
  if(priorDeno)Object.defineProperty(globalThis,'Deno',priorDeno);
  else delete globalThis.Deno;
 });
 const hooks=registerHooks({load(url,context,nextLoad){
  if(url.endsWith('/_shared/http.ts')) {
   const source=readFileSync(new URL(url),'utf8');
   return {format:'module-typescript',shortCircuit:true,source:source.slice(source.indexOf('export const cors'),source.indexOf('export function serverKey'))+'\nexport const requireUser=globalThis.workoutEntryTestDeps.requireUser;'};
  }
  if(url.endsWith('/_shared/quota.ts')) return {format:'module',shortCircuit:true,source:'export const {consumeQuota,releaseQuota}=globalThis.workoutEntryTestDeps;'};
  return nextLoad(url,context);
 }});
 t.after(()=>hooks.deregister());
 let serve;
 const envGet=t.mock.fn(()=> 'synthetic-provider-configuration');
 globalThis.Deno={env:{get:envGet},serve:handler=>{serve=handler;}};
 const provider=t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:'A synthetic workout recap.'}]})));
 await import('../supabase/functions/workout-summary/index.ts');
 assert.equal(typeof serve,'function');
 const checkCors=response=>{
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  assert.equal(response.headers.get('access-control-allow-methods'),'POST, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'),'authorization, x-client-info, apikey, content-type');
 };
 const preflight=await serve(new Request('http://local/workout-summary',{method:'OPTIONS'}));
 assert.equal(preflight.status,200);assert.equal(await preflight.text(),'ok');checkCors(preflight);
 assert.deepEqual(calls,[]);assert.equal(envGet.mock.calls.length,0);assert.equal(provider.mock.calls.length,0);
 const method=await serve(new Request('http://local/workout-summary'));
 assert.equal(method.status,405);checkCors(method);assert.deepEqual(calls,[]);
 const now=new Date(),localDate=now.toISOString().slice(0,10);
 const request=()=>new Request('http://local/workout-summary',{method:'POST',body:JSON.stringify({workout:{exercises:[{name:'Bench Press',sets:1,reps:8,volume:100}]},length:'coach',localDate,timeZone:'UTC'})});
 const success=await serve(request());
 assert.equal(success.status,200);checkCors(success);
 assert.deepEqual(await success.json(),{summary:'A synthetic workout recap.',remaining:4,limit:5});
 assert.deepEqual(calls,['auth',['consume','synthetic-user',localDate,'workout_summary']]);
 assert.equal(envGet.mock.calls.length,1);assert.equal(provider.mock.calls.length,1);
 const [url,options]=provider.mock.calls[0].arguments;
 assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.method,'POST');
 assert.equal(options.headers['anthropic-version'],'2023-06-01');
 assert.equal(options.headers['content-type'],'application/json');
 assert.ok(options.signal instanceof AbortSignal);
 assert.equal(JSON.parse(options.body).model,'claude-haiku-4-5-20251001');
 provider.mock.mockImplementation(async()=>{throw Error('synthetic failure');});
 const failure=await serve(request());assert.equal(failure.status,502);checkCors(failure);
 assert.deepEqual(calls.at(-1),['release','synthetic-user',localDate,'workout_summary']);
});
