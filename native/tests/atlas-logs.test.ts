import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { atlasSessions } from '../src/features/atlas/read-logs';
import { heatmap } from '../src/features/atlas/volume';
test('read facade excludes active work, warmups and unfinished drafts, responds to edits with no writes',()=>{
 const repo=memoryRepository(), store=new WorkoutStore(repo);
 const at=Date.now()-86400000, session=store.start(undefined,at),entry=store.addExercise(session.id,'Bench Press',3);
 store.editDraft(entry.id,0,{weight:'100',reps:'8',tag:'warmup'});store.toggleDone(entry.id,0);
 store.editDraft(entry.id,1,{weight:'100',reps:'8'});store.toggleDone(entry.id,1);
 expect(atlasSessions(store)).toEqual([]);
 store.finish(session.id,{startedAt:at,finishedAt:at+60000,notes:''});
 const save=jest.spyOn(repo,'save'),localSave=jest.spyOn(repo,'localSave');
 const values=heatmap(atlasSessions(store),at+120000);
 expect(values.find(v=>v.key==='pecUpper')?.sets).toBe(1);
 expect(values.find(v=>v.key==='tricepsLong')?.sets).toBe(.5);
 expect(save).not.toHaveBeenCalled();expect(localSave).not.toHaveBeenCalled();
 save.mockRestore();localSave.mockRestore();
 store.toggleDone(entry.id,1);
 expect(heatmap(atlasSessions(store),at+120000).find(v=>v.key==='pecUpper')?.sets).toBe(0);
});
test('custom lifts attribute locally and rendering never calls the promoting preference facade',()=>{
 const repo=memoryRepository(),store=new WorkoutStore(repo),at=Date.now()-3600000;
 store.preferences().saveCustom({name:'Synthetic lateral lift',main:'sideDelts',helpers:['forearms'],equipment:'dumbbell'});
 const s=store.start(undefined,at),e=store.addExercise(s.id,'Synthetic lateral lift',1);
 store.editDraft(e.id,0,{weight:'10',reps:'10'});store.toggleDone(e.id,0);
 store.finish(s.id,{startedAt:at,finishedAt:at+60000,notes:''});
 const prefs=jest.spyOn(store,'preferences').mockImplementation(()=>{throw Error('May promote preferences');});
 const save=jest.spyOn(repo,'save'),localSave=jest.spyOn(repo,'localSave');
 const map=heatmap(atlasSessions(store),at+120000);
 expect(map.find(v=>v.key==='deltLat')?.sets).toBe(1);
 expect(map.find(v=>v.key==='forearmFlex')?.sets).toBe(.5);
 expect(save).not.toHaveBeenCalled();expect(localSave).not.toHaveBeenCalled();
 prefs.mockRestore();save.mockRestore();localSave.mockRestore();
});

test('atlasSessions counts only done, positive-rep, non-warmup sets',()=>{
 const store=new WorkoutStore(memoryRepository()),at=Date.UTC(2026,9,28);
 const session=store.start(undefined,at);
 store.addExercise(session.id,'Bench Press',4);
 jest.spyOn(store,'working').mockReturnValue([
  {done:true,warmup:false,reps:8}, {done:true,warmup:true,reps:8},
  {done:true,warmup:false,reps:0}, {done:false,warmup:false,reps:8},
 ] as ReturnType<WorkoutStore['working']>);
 store.finish(session.id,{startedAt:at,finishedAt:at+60000,notes:''});
 expect(atlasSessions(store)).toEqual([{at:at+60000,exercises:[{main:'chest',helpers:expect.any(Array),sets:1}]}]);
});
test.each([null,undefined,NaN,''])('atlasSessions skips unfinished or invalid finished_at %s',finished=>{
 const store=new WorkoutStore(memoryRepository());
 const session=store.start(undefined,Date.UTC(2026,9,28));
 const data: Record<string,number|string|null>={...session.data};
 if(finished===undefined)delete data.finished_at;else data.finished_at=finished;
 jest.spyOn(store,'history').mockReturnValue([{...session,data}]);
 expect(atlasSessions(store)).toEqual([]);
});
