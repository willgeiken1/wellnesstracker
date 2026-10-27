import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { WorkoutStore } from '../../src/data/workout/store';
import { OWNER_A, DEVICE_A } from '../../fixtures/sync';
async function setup(enabled = false) {
  const db = await localDatabase(':memory:', {syncedV1Columns: enabled});
  const repo = new Repository(db.db, OWNER_A, DEVICE_A, randomUUID, {syncedV1Columns: enabled});
  return {...db, repo, store: new WorkoutStore(repo)};
}
function log(store: WorkoutStore, entryId: string, index: number, reps = 10, warmup = false) {
  store.editDraft(entryId, index, {weight:'100', reps:String(reps), tag:warmup ? 'warmup' : null});
  store.toggleDone(entryId,index,1000);
}
for (const enabled of [false,true]) for (const mode of ['swap','replace'] as const) {
  test(`${mode} without completed sets clears the inherited range and preserves the group (v1 ${enabled})`, async () => {
    const a = await setup(enabled);
    try {
      const routine = a.store.saveTemplate('Synthetic pair',['Bench Press','Dumbbell Row'].map(exercise => ({exercise,target_sets:2,target_reps:8,rep_min:8,rep_max:10,superset_group:'pair'})));
      const session = a.store.start(routine.id), [original,partner] = a.store.entries(session.id);
      expect(a.store.repRange(original)).toEqual({min:8,max:10});
      const replacement = a.store.replaceExercise(original.id,'Romanian Deadlift',mode);
      const reloaded = new WorkoutStore(a.repo);
      expect(replacement.id).toBe(original.id);
      expect(replacement.data.exercise).toBe('Romanian Deadlift');
      expect(reloaded.repRange(replacement)).toBeNull();
      expect(reloaded.supersetGroup(replacement)).toBe('pair');
      expect(reloaded.supersetGroup(partner)).toBe('pair');
      expect(reloaded.loggerOrder(session.id)).toEqual([
        {entryId:replacement.id,index:0},{entryId:partner.id,index:0},
        {entryId:replacement.id,index:1},{entryId:partner.id,index:1}
      ]);
    } finally {a.sqlite.close();}
  });
  test(`${mode} with completed sets transfers the group to the replacement and unlinks the stub (v1 ${enabled})`, async () => {
    const a = await setup(enabled);
    try {
      const routine = a.store.saveTemplate('Synthetic pair',['Bench Press','Dumbbell Row'].map(exercise => ({exercise,target_sets:3,target_reps:8,rep_min:8,rep_max:10,superset_group:'pair'})));
      const session = a.store.start(routine.id), [original,partner] = a.store.entries(session.id);
      log(a.store,original.id,0);
      const savedSet = a.store.sets(original.id)[0].id;
      const replacement = a.store.replaceExercise(original.id,'Romanian Deadlift',mode);
      const reloaded = new WorkoutStore(a.repo), stub = a.repo.get('entries',original.id)!;
      expect(replacement.id).not.toBe(original.id);
      expect(stub.data.exercise).toBe('Bench Press');
      expect(reloaded.sets(stub.id).map(s => s.id)).toEqual([savedSet]);
      expect(reloaded.supersetGroup(stub)).toBeNull();
      expect(reloaded.supersetGroup(replacement)).toBe('pair');
      expect(reloaded.supersetGroup(partner)).toBe('pair');
      expect(reloaded.repRange(replacement)).toBeNull();
      expect(reloaded.loggerOrder(session.id)).toEqual([
        {entryId:stub.id,index:0},
        {entryId:replacement.id,index:0},{entryId:partner.id,index:0},
        {entryId:replacement.id,index:1},{entryId:partner.id,index:1},
        {entryId:partner.id,index:2}
      ]);
    } finally {a.sqlite.close();}
  });
}
test.each([false,true])('custom machine Step feeds range progression (v1 %s)', async enabled => {
  const a = await setup(enabled), now = Date.now()-10000;
  try {
    a.store.preferences().saveMachine('Leg Extension',{text:'Synthetic setup',step:2});
    const routine = a.store.saveTemplate('Synthetic progression',[{exercise:'Leg Extension',target_sets:2,target_reps:8,rep_min:8,rep_max:10}]);
    const old = a.store.start(routine.id,now), entry = a.store.entries(old.id)[0];
    log(a.store,entry.id,0); log(a.store,entry.id,1);
    a.store.finish(old.id,{startedAt:now,finishedAt:now+1000,notes:''});
    const session = a.store.start(routine.id,now+2000), next = a.store.entries(session.id)[0];
    expect(a.store.suggestion(next)).toMatchObject({weight:102,jump:true,target:8});
  } finally {a.sqlite.close();}
});
test.each([{counts:[2,1]}, {counts:[2,1,3]}])('round order and longest rest for unequal sets $counts', async ({counts}) => {
  const a = await setup();
  try {
    const session = a.store.start();
    const entries = counts.map((count,i) => a.store.addExercise(session.id, ['Bench Press','Dumbbell Row','Squat'][i],count));
    entries.forEach((e,i) => a.store.setRest(String(e.data.exercise), {seconds:90+i*30,style:'unwind'}));
    a.store.linkSuperset(entries.map(e => e.id));
    const expected = Array.from({length:Math.max(...counts)}, (_,round) => entries.filter((e,i) => counts[i]>round).map(e => ({entryId:e.id,index:round}))).flat();
    expect(a.store.loggerOrder(session.id)).toEqual(expected);
    expected.forEach((slot,i) => {
      expect(a.store.nextSet(session.id)).toEqual(slot);
      log(a.store,slot.entryId,slot.index);
      const endRound = expected[i+1]?.index !== slot.index;
      expect(a.store.timer()?.duration ?? null).toBe(endRound ? 90+(entries.length-1)*30 : null);
    });
    expect(a.store.nextSet(session.id)).toBeUndefined();
  } finally {a.sqlite.close();}
});
test('skip drops out, unlink and invalid groups', async () => {
  const a = await setup();
  try {
    const session = a.store.start(), entries = ['Bench Press','Dumbbell Row','Squat'].map(n => a.store.addExercise(session.id,n,2));
    a.store.linkSuperset(entries.map(e => e.id)); a.store.skipExercise(entries[1].id);
    expect(a.store.loggerOrder(session.id).map(s => s.entryId)).toEqual([entries[0].id,entries[2].id,entries[0].id,entries[2].id]);
    log(a.store,entries[0].id,0); expect(a.store.timer()).toBeNull();
    log(a.store,entries[2].id,0); expect(a.store.timer()?.duration).toBe(90);
    a.store.unlinkSuperset(entries[0].id); expect(entries.map(e => a.store.supersetGroup(e))).toEqual([null,null,null]);
    expect(() => a.store.linkSuperset([entries[0].id])).toThrow();
    expect(() => a.store.linkSuperset([entries[0].id,entries[0].id])).toThrow();
  } finally {a.sqlite.close();}
});
test.each([false,true])('template and live groups local persistence and wire round trip v1 %s', async enabled => {
  const a = await setup(enabled), b = await setup(enabled);
  try {
    const r = a.store.saveTemplate('Synthetic superset', ['Bench Press','Dumbbell Row'].map(exercise => ({exercise,target_sets:2,target_reps:8,rep_min:8,rep_max:10,superset_group:'pair'})));
    expect(new WorkoutStore(a.repo).templateExercises(r.id)[0].data).toMatchObject({rep_min:8,rep_max:10,superset_group:'pair'});
    const s = a.store.start(r.id), entries = a.store.entries(s.id);
    expect(a.store.supersetGroup(entries[0])).toBe('pair'); expect(a.store.repRange(entries[0])).toEqual({min:8,max:10});
    for (const table of ['routines','routine_exercises','sessions','entries'] as const) b.repo.applyPage(table,a.repo.list(table).map((row,i) => ({row,server_seq:String(i+1)})),'100');
    expect(b.store.templateExercises(r.id)[0].data.rep_min ?? null).toBe(enabled ? 8 : null);
    expect(b.store.supersetGroup(b.store.entries(s.id)[0])).toBe(enabled ? 'pair' : null);
    if (!enabled) expect(a.repo.list('routine_exercises')[0].data.rep_min).toBeNull();
    a.store.saveTemplate('Synthetic superset',a.store.templateExercises(r.id).map(e => ({id:e.id,exercise:String(e.data.exercise),target_sets:2,target_reps:8,rep_min:null,rep_max:null,superset_group:null})),r.id);
    expect(a.store.templateExercises(r.id)[0].data.rep_min).toBeNull();
  } finally {a.sqlite.close();b.sqlite.close();}
});
test('OFF ignores dormant wire values', async () => {
  const a = await setup(true), b = await setup(true);
  try {
    const r = a.store.saveTemplate('Synthetic', ['Bench Press','Squat'].map(exercise => ({exercise,target_sets:2,target_reps:8,rep_min:8,rep_max:10,superset_group:'dormant'})));
    for (const table of ['routines','routine_exercises'] as const) b.repo.applyPage(table,a.repo.list(table).map((row,i) => ({row,server_seq:String(i+1)})),'100');
    const off = new WorkoutStore(new Repository(b.db,OWNER_A,DEVICE_A,randomUUID,{syncedV1Columns:false}));
    const s = off.start(r.id), e = off.entries(s.id)[0];
    expect(off.repRange(e)).toBeNull(); expect(off.supersetGroup(e)).toBeNull();
  } finally {a.sqlite.close();b.sqlite.close();}
});
for (const unit of ['lb','kg'] as const) for (const enabled of [false,true]) {
  test.each([['top',[10,10],true,8],['miss',[10,9],false,10],['warmup',[1,10,10],true,8],['no range',[8,8],true,8],['only warmups',[1],false,8]] as const)(`${unit} v1 ${enabled}: %s`, async (kind,reps,jump,target) => {
    const a = await setup(enabled), now = Date.now()-10000;
    try {
      a.repo.save('profile',{weight_unit:unit});
      const routine = a.store.saveTemplate('Synthetic progression',[{exercise:'Bench Press',target_sets:reps.length,target_reps:8,...(kind==='no range' ? {} : {rep_min:8,rep_max:10})}]);
      const old = a.store.start(routine.id,now), entry = a.store.entries(old.id)[0];
      reps.forEach((r,i) => log(a.store,entry.id,i,r,(kind==='warmup' && i===0)||kind==='only warmups'));
      a.store.finish(old.id,{startedAt:now,finishedAt:now+1000,notes:''});
      const s = a.store.start(routine.id,now+2000), next = a.store.entries(s.id)[0], hint = a.store.suggestion(next);
      expect(hint).toMatchObject({weight:kind==='only warmups' ? null : jump ? unit==='lb' ? 105 : 102.5 : 100,jump,target});
    } finally {a.sqlite.close();}
  });
}
test.each([[8,null],[null,10],[10,8],[0,10],[8,101],[8.5,10]])('reject invalid range %s–%s before any writes',async (min,max) => {
  const a = await setup();
  try {
    expect(() => a.store.saveTemplate('Synthetic',[{exercise:'Bench Press',target_sets:2,target_reps:8,rep_min:min,rep_max:max}])).toThrow();
    expect(a.store.templates()).toHaveLength(0);
  } finally {a.sqlite.close();}
});
test.each([false,true])('synced template start and live unlink respect v1 %s',async enabled => {
  const a = await setup(enabled), b = await setup(enabled);
  try {
    const r = a.store.saveTemplate('Synthetic',['Bench Press','Squat'].map(exercise => ({exercise,target_sets:2,target_reps:8,rep_min:8,rep_max:10,superset_group:'pair'})));
    for (const table of ['routines','routine_exercises'] as const) b.repo.applyPage(table,a.repo.list(table).map((row,i) => ({row,server_seq:String(i+1)})),'100');
    const s = b.store.start(r.id), entries = b.store.entries(s.id);
    expect(b.store.repRange(entries[0])).toEqual(enabled ? {min:8,max:10} : null);
    expect(b.store.supersetGroup(entries[0])).toBe(enabled ? 'pair' : null);
    b.store.linkSuperset(entries.map(e => e.id));
    expect(b.store.supersetGroup(entries[0])).toBe(entries[0].id);
    b.store.unlinkSuperset(entries[0].id);
    expect(b.store.supersetGroup(entries[1])).toBeNull();
    expect(b.repo.get('entries',entries[0].id)?.data.superset_group).toBeNull();
  } finally {a.sqlite.close();b.sqlite.close();}
});
test('removing a partner clears a singleton; removing from three keeps the remaining pair',async () => {
  const a = await setup();
  try {
    const session = a.store.start(), entries = ['Bench Press','Squat','Dumbbell Row'].map(name => a.store.addExercise(session.id,name));
    a.store.linkSuperset(entries.map(e => e.id)); a.store.removeExercise(entries[2].id);
    expect(a.store.supersetGroup(entries[0])).toBeTruthy();
    a.store.removeExercise(entries[1].id); expect(a.store.supersetGroup(entries[0])).toBeNull();
  } finally {a.sqlite.close();}
});
test('skipping an unfinished partner closes the current round and uses remaining rest',async () => {
  const a = await setup();
  try {
    const session = a.store.start(), first = a.store.addExercise(session.id,'Bench Press',2), skipped = a.store.addExercise(session.id,'Squat',2);
    a.store.setRest('Squat',{seconds:180,style:'unwind'}); a.store.linkSuperset([first.id,skipped.id]);
    log(a.store,first.id,0); expect(a.store.timer()).toBeNull();
    a.store.skipExercise(skipped.id); expect(a.store.timer()?.duration).toBe(90);
    expect(a.store.nextSet(session.id)).toEqual({entryId:first.id,index:1});
  } finally {a.sqlite.close();}
});

