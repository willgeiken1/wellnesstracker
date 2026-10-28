import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { WorkoutStore } from '../../src/data/workout/store';
import { detectPR, setMetrics } from '../../src/core/workout/rules';
import { OWNER_A, DEVICE_A } from '../../fixtures/sync';
async function setup(enabled = false) {
  const db = await localDatabase(':memory:', { syncedV1Columns: enabled });
  const repo = new Repository(db.db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: enabled });
  return { ...db, repo, store: new WorkoutStore(repo) };
}
function log(store: WorkoutStore, id: string) {
  store.editDraft(id, 0, { weight: '100', reps: '8' }); store.toggleDone(id, 0);
}
async function roundTrip(source: Repository, enabled = true) {
  const target = await setup(enabled);
  for (const table of ['sessions', 'entries', 'sets', 'settings'] as const)
    target.repo.applyPage(table, source.list(table).map((row, i) => ({ row, server_seq: String(i + 1) })), '100');
  return target;
}
test.each([false, true])('clearable tag and warm-up PR/e1RM exclusions, flag %s', async enabled => {
  const a = await setup(enabled);
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Bench Press'); log(a.store, e.id);
    a.store.editDraft(e.id, 0, { tag: 'warmup' });
    expect(detectPR(a.store.working(e), [{ weight: 1, reps: 1, done: true }]).weight).toBe(false);
    expect(setMetrics(a.store.working(e)[0]).e1rm).toBeNull();
    expect(a.store.sets(e.id)[0].data.tag).toBe(enabled ? 'warmup' : null);
    if (enabled) {
      const b = await roundTrip(a.repo);
      try { expect(b.store.drafts(e.id)[0].tag).toBe('warmup'); expect(setMetrics(b.store.working(b.repo.get('entries', e.id)!)[0]).e1rm).toBeNull(); }
      finally { b.sqlite.close(); }
    }
    for (const tag of ['failure', 'drop', null] as const) {
      a.store.editDraft(e.id, 0, { tag }); expect(a.store.drafts(e.id)[0].tag).toBe(tag);
    }
    expect(a.store.working(e)[0].warmup).toBe(false);
  } finally { a.sqlite.close(); }
});
test('unilateral validates both sides and uses the lower e1RM side after round trip', async () => {
  const a = await setup();
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Dumbbell Row'); a.store.setUnilateral(e.id, true);
    a.store.editDraft(e.id, 0, { weight: '100', reps: '2' });
    expect(() => a.store.toggleDone(e.id, 0)).toThrow();
    a.store.editDraft(e.id, 0, { rightWeight: '80', rightReps: '12' }); a.store.toggleDone(e.id, 0);
    expect(a.store.sets(e.id)[0].data).toMatchObject({ left_reps: 2, right_reps: 12 });
    const working = a.store.working(e)[0];
    expect(working.weight).toBeCloseTo(45.359237); expect(working.reps).toBe(2);
    expect(detectPR([working], [{weight: 46, reps: 2, done: true}]).weight).toBe(false);
    const b = await roundTrip(a.repo, false);
    try { expect(b.store.drafts(e.id)[0]).toMatchObject({ weight: '100', reps: '2', rightWeight: '80', rightReps: '12' }); }
    finally { b.sqlite.close(); }
  } finally { a.sqlite.close(); }
});
test.each([false, true])('skip is pending-only and completed sets remain counted across devices, flag %s', async enabled => {
  const a = await setup(enabled);
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Bench Press');
    a.store.skipExercise(e.id);
    expect(a.store.skipped(e.id)).toBe(true);
    expect(() => log(a.store, e.id)).toThrow();
    a.store.skipExercise(e.id, false);
    log(a.store, e.id);
    expect(() => a.store.skipExercise(e.id)).toThrow();
    expect(a.store.skipped(e.id)).toBe(false);
    const now = Number(s.data.started_at); a.store.finish(s.id, { startedAt: now, finishedAt: now, notes: '' });
    const b = await roundTrip(a.repo, enabled);
    try {
      expect(a.store.summary(s.id).count).toBe(1);
      expect(b.store.summary(s.id).count).toBe(1);
      expect(a.store.trainingHistory()).toHaveLength(1);
    } finally { b.sqlite.close(); }
  } finally { a.sqlite.close(); }
});
test.each(['swap', 'replace'] as const)('%s retains original completed sets and moves pending work', async mode => {
  const a = await setup();
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Bench Press'); log(a.store, e.id);
    const saved = a.store.sets(e.id)[0].id, replacement = a.store.replaceExercise(e.id, 'Dumbbell Row', mode);
    expect(a.store.sets(e.id)[0].id).toBe(saved); expect(a.repo.get('entries', e.id)?.data.exercise).toBe('Bench Press');
    expect(replacement.data.exercise).toBe('Dumbbell Row'); expect(a.store.drafts(e.id)).toHaveLength(1);
    expect(a.store.drafts(replacement.id)).toHaveLength(2); expect(a.store.summary(s.id).count).toBe(1);
  } finally { a.sqlite.close(); }
});
test.each([false, true])('rest round trip gated (%s); per-exercise style synced and haptics local', async enabled => {
  const a = await setup(enabled);
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Bench Press'); a.repo.localSave('haptics', false);
    a.store.setRest('Bench Press', { seconds: 120, style: 'converge' });
    expect(a.store.rest('Bench Press')).toEqual({seconds: 120, style: 'converge'});
    log(a.store, e.id); expect(a.store.timer()?.duration).toBe(120);
    const b = await roundTrip(a.repo, enabled);
    try { expect(b.store.rest('Bench Press').seconds).toBe(enabled ? 120 : 90); expect(b.store.rest('Bench Press').style).toBe(enabled ? 'converge' : 'unwind'); expect(b.repo.localGet('haptics')).toBeUndefined(); }
    finally { b.sqlite.close(); }
    if (!enabled) expect(a.repo.list('settings')).toEqual([]);
    expect(a.repo.list('settings').some(r => r.data.haptics != null)).toBe(false);
  } finally { a.sqlite.close(); }
});
test.each([false, true])('routine exercise rest is restored on start; global style round trip flag %s', async enabled => {
  const a = await setup(enabled);
  try {
    const routine = a.store.saveTemplate('Synthetic rest routine', [{ exercise:'Bench Press', target_sets:3, target_reps:8, restSeconds:180, restStyle:'converge' }]);
    a.store.setDefaultRestStyle('converge');
    const session = a.store.start(routine.id), entry = a.store.entries(session.id)[0]; log(a.store, entry.id);
    expect(a.store.timer()?.duration).toBe(180);
    expect(a.store.rest('Bench Press').style).toBe('converge');
    const b = await roundTrip(a.repo, enabled);
    try { expect(b.store.defaultRestStyle()).toBe(enabled ? 'converge' : 'unwind'); }
    finally { b.sqlite.close(); }
  } finally { a.sqlite.close(); }
});
test('editing a unilateral tag or reps preserves exact kg for each side', async () => {
  const a = await setup(true);
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Dumbbell Row');
    a.store.setUnilateral(e.id, true);
    a.store.editDraft(e.id, 0, {weight:'100',reps:'8',rightWeight:'80',rightReps:'8'}); a.store.toggleDone(e.id,0);
    const set = a.store.sets(e.id)[0];
    a.repo.save('sets',{...set.data,left_weight_kg:45.123456,right_weight_kg:36.123456},set.id);
    a.store.editDraft(e.id,0,{tag:'drop'});
    expect(a.store.sets(e.id)[0].data.left_weight_kg).toBe(45.123456);
    expect(a.store.sets(e.id)[0].data.right_weight_kg).toBe(36.123456);
  } finally { a.sqlite.close(); }
});
test('replacement moves all unfinished work even when completed sets are sparse', async () => {
  const a = await setup();
  try {
    const e = a.store.addExercise(a.store.start().id, 'Bench Press');
    a.store.editDraft(e.id,2,{weight:'100',reps:'8'}); a.store.toggleDone(e.id,2);
    const setId = a.store.sets(e.id)[0].id;
    const replacement = a.store.replaceExercise(e.id,'Dumbbell Row');
    expect(a.store.drafts(e.id)).toHaveLength(1);
    expect(a.store.drafts(e.id)[0].setId).toBe(setId);
    expect(a.store.drafts(replacement.id)).toHaveLength(2);
  } finally { a.sqlite.close(); }
});
test.each([false, true])('unilateral is isolated from same-name bilateral entries in current and past sessions, flag %s', async enabled => {
  const a = await setup(enabled), now = Date.now() - 120000;
  try {
    const prior = a.store.start(undefined, now), past = a.store.addExercise(prior.id, 'Dumbbell Row'); log(a.store, past.id);
    a.store.finish(prior.id, {startedAt: now, finishedAt: now + 1000, notes: ''});
    const session = a.store.start(undefined, now + 2000), current = a.store.addExercise(session.id, 'Dumbbell Row'); log(a.store, current.id);
    const unilateral = a.store.addExercise(session.id, 'Dumbbell Row'); a.store.setUnilateral(unilateral.id, true);
    expect(new WorkoutStore(a.repo).isUnilateral(unilateral.id)).toBe(true);
    for (const e of [past, current]) {
      expect(a.store.isUnilateral(e.id)).toBe(false);
      a.store.editDraft(e.id, 0, {tag: 'drop', reps: '10'});
      a.store.toggleDone(e.id, 0); a.store.toggleDone(e.id, 0);
      expect(a.store.sets(e.id)[0].data).toMatchObject({reps: 10, right_reps: null});
    }
  } finally { a.sqlite.close(); }
});
test.each([false, true])('template save leaves untouched rest inherited and only persists changed rows, flag %s', async enabled => {
  const a = await setup(enabled);
  try {
    const exercises = ['Bench Press', 'Dumbbell Row'].map(exercise => ({exercise, target_sets: 3, target_reps: 8}));
    const routine = a.store.saveTemplate('Synthetic routine', exercises);
    const rows = a.store.templateExercises(routine.id).map(e => ({...exercises.find(x => x.exercise === e.data.exercise)!, id: e.id}));
    const setRest = jest.spyOn(a.store, 'setRest'), save = jest.spyOn(a.repo, 'save');
    a.store.saveTemplate('Renamed routine', rows, routine.id);
    expect(setRest).not.toHaveBeenCalled();
    expect(save.mock.calls.filter(([table]) => table === 'settings')).toHaveLength(0);
    expect(a.repo.localGet('rest:bench press')).toBeUndefined();
    // Editor may submit the currently selected default without changing it.
    a.store.saveTemplate('Renamed routine', rows.map(e => ({...e, restSeconds: 90, restStyle: 'unwind' as const})), routine.id);
    expect(setRest).not.toHaveBeenCalled();
    a.store.saveTemplate('Renamed routine', rows.map((e, i) => i === 1 ? {...e, restSeconds: 120, restStyle: 'converge' as const} : e), routine.id);
    expect(setRest).toHaveBeenCalledTimes(1);
    expect(a.repo.localGet('rest:bench press')).toBeUndefined();
    expect(a.store.rest('Dumbbell Row')).toEqual({seconds: 120, style: 'converge'});
    if (enabled) expect(JSON.parse(String(a.repo.list('settings')[0].data.rest_per_exercise))).toEqual({'dumbbell row': {seconds:120,style:'converge'}});
  } finally { a.sqlite.close(); }
});
test.each(['expiry', 'next set', 'dismiss'] as const)('timer adjustments persist once on %s, including after store recreation', async boundary => {
  const a = await setup(true);
  try {
    const e = a.store.addExercise(a.store.start().id, 'Bench Press'); log(a.store, e.id);
    const save = jest.spyOn(a.repo, 'save');
    a.store.adjustTimer(15); a.store.adjustTimer(15); a.store.adjustTimer(-15);
    expect(a.store.timer()?.duration).toBe(105);
    expect(save.mock.calls.filter(([table]) => table === 'settings')).toHaveLength(0);
    const store = new WorkoutStore(a.repo);
    if (boundary === 'expiry') { store.updateTimer({ended: true, minimized: true}); store.updateTimer({ended: true}); }
    else if (boundary === 'next set') { store.editDraft(e.id, 1, {weight: '100', reps: '8'}); store.toggleDone(e.id, 1); }
    else { store.skipTimer(); store.skipTimer(); }
    expect(store.rest('Bench Press').seconds).toBe(105);
    expect(save.mock.calls.filter(([table]) => table === 'settings')).toHaveLength(1);
    if (boundary === 'next set') expect(store.timer()?.duration).toBe(105);
  } finally { a.sqlite.close(); }
});
test('bilateral entered_value preserves the typed number on creation and weight edit', async () => {
  const a = await setup();
  try {
    const e = a.store.addExercise(a.store.start().id, 'Bench Press');
    a.store.editDraft(e.id, 0, {weight: '2.9', reps: '8'}); a.store.toggleDone(e.id, 0);
    expect(a.store.sets(e.id)[0].data.entered_value).toBe(2.9);
    a.store.editDraft(e.id, 0, {weight: '3.3'});
    expect(a.store.sets(e.id)[0].data.entered_value).toBe(3.3);
  } finally { a.sqlite.close(); }
});
