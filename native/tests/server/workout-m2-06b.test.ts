import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { serverDatabase, testTransport } from './pglite';
import { Repository } from '../../src/data/repository';
import { WorkoutStore } from '../../src/data/workout/store';
import { DEFAULT_SYNC_FLAGS } from '../../src/data/sync/flags';
import { OWNER_A, DEVICE_A } from '../../fixtures/sync';

async function setup(enabled = false, device = DEVICE_A) {
  const local = await localDatabase(':memory:', {syncedV1Columns: enabled});
  const repo = new Repository(local.db, OWNER_A, device, randomUUID, {syncedV1Columns: enabled});
  return {...local, repo, store: new WorkoutStore(repo)};
}
const DEVICE_B = '20000000-0000-4000-8000-000000000002';
const definition = (exercise = 'Bench Press') => ({exercise, target_sets: 3, target_reps: 8});
function finish(store: WorkoutStore) {
  const s = store.active()!, now = Number(s.data.started_at);
  store.finish(s.id, {startedAt: now, finishedAt: now + 1000, notes: ''}, now + 1000);
}
for (const enabled of [false, true]) for (const completed of [false, true]) for (const mode of ['swap', 'replace'] as const) {
  test(`${mode} ${completed ? 'after' : 'before'} completed work changes routine only for Replace (flag ${enabled})`, async () => {
    const a = await setup(enabled);
    try {
      const routine = a.store.saveTemplate('Synthetic routine', [definition(), definition()]);
      const before = a.store.templateExercises(routine.id);
      const session = a.store.start(routine.id), entry = a.store.entries(session.id)[1];
      // Identity must survive reordering and duplicate names.
      a.store.moveEntry(entry.id, -1);
      if (completed) {
        a.store.editDraft(entry.id, 0, {weight:'100', reps:'8'}); a.store.toggleDone(entry.id, 0);
      }
      const replacement = a.store.replaceExercise(entry.id, 'Dumbbell Row', mode);
      expect(replacement.data.exercise).toBe('Dumbbell Row');
      const saved = new WorkoutStore(a.repo).templateExercises(routine.id);
      expect(saved.map(e => e.data.exercise)).toEqual(['Bench Press', mode === 'replace' ? 'Dumbbell Row' : 'Bench Press']);
      expect(saved.map(e => e.id)).toEqual(before.map(e => e.id));
      if (mode === 'swap') expect(saved).toEqual(before);
      finish(a.store);
      const next = a.store.start(routine.id);
      expect(a.store.entries(next.id).map(e => e.data.exercise)).toEqual(saved.map(e => e.data.exercise));
    } finally { a.sqlite.close(); }
  });
}
test.each([false,true])('session L/R becomes only its originating routine row default, flag %s', async enabled => {
  const a = await setup(enabled);
  try {
    const routine = a.store.saveTemplate('Synthetic routine', [definition(), definition()]);
    const first = a.store.start(routine.id), entries = a.store.entries(first.id);
    a.store.moveEntry(entries[1].id, -1);
    a.store.setUnilateral(entries[1].id, true);
    finish(a.store);
    const reloaded = new WorkoutStore(a.repo), next = reloaded.start(routine.id), rows = reloaded.entries(next.id);
    expect(rows.map(e => reloaded.isUnilateral(e.id))).toEqual([false,true]);
    reloaded.setUnilateral(rows[1].id, false);
    finish(reloaded);
    expect(reloaded.entries(reloaded.start(routine.id).id).map(e => reloaded.isUnilateral(e.id))).toEqual([false,false]);
    expect(reloaded.isUnilateral(entries[1].id)).toBe(true);
  } finally { a.sqlite.close(); }
});
test('synced rest style overrides receiving phone defaults and returns edited from second device; haptics stays local', async () => {
  const a = await setup(true), b = await setup(true, DEVICE_B), server = await serverDatabase();
  const transport = testTransport(server, OWNER_A, {syncedV1Columns:true});
  async function transfer(source: Repository, target: Repository) {
    const pending = source.pending();
    source.ack(pending, await transport.push(pending.map(p => p.row)));
    const page = await transport.pull('settings', target.cursor('settings'), 100);
    target.applyPage('settings', page, page.at(-1)!.server_seq);
  }
  try {
    expect(DEFAULT_SYNC_FLAGS.syncedV1Columns).toBe(false);
    a.store.toggleHaptics();
    b.repo.localSave('restStyle:bench press', 'unwind');
    a.store.setRest('Bench Press', {seconds:120, style:'converge'});
    await transfer(a.repo, b.repo);
    expect(b.store.rest('Bench Press')).toEqual({seconds:120,style:'converge'});
    expect(b.store.hapticsEnabled()).toBe(true);
    b.store.setRest('Bench Press', {seconds:150, style:'unwind'});
    await transfer(b.repo, a.repo);
    expect(new WorkoutStore(a.repo).rest('Bench Press')).toEqual({seconds:150,style:'unwind'});
    expect(a.store.hapticsEnabled()).toBe(false);
  } finally { a.sqlite.close(); b.sqlite.close(); await server.close(); }
});
test('rest reads numeric legacy values and rejects invalid structured fields', async () => {
  const a = await setup(true);
  try {
    a.repo.save('settings', {rest_style:'converge', rest_per_exercise:JSON.stringify({
      'bench press':120, 'dumbbell row':{seconds:150,style:'unwind'},
      'bad lift':{seconds:-1,style:'invalid'}
    })});
    expect(a.store.rest('Bench Press')).toEqual({seconds:120,style:'converge'});
    expect(a.store.rest('Dumbbell Row')).toEqual({seconds:150,style:'unwind'});
    expect(a.store.rest('Bad lift')).toEqual({seconds:90,style:'converge'});
  } finally { a.sqlite.close(); }
});
test.each([false,true])('custom Other saved Step drives the next-session suggestion, flag %s', async enabled => {
  const a = await setup(enabled);
  try {
    const name = 'Synthetic weighted Other';
    a.store.preferences().saveCustom({name, main:'quads', helpers:[], equipment:'other'});
    a.store.preferences().saveMachine(name, {text:'Synthetic setup', step:2.5});
    const e = a.store.addExercise(a.store.start().id, name);
    a.store.editDraft(e.id, 0, {weight:'100',reps:'8'}); a.store.toggleDone(e.id, 0);
    finish(a.store);
    const store = new WorkoutStore(a.repo), next = store.addExercise(store.start().id, name);
    expect(store.preferences().machine(name).step).toBe(2.5);
    expect(store.suggestion(next).weight).toBe(102.5);
  } finally { a.sqlite.close(); }
});

test.each([false,true])('swap L/R stays session-only; subsequent Replace owns the routine slot, flag %s', async enabled => {
  const a = await setup(enabled);
  try {
    const routine = a.store.saveTemplate('Synthetic routine', [definition()]);
    const entry = a.store.entries(a.store.start(routine.id).id)[0];
    a.store.setUnilateral(entry.id, true);
    const swapped = a.store.replaceExercise(entry.id, 'Dumbbell Row', 'swap');
    a.store.setUnilateral(swapped.id, false);
    finish(a.store);
    const next = a.store.entries(a.store.start(routine.id).id)[0];
    expect(a.store.isUnilateral(next.id)).toBe(true);
    a.store.replaceExercise(next.id, 'Dumbbell Row', 'swap');
    const replaced = a.store.replaceExercise(next.id, 'Romanian Deadlift', 'replace');
    a.store.setUnilateral(replaced.id, true);
    finish(a.store);
    const final = a.store.entries(a.store.start(routine.id).id)[0];
    expect(final.data.exercise).toBe('Romanian Deadlift');
    expect(a.store.isUnilateral(final.id)).toBe(true);
  } finally { a.sqlite.close(); }
});
