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
test('skip excludes every statistic and training input while retaining completed sets', async () => {
  const a = await setup();
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Bench Press'); log(a.store, e.id); a.store.skipExercise(e.id);
    const now = Number(s.data.started_at); a.store.finish(s.id, { startedAt: now, finishedAt: now, notes: '' });
    expect(a.store.sets(e.id)).toHaveLength(1);
    expect(a.store.summary(s.id)).toMatchObject({ count: 0, volume: 0, prs: [] });
    expect(a.store.weekly()).toEqual({}); expect(a.store.milestones()).toEqual([]);
    expect(a.store.trainingHistory()).toEqual([]); expect(a.store.working(e)).toEqual([]);
    a.store.skipExercise(e.id, false); expect(a.store.summary(s.id).count).toBe(1);
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
test.each([false, true])('rest round trip gated (%s); per-exercise style and haptics local', async enabled => {
  const a = await setup(enabled);
  try {
    const s = a.store.start(), e = a.store.addExercise(s.id, 'Bench Press'); a.repo.localSave('haptics', false);
    a.store.setRest('Bench Press', { seconds: 120, style: 'converge' });
    expect(a.store.rest('Bench Press')).toEqual({seconds: 120, style: 'converge'});
    log(a.store, e.id); expect(a.store.timer()?.duration).toBe(120);
    const b = await roundTrip(a.repo, enabled);
    try { expect(b.store.rest('Bench Press').seconds).toBe(enabled ? 120 : 90); expect(b.store.rest('Bench Press').style).toBe('unwind'); expect(b.repo.localGet('haptics')).toBeUndefined(); }
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
test('a skipped PR is absent from milestones and future progression', async () => {
  const a = await setup(true), now = Date.now()-120000;
  try {
    const prior = a.store.start(undefined,now), first = a.store.addExercise(prior.id,'Bench Press'); log(a.store,first.id);
    a.store.finish(prior.id,{startedAt:now,finishedAt:now+1000,notes:''});
    const s = a.store.start(undefined,now+2000), e = a.store.addExercise(s.id,'Bench Press');
    a.store.editDraft(e.id,0,{weight:'200',reps:'8'}); a.store.toggleDone(e.id,0);
    a.store.finish(s.id,{startedAt:now+2000,finishedAt:now+3000,notes:''});
    expect(a.store.summary(s.id).prs).toHaveLength(1);
    a.store.skipExercise(e.id); expect(a.store.summary(s.id).prs).toEqual([]); expect(a.store.milestones()).toEqual([]);
    const next = a.store.addExercise(a.store.start(undefined,now+4000).id,'Bench Press');
    expect(a.store.previous(next)[0].id).toBe(a.store.sets(first.id)[0].id);
  } finally { a.sqlite.close(); }
});
