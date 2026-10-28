import type { WorkoutStore } from '@/data/workout/store';
import { exerciseFor, type Exercise } from '@/core/workout/library';
import { validCustomExercise } from '@/core/workout/exercise-rules';
import type { AtlasSession } from './volume';
/** Read custom definitions directly: WorkoutPreferences.exercise may promote
 * legacy preferences into the sync outbox when future flags are enabled. */
function definitions(store: WorkoutStore): Exercise[] {
 if (!store.repo.syncFlags?.syncedV1Columns) return (store.repo.localGet<Exercise[]>('customLifts')??[]).filter(validCustomExercise);
 return store.repo.list('custom_exercises').flatMap(row=>{
  try {
   const helpers: unknown=JSON.parse(String(row.data.helpers??'[]'));
   if(!Array.isArray(helpers)||!helpers.every(h=>typeof h==='string'))return [];
   const exercise={name:String(row.data.name??''),main:String(row.data.main_muscle??''),helpers,equipment:row.data.equipment as Exercise['equipment']};
   return validCustomExercise(exercise)?[exercise]:[];
  }catch{return [];}
 });
}
/** Read facade only. No writes, sync calls, raw weights, or telemetry. */
export function atlasSessions(store: WorkoutStore | null): AtlasSession[] {
 if (!store) return [];
 const custom=definitions(store);
 return store.history().map(session=>({at:Number(session.data.finished_at),
  exercises:store.entries(session.id).map(entry=>{
   const name=String(entry.data.exercise);
   const exercise=custom.find(e=>e.name.toLowerCase()===name.toLowerCase())??exerciseFor(name);
   return {main:exercise.main,helpers:exercise.helpers,
    sets:store.working(entry).filter(s=>s.done&&!s.warmup&&s.reps>0).length};
  })}));
}
