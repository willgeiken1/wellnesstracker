import { plannedWeek, validDaysPerWeek } from '../src/features/plans/schedule';
import { PlanStore } from '../src/features/plans/store';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
const days = [{routineId:'a', weekdays:[0,6]}, {routineId:'b', weekdays:[2]}];
test.each([0,8,-1,1.5,NaN,Infinity])('reject target %s',n=>expect(validDaysPerWeek(n)).toBe(false));
test.each([1,3,7])('accept target %s',n=>expect(validDaysPerWeek(n)).toBe(true));
test.each([
 ['2026-12-28',['2026-12-28','2026-12-30','2027-01-03']],
 ['2027-01-04',['2027-01-04','2027-01-06','2027-01-10']],
 ['2026-03-02',['2026-03-02','2026-03-04','2026-03-08']],
 ['2026-10-26',['2026-10-26','2026-10-28','2026-11-01']],
])('fixed week %s crosses boundaries and DST', (monday,dates)=>{
 const result=plannedWeek(monday as string,{mode:'fixed',daysPerWeek:3,days},0);
 expect(result.map(d=>d.date)).toEqual(dates);
 expect(result.map(d=>d.routineId)).toEqual(['a','b','a']);
});
test('rotation forecasts target dates from the cursor',()=>{
 expect(plannedWeek('2026-12-28',{mode:'rotation',daysPerWeek:3,days},1)).toEqual([
 {date:'2026-12-28',routineId:'b'},{date:'2026-12-30',routineId:'a'},{date:'2027-01-01',routineId:'b'}]);
 expect(plannedWeek('2026-12-28',{mode:'rotation',daysPerWeek:3,days:[]},0)).toEqual([]);
});
test('bad weeks and targets fail closed',()=>{
 for(const week of ['2026-12-29','2026-02-30','bad']) expect(()=>plannedWeek(week,{mode:'fixed',daysPerWeek:3,days},0)).toThrow();
 expect(()=>plannedWeek('2026-12-28',{mode:'fixed',daysPerWeek:0,days},0)).toThrow();
});
function setup(enabled=true){
 const repo=memoryRepository();Object.defineProperty(repo,'syncFlags',{value:{syncedV1Columns:enabled}});
 const workout=new WorkoutStore(repo);
 const a=workout.saveTemplate('Synthetic A',[]),b=workout.saveTemplate('Synthetic B',[]);
 return {repo,workout,plans:new PlanStore(repo),days:[{routineId:a.id,weekdays:[0]},{routineId:b.id,weekdays:[4]}]};
}
test.each([false,true])('config round-trips only with flag %s',enabled=>{
 const {repo,plans,days}=setup(enabled);const save=jest.spyOn(repo,'save'),list=jest.spyOn(repo,'list');
 plans.save({mode:'fixed',daysPerWeek:5,days});const restored=new PlanStore(repo).read();
 expect(restored.mode).toBe(enabled?'fixed':'rotation');expect(restored.daysPerWeek).toBe(enabled?5:3);expect(restored.days).toEqual(days);
 if(enabled)expect(repo.list('plans')[0].data).toEqual({mode:'fixed',days_per_week:5});
 else {expect(save.mock.calls.some(([table])=>table==='plans')).toBe(false);expect(list.mock.calls.some(([table])=>table==='plans')).toBe(false);}
});
test('rotation advances only on finish, wraps, and ignores start/cancel/skip and finish edits',()=>{
 const {repo,workout,plans,days}=setup();plans.save({mode:'rotation',daysPerWeek:3,days});const now=Date.now()-60000;
 expect(plans.nextIndex()).toBe(0);const canceled=plans.startDay(days[0].routineId,now);expect(plans.nextIndex()).toBe(0);
 workout.skipTimer();expect(plans.nextIndex()).toBe(0);
 repo.save('plan_days',{day:'2026-10-19',routine_id:days[0].routineId,status:'skipped'});
 expect(plans.nextIndex()).toBe(0);repo.remove('sessions',canceled.id);expect(plans.nextIndex()).toBe(0);
 const first=plans.startDay(days[0].routineId,now);workout.finish(first.id,{startedAt:now,finishedAt:now+1000,notes:''});
 expect(new PlanStore(repo).nextIndex()).toBe(1);
 workout.finish(first.id,{startedAt:now,finishedAt:now+2000,notes:'edit'});expect(plans.nextIndex()).toBe(1);
 const second=plans.startDay(days[1].routineId,now+3000);workout.finish(second.id,{startedAt:now+3000,finishedAt:now+4000,notes:''});expect(plans.nextIndex()).toBe(0);
});
test('cannot associate an already active workout',()=>{
 const {plans,workout,days}=setup();plans.save({mode:'rotation',daysPerWeek:3,days});const active=workout.start();
 expect(()=>plans.startDay(days[0].routineId)).toThrow();const now=Number(active.data.started_at);
 workout.finish(active.id,{startedAt:now,finishedAt:now,notes:''});expect(plans.nextIndex()).toBe(0);
});
test('validation happens before writes',()=>{
 const {plans,days,repo}=setup();
 for(const n of [0,8,2.5])expect(()=>plans.save({mode:'rotation',daysPerWeek:n,days})).toThrow();
 expect(()=>plans.save({mode:'fixed',daysPerWeek:3,days:[...days,days[0]]})).toThrow();
 expect(()=>plans.save({mode:'fixed',daysPerWeek:3,days:days.map(d=>({...d,weekdays:[0]}))})).toThrow();
 expect(repo.localSnapshot()).toEqual({});
});
test('editing an older finish timestamp or start date cannot reorder rotation',()=>{
 const {plans,workout,days}=setup();plans.save({mode:'rotation',daysPerWeek:3,days});const now=Date.now()-60000;
 const a=plans.startDay(days[0].routineId,now);workout.finish(a.id,{startedAt:now,finishedAt:now+1000,notes:''});
 const b=plans.startDay(days[1].routineId,now+2000);workout.finish(b.id,{startedAt:now+2000,finishedAt:now+3000,notes:''});
 workout.finish(a.id,{startedAt:now+4000,finishedAt:now+5000,notes:'corrected date'});
 expect(plans.nextIndex()).toBe(0);
});
