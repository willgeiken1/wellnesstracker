import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';

const now = Date.now();
function saved(store: WorkoutStore, weight: string, day = now - 86400000) {
  const session = store.start(undefined, day);
  const entry = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(entry.id, 0, {weight, reps:'8'});
  store.toggleDone(entry.id, 0);
  store.finish(session.id, {startedAt:day, finishedAt:day + 60000, notes:''});
  return {session, entry};
}
test('an edited-away PR disappears from summary and milestones without duplicate tokens', () => {
  const store = new WorkoutStore(memoryRepository());
  saved(store, '100', now - 2 * 86400000);
  const {session,entry} = saved(store, '110');
  expect(store.summary(session.id).prs).toHaveLength(1);
  store.beginEditing(session.id);
  store.editDraft(entry.id, 0, {weight:'90'});
  expect(store.summary(session.id).prs).toHaveLength(0);
  expect(store.milestones().filter(m => m.sessionId === session.id)).toHaveLength(0);
  store.editDraft(entry.id, 0, {weight:'120'});
  store.editDraft(entry.id, 0, {reps:'9'});
  expect(store.milestones().filter(m => m.sessionId === session.id)).toHaveLength(1);
});
test('weekly sets move weeks and disappear when sets are removed; edited only for actual changes', () => {
  const store = new WorkoutStore(memoryRepository());
  const {session,entry} = saved(store, '100');
  store.beginEditing(session.id);
  expect(store.edited(session.id)).toBe(false);
  store.editDraft(entry.id, 0, {reps:'8'});
  expect(store.edited(session.id)).toBe(false);
  expect(Object.values(store.weekly(new Date(now - 86400000))).some(n => n > 0)).toBe(true);
  const prior = now - 15 * 86400000;
  store.finish(session.id, {startedAt:prior,finishedAt:prior+120000,notes:''});
  expect(store.edited(session.id)).toBe(true);
  expect(Object.values(store.weekly(new Date(now - 86400000))).every(n => n === 0)).toBe(true);
  expect(Object.values(store.weekly(new Date(prior))).some(n => n > 0)).toBe(true);
  store.removeSet(entry.id, 0);
  expect(Object.values(store.weekly(new Date(prior))).every(n => n === 0)).toBe(true);
  expect(store.milestones()).toHaveLength(0);
});
test('historical replacement reattributes completed sets and their records', () => {
  const store = new WorkoutStore(memoryRepository());
  const baseline = saved(store, '90', now - 2 * 86400000);
  store.replaceExercise(baseline.entry.id,'Squat');
  const {session,entry} = saved(store, '100');
  store.beginEditing(session.id);
  store.replaceExercise(entry.id,'Squat');
  expect(store.entries(session.id)).toHaveLength(1);
  expect(store.summary(session.id).prs[0].exercise).toBe('Squat');
  expect(store.milestones()[0].exercise).toBe('Squat');
  expect(store.edited(session.id)).toBe(true);
});
test('past-day logging and historical completion never start rest or disturb a live workout', () => {
  const store = new WorkoutStore(memoryRepository());
  const live = store.start();
  const session = store.startPast('2026-10-01');
  const entry = store.addExercise(session.id,'Bench Press',1);
  store.editDraft(entry.id,0,{weight:'100',reps:'8'});
  const startRest = jest.spyOn(store as unknown as {startRest: (...args: unknown[]) => void},'startRest');
  store.toggleDone(entry.id,0);
  expect(startRest).not.toHaveBeenCalled();
  expect(store.timer()).toBeFalsy();
  expect(store.active()?.id).toBe(live.id);
  store.finish(session.id,{startedAt:Number(session.data.started_at),finishedAt:Number(session.data.started_at)+60000,notes:''});
  expect(store.edited(session.id)).toBe(false);
  store.toggleDone(entry.id,0);
  store.toggleDone(entry.id,0);
  expect(startRest).not.toHaveBeenCalled();
});
test('warm-up changes are real edits and rebuild weekly sets with v1 columns off', () => {
  const store = new WorkoutStore(memoryRepository());
  const {session,entry} = saved(store,'100');
  store.editDraft(entry.id,0,{tag:'warmup'});
  expect(store.edited(session.id)).toBe(true);
  expect(Object.values(store.weekly(new Date(now-86400000))).every(n=>n===0)).toBe(true);
});
test('past-day drafts resume without duplicates and reject invalid and future dates', () => {
  const store = new WorkoutStore(memoryRepository());
  const first = store.startPast('2026-10-01');
  expect(store.startPast('2026-10-01').id).toBe(first.id);
  expect(() => store.startPast('2026-02-30')).toThrow();
  expect(() => store.startPast('2099-01-01')).toThrow();
  expect(() => store.startPast('invalid')).toThrow();
});
test('saving a past workout preserves the active workout rest timer', () => {
  const store = new WorkoutStore(memoryRepository());
  const live = store.start();
  const liveEntry = store.addExercise(live.id,'Bench Press',1);
  store.editDraft(liveEntry.id,0,{weight:'100',reps:'8'});
  store.toggleDone(liveEntry.id,0);
  const timer = store.timer();
  const past = store.startPast('2026-10-01');
  const entry = store.addExercise(past.id,'Squat',1);
  store.editDraft(entry.id,0,{weight:'100',reps:'8'});
  store.toggleDone(entry.id,0);
  expect(store.timer()).toEqual(timer);
  store.finish(past.id,{startedAt:Number(past.data.started_at),finishedAt:Number(past.data.started_at)+60000,notes:''});
  store.toggleDone(entry.id,0); store.toggleDone(entry.id,0);
  expect(store.timer()).toEqual(timer);
});

