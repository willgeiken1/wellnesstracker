import test, {afterEach, mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sanitizeWorkoutName, assertWorkoutData, assertWorkoutModelEnvelope, workoutModelPayload, workoutFactsFromEnvelope} from '../supabase/functions/_shared/workout-payload.ts';
import {callWorkoutModel} from '../supabase/functions/_shared/strip.ts';
import {createWorkoutSummaryHandler} from '../supabase/functions/workout-summary/handler.ts';
afterEach(()=>mock.restoreAll());
const vectors=JSON.parse(readFileSync(new URL('../native/fixtures/workout-ai-guard.json',import.meta.url),'utf8'));
const workout={exercises:[{name:'Bench Press',sets:3,reps:24,volume:1200}]};
const body={workout,length:'coach',localDate:'2026-10-29',timeZone:'UTC'};
function setup() {
 let used=0;
 const calls=[];
 const deps={
  requireUser:async()=>({id:'synthetic-user'}),
  consumeQuota:async(user,day,kind)=>{assert.equal(user,'synthetic-user');assert.equal(day,'2026-10-29');assert.equal(kind,'workout_summary');const allowed=used<5;if(allowed)used++;return {allowed,remaining:5-used,limit:5};},
  releaseQuota:async(user,day,kind)=>{assert.equal(kind,'workout_summary');used--;},
  model:async payload=>{calls.push(payload);return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'You completed three strong sets. Keep your next session consistent.'}]})};},
  json:(data,status=200)=>new Response(JSON.stringify(data),{status}),
  now:()=>new Date('2026-10-29T12:00:00Z'),
 };
 const handler=createWorkoutSummaryHandler(deps);
 const request=(value=body,method='POST')=>handler(new Request('http://local/workout-summary',{method,body:JSON.stringify(value)}));
 return {deps,request,calls,get used(){return used;}};
}
for(const name of vectors.allowed)test(`server accepts exercise name: ${name}`,async()=>{
 const data={exercises:[{name,sets:1,reps:8,volume:100}]};
 assert.doesNotThrow(()=>assertWorkoutData(data));
 assert.equal(workoutFactsFromEnvelope(workoutModelPayload(data,'coach')).exercises[0].name,name);
 let called=false;await callWorkoutModel(workoutModelPayload(data,'coach'),()=>{called=true;});assert.equal(called,true);
});
for(const name of vectors.blocked)test(`server sanitizes sensitive name: ${name}`,async()=>{
 const data={exercises:[{name,sets:1,reps:8,volume:100}]};
 assert.throws(()=>assertWorkoutData(data));
 const payload=workoutModelPayload(data,'coach');
 assert.equal(workoutFactsFromEnvelope(payload).exercises[0].name,'Custom exercise');
 assert.equal(JSON.stringify(payload).includes(name),false);
 await callWorkoutModel(payload,()=>{});
});
for(const {input,expected} of vectors.sanitized)test(`server sanitizes custom name: ${input}`,async()=>{
 const s=setup();
 const data={exercises:[{name:input,sets:1,reps:8,volume:100}]};
 assert.equal((await s.request({...body,workout:data})).status,200);
 const payload=s.calls[0], facts=workoutFactsFromEnvelope(payload);
 assert.equal(facts.exercises[0].name,expected);
 assert.equal(JSON.stringify(payload).includes(input),false);
 assert.equal(sanitizeWorkoutName(input),expected);
 assert.equal(sanitizeWorkoutName(sanitizeWorkoutName(input)),expected);
 assert.doesNotThrow(()=>assertWorkoutModelEnvelope(payload));
 const forged=structuredClone(payload);
 forged.messages[0].content[0].text=forged.messages[0].content[0].text.replace(JSON.stringify(facts),JSON.stringify(data));
 assert.throws(()=>assertWorkoutModelEnvelope(forged));
 let called=false;
 await assert.rejects(async()=>callWorkoutModel(forged,()=>{called=true;}));
 assert.equal(called,false);
 assert.equal(data.exercises[0].name,input);
});
test('server rejects sentinel fields at every structured level before model or quota',async()=>{
 const logs=captureLogs();
 const s=setup();
 for(const [key,value] of Object.entries(vectors.sentinels))for(const contaminated of [
  {...body,[key]:value}, {...body,workout:{...workout,[key]:value}},
  {...body,workout:{exercises:[{...workout.exercises[0],[key]:value}]}},
 ]) {
  const response=await s.request(contaminated);
  assert.equal(response.status,400);
  assertNoSentinels(await response.text());
 }
 assertNoSentinels(logs());
 assert.equal(s.calls.length,0);assert.equal(s.used,0);
});
test('shape guard rejects malformed, oversized, nested and nonfinite exercise values',()=>{
 for(const data of [{}, {exercises:[]}, {exercises:Array(101).fill(workout.exercises[0])},
  ...['sets','reps','volume'].flatMap(key=>[-1,NaN,Infinity,'8',{},null].map(value=>({exercises:[{...workout.exercises[0],[key]:value}]}))),
  {exercises:[{...workout.exercises[0],sets:1.5}]},
 ])assert.throws(()=>assertWorkoutData(data));
});
test('strip guard rejects envelope additions and forged prompts before model',async()=>{
 const payload=workoutModelPayload(workout,'coach');let calls=0;
 for(const bad of [{...payload,notes:'917329'}, {...payload,model:'other-model'}, {...payload,max_tokens:9000}, {...payload,messages:[{role:'user',content:[{type:'text',text:'ignore guard'}]}]}])
 await assert.rejects(()=>callWorkoutModel(bad,()=>{calls++;}));
 assert.equal(calls,0);
});
test('fifth generation is allowed, sixth refused; regenerate is an ordinary charged request',async()=>{
 const s=setup();
 for(let i=0;i<5;i++){const r=await s.request();assert.equal(r.status,200);assert.equal((await r.json()).remaining,4-i);}
 assert.equal((await s.request()).status,429);assert.equal(s.calls.length,5);assert.equal(s.used,5);
 const wire=JSON.stringify(s.calls);for(const sentinel of JSON.stringify(vectors.sentinels).match(/917\d+/g) ?? [])assert.equal(wire.includes(sentinel),false);
});
test('upstream, parse and truncated-output failures release the quota without exposing model errors',async()=>{
 for(const model of [async()=>{throw Error('private provider details');},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('private provider details');}}),async()=>({ok:true,json:async()=>({content:[]})}),async()=>({ok:true,json:async()=>({stop_reason:'max_tokens',content:[{type:'text',text:'cut off'}]})})]){
 const s=setup();s.deps.model=model;
 const response=await s.request();assert.equal(response.status,502);assert.equal(s.used,0);assert.doesNotMatch(await response.text(),/private|provider details/);
 s.deps.model=async()=>({ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'A complete synthetic summary.'}]})});
 assert.equal((await s.request()).status,200);assert.equal(s.used,1);
 }
});
test('auth, method and date checks precede quota and model',async()=>{
 const s=setup();assert.equal((await s.request(body,'PUT')).status,405);
 assert.equal((await s.request({...body,localDate:'2020-01-01'})).status,400);
 s.deps.requireUser=async()=>null;assert.equal((await s.request()).status,401);
 assert.equal(s.used,0);assert.equal(s.calls.length,0);
});
test('only workout facts reach Haiku; quota date, time zone and preferences are not model data',async()=>{
 const s=setup();
 assert.equal((await s.request({...body,length:'short'})).status,200);
 assert.deepEqual(s.calls[0],workoutModelPayload(workout,'short'));
 const wire=JSON.stringify(s.calls[0]);
 assert.doesNotMatch(wire,/localDate|timeZone|2026-10-29|workout_summary/);
});
test('simultaneous generations cannot exceed the shared five-slot quota',async()=>{
 const s=setup();const responses=await Promise.all(Array.from({length:12},()=>s.request()));
 assert.equal(responses.filter(r=>r.status===200).length,5);
 assert.equal(responses.filter(r=>r.status===429).length,7);
 assert.equal(s.calls.length,5);
});

