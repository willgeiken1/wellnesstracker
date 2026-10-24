import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { PlanStore } from '../../src/features/plans/store';
import { WorkoutStore } from '../../src/data/workout/store';
import { OWNER_A, DEVICE_A } from '../../fixtures/sync';

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
