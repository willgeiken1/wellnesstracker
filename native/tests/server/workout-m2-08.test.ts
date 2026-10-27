import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { WorkoutStore } from '../../src/data/workout/store';
import { OWNER_A, DEVICE_A } from '../../fixtures/sync';

for (const enabled of [false,true]) test(`history edits and local mode survive SQLite reload (v1 ${enabled})`, async () => {
  const db = await localDatabase(':memory:',{syncedV1Columns:enabled});
  const repo = new Repository(db.db,OWNER_A,DEVICE_A,randomUUID,{syncedV1Columns:enabled});
  try {
    let store = new WorkoutStore(repo);
    const session = store.startPast('2026-10-01');
    const entry = store.addExercise(session.id,'Bench Press',1);
    store.editDraft(entry.id,0,{weight:'100',reps:'8'});
    store.toggleDone(entry.id,0);
    store = new WorkoutStore(repo);
    expect(store.active()).toBeUndefined();
    expect(store.startPast('2026-10-01').id).toBe(session.id);
    expect(store.timer()).toBeFalsy();
    const input = {startedAt:Number(session.data.started_at),finishedAt:Number(session.data.started_at)+60001,notes:''};
    store.finish(session.id,input);
    store = new WorkoutStore(repo);
    expect(store.edited(session.id)).toBe(false);
    store.finish(session.id,input);
    expect(store.edited(session.id)).toBe(false);
    store.editDraft(entry.id,0,{tag:'warmup'});
    store = new WorkoutStore(repo);
    expect(store.edited(session.id)).toBe(true);
    expect(Object.values(store.weekly(new Date(input.startedAt))).every(n=>n===0)).toBe(true);
    store.removeSet(entry.id,0);
    expect(store.summary(session.id).count).toBe(0);
    expect(store.milestones()).toHaveLength(0);
  } finally {db.sqlite.close();}
});

test('past-day rows pull as finished on a second device, including abandoned drafts', async () => {
  const first = await localDatabase();
  const second = await localDatabase();
  const source = new Repository(first.db,OWNER_A,DEVICE_A,randomUUID);
  const target = new Repository(second.db,OWNER_A,randomUUID(),randomUUID);
  try {
    const store = new WorkoutStore(source);
    const session = store.startPast('2026-10-01');
    // Nothing was saved in the finish sheet: simulate abandoning the draft.
    const pending = source.pending().filter(item => item.row.table === 'sessions');
    expect(pending).toHaveLength(1);
    expect(pending[0].row.data.finished_at).toBe(session.data.started_at);
    expect(pending[0].row.data.duration_ms).toBe(0);
    target.applyPage('sessions',pending.map(({row},i)=>({row,server_seq:String(i+1)})),String(pending.length));
    const remote = new WorkoutStore(target);
    expect(target.localGet(`pastWorkout:${session.id}`)).toBeUndefined();
    expect(remote.active()).toBeUndefined();
    expect(remote.pastMode(session.id)).toBe(true);
    const pulled = target.get('sessions',session.id)!;
    // Finish uses the synced bounds, never an elapsed wall clock from the past day.
    remote.finish(session.id,{startedAt:Number(pulled.data.started_at),finishedAt:Number(pulled.data.finished_at),notes:''});
    expect(target.get('sessions',session.id)?.data.duration_ms).toBe(0);
    const live = remote.start();
    expect(live.id).not.toBe(session.id);
    const entry = remote.addExercise(session.id,'Squat',1);
    remote.editDraft(entry.id,0,{weight:'100',reps:'8'});
    remote.toggleDone(entry.id,0);
    expect(remote.timer()).toBeFalsy();
    expect(remote.active()?.id).toBe(live.id);
  } finally { first.sqlite.close(); second.sqlite.close(); }
});