test('OFF workout options survive ON reads and promote only after each table replay completes', async () => {
 const a=await setup();
 try {
  const routine=a.store.saveTemplate('Synthetic flip',['Bench Press','Squat'].map(exercise=>({exercise,target_sets:2,target_reps:8,rep_min:8,rep_max:10,superset_group:'pair'})));
  const session=a.store.start(routine.id), entry=a.store.entries(session.id)[0];
  a.repo.ack(a.repo.pending());
  const repo=new Repository(a.db,OWNER_A,DEVICE_A,randomUUID,{syncedV1Columns:true}), store=new WorkoutStore(repo);
  const exercise=a.repo.list('routine_exercises')[0];
  expect(store.templateExercises(routine.id)[0].data).toMatchObject({rep_min:8,rep_max:10,superset_group:'pair'});
  expect(store.supersetGroup(entry)).toBe('pair');
  expect(store.repRange(entry)).toEqual({min:8,max:10});
  expect(repo.pending()).toEqual([]);
  repo.applyPage('routine_exercises',[],'0',false);
  store.templateExercises(routine.id);
  expect(repo.pending()).toEqual([]);
  repo.applyPage('routine_exercises',[],'0',true);
  store.templateExercises(routine.id);
  expect(repo.get('routine_exercises',exercise.id)!.data).toMatchObject({rep_min:8,rep_max:10,superset_group:'pair'});
  expect(repo.get('entries',entry.id)!.data.superset_group).toBeNull();
  repo.applyPage('entries',[],'0',true);
  expect(store.supersetGroup(entry)).toBe('pair');
  expect(repo.pending().find(p=>p.row.id===entry.id)!.row.data.superset_group).toBe('pair');
  expect(repo.localGet(`exerciseOptions:entries:${entry.id}`)).toBeNull();
  repo.save('entries',{...repo.get('entries',entry.id)!.data,superset_group:'later'},entry.id);
  expect(new WorkoutStore(repo).supersetGroup(entry)).toBe('later');
  // Entry ranges have no wire columns; retain their exact session snapshot locally.
  expect(new WorkoutStore(repo).repRange(entry)).toEqual({min:8,max:10});
 } finally {a.sqlite.close();}
});