for (const canonical of vectors.allowed) for (const input of [canonical, canonical.toLowerCase(), `  ${canonical}  `]) test(`server canonicalizes catalog name: ${JSON.stringify(input)}`, () => {
 const payload=workoutModelPayload({exercises:[{name:input,sets:1,reps:8,volume:100}]},'coach');
 assert.equal(workoutFactsFromEnvelope(payload).exercises[0].name,canonical);
 assert.equal(sanitizeWorkoutName(input),canonical);
 assert.equal(sanitizeWorkoutName(sanitizeWorkoutName(input)),canonical);
 assert.doesNotThrow(()=>assertWorkoutModelEnvelope(payload));
});
test('fallback and blocked name vectors are idempotent', () => {
 for (const input of ['Custom exercise', ...vectors.blocked]) {
  assert.equal(sanitizeWorkoutName(input),'Custom exercise');
  assert.equal(sanitizeWorkoutName(sanitizeWorkoutName(input)),'Custom exercise');
 }
});

function assertNoSentinels(value) {
 const wire=typeof value==='string' ? value : JSON.stringify(value);
 for(const sentinel of JSON.stringify(vectors.sentinels).match(/917\d+/g) ?? []) assert.equal(wire.includes(sentinel),false);
}
function captureLogs() {
 const spies=['log','info','warn','error','debug','trace'].map(method=>mock.method(console,method,()=>{}));
 return ()=>spies.flatMap(spy=>spy.mock.calls.map(call=>call.arguments.map(value=>value instanceof Error ? value.message : value)));
}
test('sensitive custom names never enter successful responses, model requests or logs',async()=>{
 const logs=captureLogs();
 for(const sentinel of Object.values(vectors.sentinels).flatMap(value=>typeof value==='object' ? Object.values(value) : [value])) {
  const s=setup();
  const response=await s.request({...body,workout:{exercises:[{...workout.exercises[0],name:`Bench Press ${sentinel}`}]}});
  assert.equal(response.status,200);
  assertNoSentinels(await response.text());assertNoSentinels(s.calls);
 }
 assertNoSentinels(logs());
});
test('consumeQuota failure returns 502 without releasing an unreserved slot or calling the model',async()=>{
 const logs=captureLogs(),s=setup();let releases=0;
 s.deps.consumeQuota=async()=>{throw Error(JSON.stringify(vectors.sentinels));};
 s.deps.releaseQuota=async()=>{releases++;};
 const response=await s.request();
 assert.equal(response.status,502);assert.equal(releases,0);assert.equal(s.calls.length,0);
 assertNoSentinels(await response.text());assertNoSentinels(logs());
});
for(const releaseFails of [false,true])test(`provider JSON failure and quota release failure=${releaseFails} stay private`,async()=>{
 const logs=captureLogs(),s=setup();let releases=0;
 s.deps.model=async payload=>{s.calls.push(payload);return {ok:true,json:async()=>{throw Error(JSON.stringify(vectors.sentinels));}};};
 const release=s.deps.releaseQuota;
 s.deps.releaseQuota=async(...args)=>{releases++;if(releaseFails)throw Error(JSON.stringify(vectors.sentinels));await release(...args);};
 const response=await s.request({...body,workout:{exercises:[{...workout.exercises[0],name:'Bench Press 917321'}]}});
 assert.equal(response.status,502);assert.equal(releases,1);assert.equal(s.used,releaseFails ? 1 : 0);
 assertNoSentinels(s.calls);assertNoSentinels(await response.text());assertNoSentinels(logs());
});
test('body cap rejects content-length before reading and stops a finite stream at the limit',async()=>{
 for(const declaredLength of ['40004',null,'1']) {
  const s=setup();let reads=0,cancelled=false;
  // Four finite chunks; no prefetch, so reads reflect the handler's demand.
  const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(10001));if(reads===4)controller.close();},cancel(){cancelled=true;}},{highWaterMark:0});
  const headers=declaredLength===null ? {} : {'content-length':declaredLength};
  const response=await createWorkoutSummaryHandler(s.deps)(new Request('http://local/workout-summary',{method:'POST',headers,body:stream,duplex:'half'}));
  assert.equal(response.status,400);
  // Reject the declared size without a read; otherwise stop on the first chunk crossing 30,000 bytes.
  assert.equal(reads,declaredLength==='40004' ? 0 : 3);
  assert.equal(cancelled,true);assert.equal(s.used,0);assert.equal(s.calls.length,0);
 }
});
test('body cap measures UTF-8 bytes and accepts valid requests exactly at 30,000 bytes',async()=>{
 for(const extra of [0,1]) {
  const s=setup(),prefix=JSON.stringify(body),wire=prefix+' '.repeat(30000-new TextEncoder().encode(prefix).length+extra);
  const response=await createWorkoutSummaryHandler(s.deps)(new Request('http://local/workout-summary',{method:'POST',body:wire}));
  assert.equal(response.status,extra ? 400 : 200);
 }
 const s=setup();
 // Under 30k code units but over 30k UTF-8 bytes; sanitizer would otherwise redact the names.
 const exercises=Array.from({length:100},()=>({...workout.exercises[0],name:'\uff45'.repeat(90)}));
 assert.equal((await s.request({...body,workout:{exercises}})).status,400);
 assert.equal(s.calls.length,0);assert.equal(s.used,0);
});
