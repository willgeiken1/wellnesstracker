import assert from 'node:assert/strict';
import test from 'node:test';
// All data is synthetic. Browser sharing is captured locally, never sent.
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.window=globalThis;
globalThis.document={addEventListener(){},documentElement:{dataset:{}},querySelector:()=>({addEventListener(){}})};
const {app}=await import('../logger/js/runtime.js');
await import('../logger/js/data/state.js');
await import('../logger/js/shell/actions.js');
test('extended backup includes food, cardio, measurements and homeV2 without device consent or checkins',async()=>{
 app.state={version:2,workouts:[],sessions:[],plan:{},planAt:{},food:{days:{'2026-01-01':[{name:'Fixture oats'}]}},cardio:{sessions:[{id:'fixture'}]},measurements:{'2026-01-01':{vals:{waist:80}}},layout:{homeV2:{v:2,items:['today'],hidden:[]}},machineNotes:{Dips:'Fixture note'},goals:{},deleted:[],purges:[],checkins:{secret:'excluded fixture'},appLock:{enabled:true},analytics:true,oura:{days:{fixture:'excluded'}}};
 let captured;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>true,share:async({files})=>{captured=JSON.parse(await files[0].text());}}});
 app.save=()=>{};app.render=()=>{};app.toast=()=>{};app.today=()=> '2026-01-01';
 await app.exportData();
 for(const key of ['food','cardio','measurements','layout','planAt','machineNotes','goals','deleted','purges'])assert.deepEqual(captured[key],app.state[key]);
 for(const key of ['checkins','appLock','analytics','oura'])assert.equal(Object.hasOwn(captured,key),false);
 assert.equal(captured.version,2);
});
