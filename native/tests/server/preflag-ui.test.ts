import { randomUUID } from 'node:crypto';
import { Repository } from '../../src/data/repository';
import { WorkoutStore } from '../../src/data/workout/store';
import { PlanStore } from '../../src/features/plans/store';
import { WorkoutPreferences } from '../../src/features/workout/preferences';
import { OWNER_A, OWNER_B, DEVICE_A } from '../../fixtures/sync';
import { localDatabase } from './sqlite';

async function setup(enabled = false) {
  const local = await localDatabase(':memory:', {syncedV1Columns: enabled});
  const repo = new Repository(local.db, OWNER_A, DEVICE_A, randomUUID, {syncedV1Columns: enabled});
  return {...local, repo, store: new WorkoutStore(repo)};
}
function finish(store: WorkoutStore, id: string, start: number) {
  store.finish(id, {startedAt: start, finishedAt: start + 1000, notes: ''});
}
test('deferred local-only machine text stays visible without consuming the preference', async () => {
  const a = await setup(true);
  try {
    a.repo.localSave('machineSetup:fixture', {text: 'Synthetic seat 3', step: 7});
    expect(a.store.preferences().machine('Fixture')).toEqual({text: 'Synthetic seat 3', step: 7});
    expect(a.repo.localGet('machineSetup:fixture')).toMatchObject({text: 'Synthetic seat 3'});
    expect(a.repo.pending()).toEqual([]);
  } finally { a.sqlite.close(); }
});
test('library sweep resolves builtin and custom display casing', async () => {
  const a = await setup(true);
  try {
    a.repo.localSave('customLifts', [{name:'Fixture Custom', main:'quads', helpers:[], equipment:'machine'}]);
    for (const name of ['Bench Press', 'Fixture Custom']) a.repo.localSave(`machineSetup:${name.toLowerCase()}`, {text:'Synthetic seat', step:7});
    a.repo.applyPage('machine_notes', [], '0', true);
    a.store.preferences().library();
    expect(a.repo.list('machine_notes').map(r => r.data.exercise).sort()).toEqual(['Bench Press', 'Fixture Custom']);
  } finally { a.sqlite.close(); }
});
for (const enabled of [false, true]) {
  test(`unit override rewrites only active drafts and preserves historical edit units (${enabled})`, async () => {
    const a = await setup(enabled);
    try {
      const start = Date.now()-5000, old = a.store.start(undefined,start), historical = a.store.addExercise(old.id,'Bench Press',1);
      a.store.editDraft(historical.id,0,{weight:'100',reps:'8'}); a.store.toggleDone(historical.id,0);
      finish(a.store,old.id,start);
      const before = a.store.drafts(historical.id);
      a.repo.localSave(`input:${historical.id}:0:weight`, '100');
      const current = a.store.addExercise(a.store.start().id,'Bench Press',1);
      a.store.editDraft(current.id,0,{weight:'100',reps:'8'});
      a.store.preferences().saveMachine('Bench Press',{text:'',unit_override:'kg'});
      expect(a.store.drafts(current.id)[0].weight).toBe('45.25');
      expect(a.store.drafts(historical.id)).toEqual(before);
      expect(a.repo.localGet(`input:${historical.id}:0:weight`)).toBe('100');
      expect(a.store.unit(historical.id)).toBe('lb');
      a.store.editDraft(historical.id,0,{reps:'9'});
      expect(a.store.sets(historical.id)[0].data).toMatchObject({entered_unit:'lb',entered_value:100});
    } finally { a.sqlite.close(); }
  });
  test(`saved bar unit stays pinned across profile unit changes (${enabled})`, async () => {
    const a = await setup(enabled);
    try {
      const profile = a.repo.save('profile',{weight_unit:'lb'});
      a.store.preferences().saveMachine('Bench Press',{text:'',bar_weight:45},'lb');
      a.repo.save('profile',{weight_unit:'kg'},profile.id);
      const entry = a.store.addExercise(a.store.start().id,'Bench Press');
      expect(a.store.unit(entry.id)).toBe('lb');
      expect(new WorkoutPreferences(a.repo).machine('Bench Press')).toMatchObject({bar_weight:45,unit_override:'lb'});
    } finally { a.sqlite.close(); }
  });
  test(`split swap clears the new routine exercise range (${enabled})`, async () => {
    const a = await setup(enabled);
    try {
      const routine = a.store.saveTemplate('Synthetic ranges', [
        {exercise:'Bench Press',target_sets:2,target_reps:8,rep_min:8,rep_max:10},
        {exercise:'Squat',target_sets:2,target_reps:5,rep_min:5,rep_max:8}
      ]);
      const session = a.store.start(routine.id), original = a.store.entries(session.id)[0];
      a.store.editDraft(original.id,0,{weight:'100',reps:'8'}); a.store.toggleDone(original.id,0);
      const replacement = a.store.replaceExercise(original.id,'Squat','swap');
      expect(a.repo.localGet(`repRange:${replacement.id}`)).toBeNull();
      expect(new WorkoutStore(a.repo).repRange(replacement)).toBeNull();
    } finally { a.sqlite.close(); }
  });
}
test('summary PR units match each exercise; aggregate volume remains in the profile unit', async () => {
  const a = await setup();
  try {
    const priorStart = Date.now()-10000, prior = a.store.start(undefined,priorStart);
    for (const name of ['Bench Press','Squat']) {
      const entry = a.store.addExercise(prior.id,name,1);
      a.store.editDraft(entry.id,0,{weight:'50',reps:'8'}); a.store.toggleDone(entry.id,0);
    }
    finish(a.store,prior.id,priorStart);
    const start = Date.now()-5000, session = a.store.start(undefined,start);
    a.store.preferences().saveMachine('Bench Press',{text:'',unit_override:'kg'});
    const bench = a.store.addExercise(session.id,'Bench Press',1), squat = a.store.addExercise(session.id,'Squat',1);
    for (const [entry,weight] of [[bench,'100'],[squat,'100']] as const) {
      a.store.editDraft(entry.id,0,{weight,reps:'8'}); a.store.toggleDone(entry.id,0);
    }
    finish(a.store,session.id,start);
    const summary = a.store.summary(session.id);
    expect(summary.prs.map(p => ({exercise:p.exercise,unit:p.unit}))).toEqual([
      {exercise:'Bench Press',unit:'kg'}, {exercise:'Squat',unit:'lb'}
    ]);
    expect(summary.volume).toBeCloseTo(2563.6981, 1);
  } finally { a.sqlite.close(); }
});
test('incomplete Fixed forecast is empty after a cross-device mode change', async () => {
  const a = await setup(true);
  try {
    const plans = new PlanStore(a.repo), routine = a.store.saveTemplate('Synthetic routine',[]);
    plans.save({mode:'rotation',daysPerWeek:3,days:[{routineId:routine.id,weekdays:[]}]});
    const config = a.repo.list('plans')[0];
    a.repo.save('plans',{...config.data,mode:'fixed'},config.id);
    expect(plans.week('2026-10-26')).toEqual([]);
  } finally { a.sqlite.close(); }
});
test('saving one plan tombstones surplus owner rows and preserves other owners', async () => {
  const a = await setup(true);
  try {
    const plans = new PlanStore(a.repo), plan = {mode:'rotation' as const,daysPerWeek:3,days:[]};
    plans.save(plan); const current = a.repo.list('plans')[0];
    const surplus = a.repo.save('plans',{mode:'rotation',days_per_week:2});
    const other = new Repository(a.db,OWNER_B,DEVICE_A,randomUUID,{syncedV1Columns:true});
    const otherPlan = other.save('plans',{mode:'fixed',days_per_week:1});
    plans.save(plan);
    expect(a.repo.list('plans').map(r=>r.id)).toEqual([current.id]);
    expect(a.repo.get('plans',surplus.id)?.deleted_at).not.toBeNull();
    expect(other.list('plans').map(r=>r.id)).toEqual([otherPlan.id]);
  } finally { a.sqlite.close(); }
});

test.each([false,true])('finish keeps the last active display unit after further setup changes (%s)', async enabled => {
  const a = await setup(enabled);
  try {
    const start = Date.now()-5000, session = a.store.start(undefined,start), entry = a.store.addExercise(session.id,'Bench Press',2);
    a.store.editDraft(entry.id,0,{weight:'100',reps:'8'}); a.store.toggleDone(entry.id,0);
    a.store.preferences().saveMachine('Bench Press',{text:'',unit_override:'kg'});
    a.store.editDraft(entry.id,1,{weight:'50',reps:'8'});
    const before = a.store.drafts(entry.id);
    finish(a.store,session.id,start);
    a.store.preferences().saveMachine('Bench Press',{text:'',unit_override:'lb'});
    const reloaded = new WorkoutStore(a.repo);
    expect(reloaded.unit(entry.id)).toBe('kg');
    expect(reloaded.drafts(entry.id)).toEqual(before);
  } finally { a.sqlite.close(); }
});
