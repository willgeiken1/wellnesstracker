import { randomUUID } from 'node:crypto';
import { Repository } from '../../src/data/repository';
import { OWNER_A, OWNER_B, DEVICE_A } from '../../fixtures/sync';
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
test.each(['lb', 'kg'] as const)('barbell suggestion uses equipment default step (+5 lb / +2.5 kg) when no step is saved (%s)', async unit => {
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
    expect(store.suggestion(next).weight).toBe(unit === 'lb' ? 105 : 102.5);
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

test.each([false, true])('unit changes convert both unilateral drafts and preserve completed side kg (%s)', async enabled => {
  const { db, sqlite } = await localDatabase(':memory:', { syncedV1Columns: enabled });
  const repo = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: enabled });
  try {
    const store = new WorkoutStore(repo), p = store.preferences();
    p.saveMachine('Dumbbell Row', { text: 'Seat 2', unit_override: 'kg' });
    const e = store.addExercise(store.start().id, 'Dumbbell Row');
    store.setUnilateral(e.id, true);
    store.editDraft(e.id, 0, { weight: '50', reps: '8', rightWeight: '40', rightReps: '6', tag: 'drop' });
    store.toggleDone(e.id, 0);
    expect(store.sets(e.id)[0].data).toMatchObject({ left_weight_kg: 50, right_weight_kg: 40, entered_unit: 'kg' });
    store.editDraft(e.id, 1, { weight: '50', reps: '8', rightWeight: '40', rightReps: '6' });
    repo.localSave(`input:${e.id}:1:right:weight`, '41');
    p.saveMachine('Dumbbell Row', { text: 'Seat 2', unit_override: 'lb' });
    expect(store.drafts(e.id)[1]).toMatchObject({ weight: '110', rightWeight: '88', rightReps: '6' });
    expect(repo.localGet(`input:${e.id}:1:right:weight`)).toBeNull();
    store.editDraft(e.id, 0, { tag: 'warmup', rightReps: '7' });
    expect(store.sets(e.id)[0].data).toMatchObject({ left_weight_kg: 50, right_weight_kg: 40, right_reps: 7, entered_unit: 'kg' });
    expect(store.working(e)[0].warmup).toBe(true);
  } finally { sqlite.close(); }
});


test('OFF preferences promote through repository writes on ON reads, survive restart and do not repeat', async () => {
  const { db, sqlite } = await localDatabase();
  const off = new Repository(db, OWNER_A, DEVICE_A, randomUUID);
  const custom = { name: 'Fixture promotion lift', main: 'quads', helpers: ['glutes'], equipment: 'barbell' as const };
  try {
    const legacy = new WorkoutPreferences(off);
    legacy.saveMachine(custom.name, { text: 'Seat 3', step: 7, bar_weight: 15, unit_override: 'kg' });
    legacy.savePlates('kg', [20, 2.5]);
    legacy.savePlates('lb', []);
    legacy.saveCustom(custom);
    const enabled = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: true });
    const p = new WorkoutPreferences(enabled);
    expect(p.library()).toContainEqual(custom);
    expect(p.machine(custom.name)).toEqual({ text: 'Seat 3', step: 7, bar_weight: 15, unit_override: 'kg' });
    expect(p.plateSet('kg')).toEqual([20, 2.5]);
    expect(p.plateSet('lb')).toEqual([]);
    expect(enabled.pending().map(x => x.row.table).sort()).toEqual(['custom_exercises', 'machine_notes', 'settings']);
    expect(enabled.list('machine_notes')[0].data).toMatchObject({ step: 7, bar_weight: 15, unit_override: 'kg' });
    expect(JSON.parse(String(enabled.list('settings')[0].data.plate_set))).toEqual({ kg: [20, 2.5], lb: [] });
    p.saveMachine(custom.name, { ...p.machine(custom.name), step: 9 });
    p.savePlates('kg', [10]);
    const restarted = new WorkoutPreferences(new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: true }));
    expect(restarted.machine(custom.name).step).toBe(9);
    expect(restarted.plateSet('kg')).toEqual([10]);
    expect(restarted.library().filter(e => e.name === custom.name)).toEqual([custom]);
    expect(() => restarted.saveCustom(custom)).toThrow('Duplicate exercise.');
    expect(enabled.list('machine_notes')).toHaveLength(1);
    expect(enabled.list('settings')).toHaveLength(1);
    expect(enabled.list('custom_exercises')).toHaveLength(1);
    const other = new WorkoutPreferences(new Repository(db, OWNER_B, DEVICE_A, randomUUID, { syncedV1Columns: true }));
    expect(other.customs()).toEqual([]);
    expect(other.machine(custom.name)).toEqual({ text: '' });
    // A later OFF period writes new local values that must be promoted again.
    legacy.saveMachine(custom.name, { text: 'Seat 4', step: 11 });
    legacy.savePlates('kg', [5]);
    expect(restarted.machine(custom.name)).toEqual({ text: 'Seat 4', step: 11 });
    expect(restarted.plateSet('kg')).toEqual([5]);
  } finally { sqlite.close(); }
});