test('finished swaps stay session-only while replacements update the routine and reset exercise options', () => {
  const store = new WorkoutStore(memoryRepository());
  const routine = store.saveTemplate('Synthetic routine', [{exercise:'Bench Press',target_sets:1,target_reps:8,rep_min:6,rep_max:10}]);
  const session = store.start(routine.id, now - 86400000);
  const entry = store.entries(session.id)[0];
  const routineEntry = store.templateExercises(routine.id)[0];
  store.setUnilateral(entry.id,true);
  store.editDraft(entry.id,0,{weight:'100',reps:'8',rightWeight:'90',rightReps:'8'});
  store.toggleDone(entry.id,0);
  store.finish(session.id,{startedAt:now-86400000,finishedAt:now-86400000+60000,notes:''});
  const setId = store.sets(entry.id)[0].id;
  store.replaceExercise(entry.id,'Squat','swap');
  expect(store.templateExercises(routine.id)[0].data.exercise).toBe('Bench Press');
  expect(store.repo.localGet(`routineUnilateral:${routineEntry.id}`)).toBe(true);
  expect(store.templateExercises(routine.id)[0].data).toMatchObject({rep_min:6,rep_max:10});
  expect(store.isUnilateral(entry.id)).toBe(true); // Completed side values retain their attribution.
  expect(store.repo.localGet(`unilateral:${entry.id}`)).toBe(false);
  expect(store.repRange(store.entries(session.id)[0])).toBeNull();
  expect(store.repo.localGet(`routineExercise:${entry.id}`)).toBe(routineEntry.id);
  store.replaceExercise(entry.id,'Deadlift','replace');
  expect(store.templateExercises(routine.id)[0].data.exercise).toBe('Deadlift');
  expect(store.templateExercises(routine.id)[0].data).toMatchObject({rep_min:null,rep_max:null});
  expect(store.repo.localGet(`routineUnilateral:${routineEntry.id}`)).toBe(false);
  expect(store.entries(session.id)).toHaveLength(1);
  expect(store.sets(entry.id)[0].id).toBe(setId);
  expect(store.entries(session.id)[0].data.exercise).toBe('Deadlift');
  expect(store.summary(session.id).count).toBe(1);
  expect(store.edited(session.id)).toBe(true);
});
