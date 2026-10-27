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
