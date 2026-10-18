import { randomUUID } from 'node:crypto';
import { Repository } from '../../src/data/repository';
import { WorkoutStore } from '../../src/data/workout/store';
import { localDatabase } from './sqlite';
import { DEVICE_A, OWNER_A } from '../../fixtures/sync';
async function setup() {
  const db = await localDatabase();
  const repo = new Repository(db.db, OWNER_A, DEVICE_A, randomUUID);
  return {
    ...db,
    repo,
    store: new WorkoutStore(repo)
  };
}
test('offline template start, drafts, synchronous done/outbox, restart and uncheck tombstone', async () => {
  const network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Disabled in offline fixture'));
  const {
    sqlite,
    db,
    repo,
    store
  } = await setup();
  const routine = store.saveTemplate('Push', [{
    exercise: 'Bench Press',
    target_sets: 2,
    target_reps: 8
  }]);
  const session = store.start(routine.id);
  const entry = store.entries(session.id)[0];
  expect(entry.data.exercise).toBe('Bench Press');
  expect(store.drafts(entry.id)).toHaveLength(2);
  store.editDraft(entry.id, 0, {
    weight: '185',
    reps: '8'
  });
  store.toggleDone(entry.id, 0);
  const again = new WorkoutStore(new Repository(db, OWNER_A, DEVICE_A, randomUUID));
  expect(again.active()?.id).toBe(session.id);
  expect(again.drafts(entry.id)[0]).toMatchObject({
    weight: '185',
    reps: '8'
  });
  expect(repo.pending().filter(p => p.row.table === 'sets')).toHaveLength(1);
  expect(again.timer()?.endAt).toBeGreaterThan(Date.now());
  again.toggleDone(entry.id, 0);
  expect(repo.pending().find(p => p.row.table === 'sets')?.row.deleted_at).not.toBeNull();
  expect(repo.list('sets')).toHaveLength(0);
  expect(again.timer()).toBeNull();
  expect(repo.pending().some(p => String(p.row.table) === 'workout_local')).toBe(false);
  expect(network).not.toHaveBeenCalled();
  network.mockRestore();
  sqlite.close();
});
test('empty start, previous matching sets, finish stats and attribution are local', async () => {
  const {
    store,
    repo,
    sqlite
  } = await setup();
  const s = store.start();
  const e = store.addExercise(s.id, 'Bench Press', 2);
  store.editDraft(e.id, 0, {
    weight: '100',
    reps: '8'
  });
  store.toggleDone(e.id, 0);
  store.finish(s.id, {
    startedAt: Date.now() - 60000,
    finishedAt: Date.now(),
    notes: 'Synthetic'
  });
  expect(store.summary(s.id).count).toBe(1);
  expect(store.weekly()).toMatchObject({
    chest: 1,
    triceps: .5,
    frontDelts: .5
  });
  const next = store.start();
  const n = store.addExercise(next.id, 'Bench Press', 2);
  expect(store.previous(n)[0].data.entered_value).toBe(100);
  store.editDraft(n.id, 0, {
    weight: '105',
    reps: '8'
  });
  store.toggleDone(n.id, 0);
  store.finish(next.id, {
    startedAt: Date.now() - 30000,
    finishedAt: Date.now(),
    notes: ''
  });
  expect(store.summary(next.id).prs).toHaveLength(1);
  expect(store.milestones()).toHaveLength(1);
  store.finish(next.id, {
    startedAt: Date.now() - 30000,
    finishedAt: Date.now(),
    notes: 'edit'
  });
  expect(store.milestones()).toHaveLength(1);
  expect(repo.pending().every(p => p.row.table !== 'settings')).toBe(true);
  sqlite.close();
});
test('one active workout, remove set/exercise tombstones, template Undo and reorder', async () => {
  const {
    store,
    repo,
    sqlite
  } = await setup();
  const s = store.start();
  expect(store.start().id).toBe(s.id);
  const a = store.addExercise(s.id, 'Bench Press', 2),
    b = store.addExercise(s.id, 'Squat', 1);
  store.moveEntry(b.id, -1);
  expect(store.entries(s.id)[0].id).toBe(b.id);
  store.editDraft(a.id, 0, {
    weight: '0',
    reps: '0'
  });
  store.toggleDone(a.id, 0);
  store.removeSet(a.id, 0);
  expect(repo.list('sets')).toHaveLength(0);
  store.removeExercise(a.id);
  expect(store.entries(s.id)).toHaveLength(1);
  const t = store.saveTemplate('Test', []);
  const undo = store.deleteTemplate(t.id);
  expect(repo.list('routines')).toHaveLength(0);
  undo();
  expect(repo.list('routines')).toHaveLength(1);
  sqlite.close();
});
test('owner scoped local state erased by both existing wipe paths', async () => {
  const {
    repo,
    db,
    sqlite
  } = await setup();
  repo.localSave('timer', {
    endAt: 123
  });
  const other = new Repository(db, 'demo', DEVICE_A, randomUUID);
  other.localSave('timer', {
    endAt: 456
  });
  repo.wipe();
  expect(repo.localGet('timer')).toBeUndefined();
  expect(other.localGet('timer')).toEqual({
    endAt: 456
  });
  sqlite.close();
});
test('atomic template start rolls back on a failed child write', async () => {
  const {
    store,
    repo,
    sqlite
  } = await setup();
  const r = store.saveTemplate('Push', [{
    exercise: 'Bench Press',
    target_sets: 2,
    target_reps: 8
  }]);
  const save = repo.save.bind(repo);
  jest.spyOn(repo, 'save').mockImplementation((table, ...args) => {
    if (table === 'entries') throw Error('injected');
    return save(table, ...args);
  });
  expect(() => store.start(r.id)).toThrow();
  expect(repo.list('sessions')).toHaveLength(0);
  sqlite.close();
});
test('kg canonical and entered unit survive conversion without history rewrite', async () => {
  const {
    repo,
    store,
    sqlite
  } = await setup();
  repo.save('profile', {
    weight_unit: 'kg'
  });
  const s = store.start(),
    e = store.addExercise(s.id, 'Squat', 1);
  store.editDraft(e.id, 0, {
    weight: '80',
    reps: '8'
  });
  store.toggleDone(e.id, 0);
  const before = store.sets(e.id)[0];
  expect(before.data).toMatchObject({
    weight_kg: 80,
    entered_value: 80,
    entered_unit: 'kg'
  });
  const profile = repo.list('profile')[0];
  repo.save('profile', {
    weight_unit: 'lb'
  }, profile.id);
  expect(store.sets(e.id)[0]).toEqual(before);
  expect(Number(store.drafts(e.id)[0].weight)).toBe(176.5);
  store.editDraft(e.id, 0, {
    reps: '9'
  });
  expect(store.sets(e.id)[0].data).toMatchObject({
    weight_kg: 80,
    entered_value: 80,
    entered_unit: 'kg',
    reps: 9
  });
  sqlite.close();
});
test('first-time card and rest preferences survive repository recreation; local aggregates stay out of outbox', async () => {
  const {
    repo,
    store,
    db,
    sqlite
  } = await setup();
  const s = store.start(undefined, Date.now() - 120000),
    e = store.addExercise(s.id, 'Bench Press', 1);
  store.editDraft(e.id, 0, {
    weight: '185',
    reps: '8'
  });
  store.toggleDone(e.id, 0);
  store.adjustTimer(15);
  store.finish(s.id, {
    startedAt: Date.now() - 120000,
    finishedAt: Date.now() - 60000,
    notes: ''
  });
  const next = store.start(),
    entry = store.addExercise(next.id, 'Bench Press', 1);
  expect(store.showCard(entry)).toBe(true);
  store.markCard(entry);
  const restarted = new WorkoutStore(new Repository(db, OWNER_A, DEVICE_A, randomUUID));
  expect(restarted.showCard(entry)).toBe(false);
  restarted.editDraft(entry.id, 0, {
    weight: '190',
    reps: '8'
  });
  restarted.toggleDone(entry.id, 0);
  expect(restarted.timer()?.duration).toBe(105);
  restarted.repo.localSave('milestones', []);
  restarted.repo.localSave('weekly', {});
  const physical = sqlite.prepare("SELECT DISTINCT table_name FROM sync_outbox").all().map(r => r.table_name);
  expect(physical.every(t => !String(t).startsWith('workout_'))).toBe(true);
  sqlite.close();
});
test('edit and removal recompute finished-week attribution and quiet tokens', async () => {
  const {
    store,
    sqlite
  } = await setup();
  const s = store.start(),
    e = store.addExercise(s.id, 'Bench Press', 1);
  store.editDraft(e.id, 0, {
    weight: '100',
    reps: '8'
  });
  store.toggleDone(e.id, 0);
  store.finish(s.id, {
    startedAt: Date.now() - 10000,
    finishedAt: Date.now(),
    notes: ''
  });
  expect(store.weekly().chest).toBe(1);
  store.removeSet(e.id, 0);
  expect(store.weekly().chest).toBeUndefined();
  sqlite.close();
});
test('all-owner wipe clears each local table and a rolled-back operation notifies no observer', async () => {
  const {
    repo,
    db,
    sqlite
  } = await setup();
  const {
    wipeAllOwners
  } = await import('../../src/data/repository');
  for (const key of ['timer', 'weekly', 'milestones']) repo.localSave(key, {
    synthetic: true
  });
  const listener = jest.fn();
  repo.subscribe(listener);
  expect(() => repo.atomic(() => {
    repo.localSave('draft:failed', []);
    repo.save('routines', {
      name: 'Synthetic'
    });
    throw Error('injected');
  })).toThrow();
  expect(listener).not.toHaveBeenCalled();
  expect(repo.localGet('draft:failed')).toBeUndefined();
  wipeAllOwners(db);
  for (const table of ['workout_local', 'workout_weekly', 'workout_milestones']) expect(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
  sqlite.close();
});
