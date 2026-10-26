import { randomUUID } from 'node:crypto';
import { Repository } from '../../src/data/repository';
import { OWNER_A, DEVICE_A } from '../../fixtures/sync';
import { localDatabase } from './sqlite';
import { WorkoutStore } from '../../src/data/workout/store';
import { WorkoutPreferences } from '../../src/features/workout/preferences';

test.each([false, true])('M2-05 preferences persist with synced v1 %s', async enabled => {
  const { db, sqlite } = await localDatabase(':memory:', { syncedV1Columns: enabled });
  const repo = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: enabled });
  try {
    const p = new WorkoutPreferences(repo);
    p.saveMachine('Fixture lift', { text: 'Seat 5, pad 3, pin 4', step: 7, bar_weight: 15, unit_override: 'kg' });
    p.savePlates('kg', [20, 10, 2.5]);
    p.saveCustom({ name: 'Fixture lift', main: 'quads', helpers: ['glutes'], equipment: 'barbell' });
    const reload = new WorkoutPreferences(repo);
    expect(reload.machine('Fixture lift')).toMatchObject({ step: 7, bar_weight: 15, unit_override: 'kg', text: 'Seat 5, pad 3, pin 4' });
    expect(reload.plateSet('kg')).toEqual([20, 10, 2.5]);
    expect(reload.exercise('Fixture lift')).toMatchObject({ main: 'quads', helpers: ['glutes'], equipment: 'barbell' });
    expect(repo.list('machine_notes')[0].data.step).toBe(enabled ? 7 : null);
    expect(repo.list('settings')[0]?.data.plate_set ?? null).toBe(enabled ? JSON.stringify({ kg: [20, 10, 2.5] }) : null);
    expect(repo.list('custom_exercises')).toHaveLength(enabled ? 1 : 0);
    const store = new WorkoutStore(repo);
    const s = store.start();
    const e = store.addExercise(s.id, 'Fixture lift');
    expect(store.unit(e.id)).toBe('kg');
    store.editDraft(e.id, 0, { weight: '100', reps: '8' });
    store.toggleDone(e.id, 0);
    expect(store.sets(e.id)[0].data.weight_kg).toBe(100);
    store.finish(s.id, { startedAt: Number(s.data.started_at), finishedAt: Date.now(), notes: '' });
    expect(store.weekly()).toMatchObject({ quads: 1, glutes: .5 });
  } finally { sqlite.close(); }
});
test('OFF ignores dormant v1 values and retains legacy notes', async () => {
  const { repo, sqlite } = await localDatabase();
  try {
    const p = new WorkoutPreferences(repo);
    repo.save('machine_notes', { exercise: 'Fixture', text: 'Seat 2', step: 99, unit_override: 'kg' });
    expect(p.machine('Fixture')).toEqual({ text: 'Seat 2' });
    expect(new WorkoutStore(repo).unit()).toBe('lb');
  } finally { sqlite.close(); }
});

test.each([false, true])('unit switch preserves saved kg, converts unfinished drafts and uses saved Step (%s)', async enabled => {
  const { db, sqlite } = await localDatabase(':memory:', { syncedV1Columns: enabled });
  const repo = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: enabled });
  try {
    const store = new WorkoutStore(repo), p = store.preferences();
    p.saveMachine('Bench Press', { text: 'Seat 1', unit_override: 'kg', step: 7 });
    const s = store.start(undefined, Date.now() - 1000), e = store.addExercise(s.id, 'Bench Press');
    store.editDraft(e.id, 0, { weight: '100', reps: '8' });
    store.toggleDone(e.id, 0);
    store.editDraft(e.id, 1, { weight: '50', reps: '8' });
    p.saveMachine('Bench Press', { text: 'Seat 1', unit_override: 'lb', step: 12 });
    expect(store.sets(e.id)[0].data.weight_kg).toBe(100);
    expect(store.drafts(e.id)[0].weight).toBe('220.5');
    expect(store.drafts(e.id)[1].weight).toBe('110');
    store.editDraft(e.id, 0, { reps: '9' });
    expect(store.sets(e.id)[0].data.weight_kg).toBe(100);
    store.finish(s.id, { startedAt: Number(s.data.started_at), finishedAt: Date.now(), notes: '' });
    const next = store.start();
    const nextEntry = store.addExercise(next.id, 'Bench Press');
    expect(store.suggestion(nextEntry).weight).toBe(232.5);
  } finally { sqlite.close(); }
});
test('OFF reads no dormant v1 preferences from a previous ON run', async () => {
  const { db, sqlite } = await localDatabase(':memory:', { syncedV1Columns: true });
  const on = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: true });
  const off = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: false });
  try {
    const p = new WorkoutPreferences(on);
    p.saveMachine('Fixture', { text: 'Seat 2', step: 99, bar_weight: 12, unit_override: 'kg' });
    p.savePlates('lb', [10]);
    p.saveCustom({ name: 'Fixture', main: 'quads', helpers: [], equipment: 'machine' });
    const legacy = new WorkoutPreferences(off);
    expect(legacy.machine('Fixture')).toEqual({ text: 'Seat 2' });
    expect(legacy.plateSet('lb')).toEqual([45, 35, 25, 10, 5, 2.5]);
    expect(legacy.customs()).toEqual([]);
    legacy.saveMachine('Fixture', { text: 'Seat 3', step: 7 });
    expect(off.list('machine_notes')[0].data).toMatchObject({ text: 'Seat 3', step: null, bar_weight: null, unit_override: null });
  } finally { sqlite.close(); }
});
test.each(['lb', 'kg'] as const)('exercise setup defaults to +10 lb / +5 kg until explicitly set (%s)', async unit => {
  const { db, sqlite } = await localDatabase();
  const repo = new Repository(db, OWNER_A, DEVICE_A, randomUUID);
  try {
    repo.save('profile', { weight_unit: unit });
    const store = new WorkoutStore(repo), start = Date.now() - 1000;
    const first = store.start(undefined, start), entry = store.addExercise(first.id, 'Bench Press');
    store.editDraft(entry.id, 0, { weight: '100', reps: '8' });
    store.toggleDone(entry.id, 0);
    store.finish(first.id, { startedAt: start, finishedAt: Date.now(), notes: '' });
    const next = store.addExercise(store.start().id, 'Bench Press');
    expect(store.suggestion(next).weight).toBe(unit === 'lb' ? 110 : 105);
  } finally { sqlite.close(); }
});
test('decimal plate sizes are validated at two decimal places without floating-point rejection', async () => {
  const { repo, sqlite } = await localDatabase();
  try {
    const p = new WorkoutPreferences(repo);
    expect(() => p.savePlates('kg', [1.1, 1.25])).not.toThrow();
    expect(p.plateSet('kg')).toEqual([1.25, 1.1]);
    expect(() => p.savePlates('kg', [1.001])).toThrow();
  } finally { sqlite.close(); }
});
