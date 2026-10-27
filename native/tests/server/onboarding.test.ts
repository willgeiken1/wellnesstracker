import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { seedDemo } from '../../fixtures/demo';
import { ageOn, defaultUnits, estimateTargets, saveProfile, finishOnboarding } from '../../src/features/onboarding/model';
import { promoteDemo } from '../../src/features/onboarding/demo-transfer';
const input = {name:'Synthetic',dob:'2000-10-27',unit:'kg' as const,height:'180',weight:'80',sex:'male' as const,activity:'light' as const};
test('calendar-valid DOB gate includes thirteenth birthday and rejects future/invalid dates',()=>{
 expect(ageOn('2013-10-27','2026-10-27')).toBe(13);
 expect(ageOn('2013-10-28','2026-10-27')).toBe(12);
 expect(ageOn('2012-02-30','2026-10-27')).toBeNull();
 expect(ageOn('2027-01-01','2026-10-27')).toBeNull();
});
test('region defaults and lightly active estimated targets require all body stats',()=>{
 expect(defaultUnits('en-US')).toBe('lb');expect(defaultUnits('en-GB')).toBe('kg');
 expect(estimateTargets({...input,weight:''},'2026-10-27')).toBeNull();
 expect(estimateTargets({...input,sex:''},'2026-10-27')).toBeNull();
 expect(estimateTargets(input,'2026-10-27')?.energy_kj).toBeGreaterThan(0);
});
test('under-13 completion writes absolutely no rows or local preferences',async()=>{
 const {repo,sqlite}=await localDatabase();
 expect(()=>finishOnboarding(repo,{...input,dob:'2020-01-01'},'empty',null,'2026-10-27')).toThrow();
 expect(repo.list('profile')).toEqual([]);expect(repo.list('routines')).toEqual([]);expect(repo.pending()).toEqual([]);expect(repo.localSnapshot()).toEqual({});sqlite.close();
});
test('profile uses canonical values; unit and activity edits never rewrite history',async()=>{
 const {repo,sqlite}=await localDatabase();
 saveProfile(repo,input,'2026-10-27');
 expect(repo.list('profile')[0].data.height_m).toBe(1.8);
 const history=repo.list('weigh_ins');expect(history[0].data.weight_kg).toBe(80);
 saveProfile(repo,{...input,unit:'lb',height:'70.86614173228347',weight:'',activity:'active'},'2026-10-27');
 expect(repo.list('weigh_ins')).toEqual(history);expect(repo.localGet('profileExtras')).toMatchObject({sex:'male',activity:'active'});sqlite.close();
});
test('no body stats leaves targets unset; completion is idempotent',async()=>{
 const {repo,sqlite}=await localDatabase();const empty={...input,height:'',weight:'',sex:'' as const};
 finishOnboarding(repo,empty,'fullBody',null,'2026-10-27');
 finishOnboarding(repo,empty,'fullBody',null,'2026-10-27');
 expect(repo.list('food_targets')).toHaveLength(0);expect(repo.list('routines')).toHaveLength(1);sqlite.close();
});
test('demo samples never enqueue; promotion retains user entries, repairs sample parent references and retries safely',async()=>{
 const {repo,db,sqlite}=await localDatabase();
 const demo=new Repository(db,'demo',repo.device,randomUUID);seedDemo(demo);
 const sample=demo.list('sessions')[0];
 const addedExercise=demo.save('routine_exercises',{routine_id:demo.list('routines')[0].id,exercise:'Squat',position:1});
 const entry=demo.save('entries',{session_id:sample.id,exercise:'Squat',position:0});
 const set=demo.save('sets',{entry_id:entry.id,reps:8,weight_kg:20,entered_value:20,entered_unit:'kg'});
 const food=demo.save('food_entries',{name:'Synthetic user food',day:'2026-10-27'});
 demo.localSave('customLifts',[{name:'Synthetic user exercise'}]);
 demo.localSave(`exerciseOptions:entries:${entry.id}`,{superset_group:'synthetic-pair'});
 expect(demo.pending()).toEqual([]);
 promoteDemo(demo,repo);promoteDemo(demo,repo);
 expect(repo.get('food_entries',food.id)?.data.name).toBe('Synthetic user food');
 expect(repo.get('sets',set.id)?.data.entry_id).toBe(entry.id);
 expect(repo.get('sessions',String(repo.get('entries',entry.id)?.data.session_id))).toBeDefined();
 expect(repo.pending().some(p=>p.row.id===sample.id||String(p.row.data.name).startsWith('Demo'))).toBe(false);
 expect(repo.get('routines',String(repo.get('routine_exercises',addedExercise.id)?.data.routine_id))).toBeDefined();
 expect(repo.localGet('customLifts')).toEqual([{name:'Synthetic user exercise'}]);
 expect(repo.localGet(`exerciseOptions:entries:${entry.id}`)).toMatchObject({superset_group:'synthetic-pair'});
 expect(demo.list('entries')).toEqual([]);sqlite.close();
});