test('ON promotion keeps existing custom rows and consumes legacy duplicates once', async () => {
  const { db, sqlite } = await localDatabase();
  const off = new WorkoutPreferences(new Repository(db, OWNER_A, DEVICE_A, randomUUID));
  const enabled = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: true });
  try {
    off.saveCustom({ name: 'Fixture lift', main: 'quads', helpers: [], equipment: 'machine' });
    const row = enabled.save('custom_exercises', { name: 'fixture LIFT', main_muscle: 'glutes', helpers: '[]', equipment: 'cable' });
    const p = new WorkoutPreferences(enabled);
    expect(p.customs()).toEqual([{ name: 'fixture LIFT', main: 'glutes', helpers: [], equipment: 'cable' }]);
    enabled.remove('custom_exercises', row.id);
    expect(new WorkoutPreferences(enabled).customs()).toEqual([]);
    expect(enabled.list('custom_exercises', true)).toHaveLength(1);
  } finally { sqlite.close(); }
});


test('ON plate save promotes the other local unit and preserves existing settings', async () => {
  const { db, sqlite } = await localDatabase();
  const off = new WorkoutPreferences(new Repository(db, OWNER_A, DEVICE_A, randomUUID));
  const on = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: true });
  try {
    off.savePlates('kg', [20]);
    const settings = on.save('settings', { plate_set: JSON.stringify({ lb: [45] }), rest_style: 'countdown' });
    const p = new WorkoutPreferences(on);
    p.savePlates('lb', [25]);
    expect(p.plateSet('kg')).toEqual([20]);
    expect(p.plateSet('lb')).toEqual([25]);
    expect(on.list('settings')).toHaveLength(1);
    expect(on.get('settings', settings.id)?.data.rest_style).toBe('countdown');
  } finally { sqlite.close(); }
});

test.each(['machine', 'plates', 'customs'] as const)('%s promotion rolls back row, outbox and consumption together on failure, then retries', async kind => {
  const { db, sqlite } = await localDatabase();
  const off = new WorkoutPreferences(new Repository(db, OWNER_A, DEVICE_A, randomUUID));
  const on = new Repository(db, OWNER_A, DEVICE_A, randomUUID, { syncedV1Columns: true });
  const p = new WorkoutPreferences(on);
  try {
    off.saveMachine('Fixture lift', { text: 'Seat 3', step: 7 });
    off.savePlates('kg', [20]);
    off.saveCustom({ name: 'Fixture lift', main: 'quads', helpers: [], equipment: 'machine' });
    const key = kind === 'machine' ? 'machineSetup:fixture lift' : kind === 'plates' ? 'gymPlates' : 'customLifts';
    const table = kind === 'machine' ? 'machine_notes' : kind === 'plates' ? 'settings' : 'custom_exercises';
    const before = on.list(table), pending = on.pending(), local = on.localGet(key);
    const read = () => kind === 'machine' ? p.machine('Fixture lift') : kind === 'plates' ? p.plateSet('kg') : p.customs();
    sqlite.exec(`CREATE TRIGGER deny_promotion BEFORE UPDATE ON workout_local WHEN OLD.key='${key}' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`);
    expect(read).toThrow('Local data is unavailable.');
    expect(on.list(table)).toEqual(before);
    expect(on.pending()).toEqual(pending);
    expect(on.localGet(key)).toEqual(local);
    sqlite.exec('DROP TRIGGER deny_promotion');
    expect(read).not.toThrow();
    expect(on.localGet(key)).toBeNull();
    expect(on.list(table)).toHaveLength(1);
    expect(on.pending().some(item => item.row.table === table)).toBe(true);
  } finally { sqlite.close(); }
});
