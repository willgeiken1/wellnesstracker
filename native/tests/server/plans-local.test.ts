import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { PlanStore } from '../../src/features/plans/store';
import { WorkoutStore } from '../../src/data/workout/store';
import { OWNER_A, OWNER_B, DEVICE_A } from '../../fixtures/sync';

test('SQLite: enabled config survives reopen; disabled client never reads or overwrites it',async()=>{
 const local=await localDatabase();let serial=200;
 const uuid=()=>`40000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
 const repository=(enabled:boolean)=>new Repository(local.db,OWNER_A,DEVICE_A,uuid,{syncedV1Columns:enabled});
 try {
  const enabled=repository(true),workout=new WorkoutStore(enabled);
  const routine=workout.saveTemplate('Synthetic routine',[]);
  const days=[{routineId:routine.id,weekdays:[0,6]}];
  new PlanStore(enabled).save({mode:'fixed',daysPerWeek:5,days});
  expect(new PlanStore(repository(true)).read()).toEqual({mode:'fixed',daysPerWeek:5,days});
  const disabled=repository(false),get=jest.spyOn(disabled,'get'),list=jest.spyOn(disabled,'list'),save=jest.spyOn(disabled,'save');
  expect(new PlanStore(disabled).read()).toEqual({mode:'rotation',daysPerWeek:3,days});
  new PlanStore(disabled).save({mode:'rotation',daysPerWeek:2,days});
  expect([...get.mock.calls,...list.mock.calls,...save.mock.calls].some(([table])=>table==='plans')).toBe(false);
  expect(new PlanStore(repository(true)).read()).toEqual({mode:'fixed',daysPerWeek:5,days});
 } finally {local.sqlite.close();}
});

test('SQLite: flag ON keeps replacement membership and weekdays owner-local, syncing only config',async()=>{
 const local=await localDatabase();let serial=300;
 const uuid=()=>`40000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
 const repository=(owner=OWNER_A)=>new Repository(local.db,owner,DEVICE_A,uuid,{syncedV1Columns:true});
 try {
  const repo=repository(),workout=new WorkoutStore(repo),plans=new PlanStore(repo);
  const a=workout.saveTemplate('Synthetic A',[]),b=workout.saveTemplate('Synthetic B',[]);
  const save=jest.spyOn(repo,'save');
  plans.save({mode:'fixed',daysPerWeek:3,days:[{routineId:a.id,weekdays:[0,2]}]});
  const id=repo.list('plans')[0].id;
  const days=[{routineId:b.id,weekdays:[1,4]}];
  plans.save({mode:'fixed',daysPerWeek:2,days});
  // Check the write boundary as well as persisted rows: column filtering must
  // not hide an attempt to send membership or weekday assignments.
  expect(save.mock.calls.map(([table,data])=>({table,data}))).toEqual([
   {table:'plans',data:{mode:'fixed',days_per_week:3}},
   {table:'plans',data:{mode:'fixed',days_per_week:2}},
  ]);
  expect(repo.list('plans').map(row=>({id:row.id,data:row.data}))).toEqual([
   {id,data:{mode:'fixed',days_per_week:2}},
  ]);
  expect(repo.list('plan_days')).toEqual([]);
  expect(repo.localGet('plans:definition')).toEqual({id,days});
  expect(new PlanStore(repository()).read()).toEqual({mode:'fixed',daysPerWeek:2,days});
  expect(new PlanStore(repository(OWNER_B)).read().days).toEqual([]);
  expect(repository(OWNER_B).localGet('plans:definition')).toBeUndefined();
 } finally {local.sqlite.close();}
});