test('sample identities survive edits; a user-created row with the same name is retained',async()=>{
 const {repo,db,sqlite}=await localDatabase();const demo=new Repository(db,'demo',repo.device,randomUUID);seedDemo(demo);
 const sample=demo.list('routines')[0];demo.save('routines',{name:'Edited sample',position:0},sample.id);
 const user=demo.save('routines',{name:'Demo full body',position:0});
 promoteDemo(demo,repo);
 expect(repo.get('routines',sample.id)).toBeUndefined();expect(repo.get('routines',user.id)).toBeDefined();sqlite.close();
});
test('legacy random-ID samples are recognized before edits and are never promoted',async()=>{
 const {repo,db,sqlite}=await localDatabase();const demo=new Repository(db,'demo',repo.device,randomUUID);
 const sample=demo.save('routines',{name:'Demo full body',position:0});
 demo.save('sessions',{name:'Demo workout',day:'2026-01-01',origin:'routine',finished_at:1767272400000});
 seedDemo(demo);demo.save('routines',{name:'Renamed sample',position:0},sample.id);
 const user=demo.save('routines',{name:'Synthetic user routine',position:1});
 promoteDemo(demo,repo);expect(repo.get('routines',sample.id)).toBeUndefined();expect(repo.get('routines',user.id)).toBeDefined();sqlite.close();
});
test('a failed promotion rolls back the destination and preserves all demo user rows',async()=>{
 const {repo,db,sqlite}=await localDatabase();const demo=new Repository(db,'demo',repo.device,randomUUID);seedDemo(demo);
 const a=demo.save('routines',{name:'Synthetic routine',position:1});demo.save('food_entries',{name:'Synthetic food',day:'2026-10-27'});
 const original=repo.save.bind(repo);jest.spyOn(repo,'save').mockImplementation((table,...args)=>{if(table==='food_entries')throw new Error('Synthetic write failure');return original(table,...args);});
 expect(()=>promoteDemo(demo,repo)).toThrow();expect(repo.pending()).toEqual([]);expect(repo.list('routines')).toEqual([]);expect(demo.get('routines',a.id)).toBeDefined();sqlite.close();
});
test('estimates match the shared PWA model with lightly active fallback and canonical energy',()=>{
 expect(estimateTargets(input,'2026-10-27')).toEqual({energy_kj:9832.4,protein_g:160,fat_g:65,carbs_g:281});
});

test('unidentifiable legacy samples fail closed without losing local user entries or enqueuing anything',async()=>{
 const {repo,db,sqlite}=await localDatabase();const demo=new Repository(db,'demo',repo.device,randomUUID);
 demo.save('routines',{name:'Renamed legacy sample',position:0});const user=demo.save('food_entries',{name:'Synthetic user food',day:'2026-10-27'});
 seedDemo(demo);expect(()=>promoteDemo(demo,repo)).toThrow();expect(repo.pending()).toEqual([]);expect(demo.get('food_entries',user.id)).toBeDefined();sqlite.close();
});

test('edited estimated targets persist as a manual override for the Food target UI',async()=>{
 const {repo,sqlite}=await localDatabase();
 finishOnboarding(repo,input,'empty',{energy_kj:2300*4.184,protein_g:150,carbs_g:250,fat_g:70},'2026-10-27');
 expect(repo.list('food_targets')[0].data.energy_kj).toBe(2300*4.184);
 expect(repo.localGet('targetBasis')).toBe('manual');sqlite.close();
});

test('a user set added to a sample exercise keeps a valid exercise/session without copying sample sets',async()=>{
 const {repo,db,sqlite}=await localDatabase();const demo=new Repository(db,'demo',repo.device,randomUUID);seedDemo(demo);
 const session=demo.list('sessions')[0];const entry=demo.save('entries',{session_id:session.id,exercise:'Squat',position:0});
 const sampleSet=demo.save('sets',{entry_id:entry.id,reps:8,weight_kg:20,entered_value:20,entered_unit:'kg'});
 demo.localSave('demoSamples',[...demo.localGet<string[]>('demoSamples')!,entry.id,sampleSet.id]);
 const user=demo.save('sets',{entry_id:entry.id,reps:10,weight_kg:25,entered_value:25,entered_unit:'kg'});
 promoteDemo(demo,repo);
 const saved=repo.get('sets',user.id)!;expect(saved.data.weight_kg).toBe(25);
 const parent=repo.get('entries',String(saved.data.entry_id))!;expect(parent).toBeDefined();
 expect(repo.get('sessions',String(parent.data.session_id))).toBeDefined();
 expect(repo.get('entries',entry.id)).toBeUndefined();expect(repo.get('sets',sampleSet.id)).toBeUndefined();sqlite.close();
});
