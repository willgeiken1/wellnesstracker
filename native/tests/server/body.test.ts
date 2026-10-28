import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { saveWeighIn, dailyWeights, deleteWeighIn } from '../../src/features/body/model';
import { fromKg } from '../../src/core/workout/rules';
import { readProfile, saveProfile } from '../../src/features/onboarding/model';
test('SQLite app weigh-ins retain canonical kg and entered units; profile unit edits do not rewrite history',async()=>{
 const {db,repo:fixture,sqlite}=await localDatabase();
 try {
  // Guest owner ensures this test never queues or attempts network work.
  const repo=new Repository(db,'guest',fixture.device,randomUUID);
  saveWeighIn(repo,80,'kg','2026-10-27');saveWeighIn(repo,fromKg(82,'lb'),'lb','2026-10-27');
  const before=repo.list('weigh_ins');expect(before).toHaveLength(2);
  expect(before.find(r=>r.data.entered_unit==='lb')!.data.weight_kg).toBeCloseTo(82,12);
  expect(dailyWeights(before)).toEqual([{day:'2026-10-27',kg:81,count:2}]);
  const profile={...readProfile(repo),dob:'2000-01-01',weight:'',unit:'kg' as const};
  saveProfile(repo,profile);saveProfile(repo,{...profile,unit:'lb'});saveProfile(repo,profile);
  expect(repo.list('weigh_ins')).toEqual(before);expect(repo.pending()).toEqual([]);
 } finally {sqlite.close();}
});

test('delete soft-deletes only the owned app weigh-in and queues its tombstone',async()=>{
 const {db,repo:fixture,sqlite}=await localDatabase();
 const repo=new Repository(db,fixture.owner,fixture.device,randomUUID);
 try {
  const first=saveWeighIn(repo,80,'kg','2026-10-27');
  const keep=saveWeighIn(repo,82,'kg','2026-10-27');
  const other=new Repository(db,'other-fixture-owner',repo.device,randomUUID);
  const foreign=saveWeighIn(other,90,'kg','2026-10-27');
  deleteWeighIn(repo,foreign.id);
  expect(other.list('weigh_ins')).toHaveLength(1);
  deleteWeighIn(repo,first.id);
  expect(repo.list('weigh_ins')).toEqual([keep]);
  expect(dailyWeights(repo.list('weigh_ins'))[0].kg).toBe(82);
  const tombstone=repo.get('weigh_ins',first.id)!;
  expect(tombstone.deleted_at).not.toBeNull();
  expect(tombstone.data).toMatchObject({weight_kg:null,entered_value:null,source:'app'});
  expect(repo.pending().find(p=>p.row.id===first.id)?.row).toEqual(tombstone);
 } finally {sqlite.close();}
});

test.each(['lb','kg'] as const)('demo transfer preserves %s preference and removes all demo rows',async unit=>{
 const {seedDemo}=await import('../../fixtures/demo');
 const {promoteDemo}=await import('../../src/features/onboarding/demo-transfer');
 const {syncedTables}=await import('../../src/data/rows');
 const {db,repo,sqlite}=await localDatabase();
 try {
  const demo=new Repository(db,'demo',repo.device,randomUUID);seedDemo(demo);
  demo.save('profile',{weight_unit:unit});
  const user=saveWeighIn(demo,unit==='lb'?180:80,unit,'2026-10-27');
  const samples=demo.localGet<string[]>('demoSamples')!;
  promoteDemo(demo,repo);
  expect(readProfile(repo).unit).toBe(unit);
  expect(repo.list('weigh_ins')).toHaveLength(1);
  expect(repo.get('weigh_ins',user.id)?.data.entered_unit).toBe(unit);
  for(const table of syncedTables){
   expect(demo.list(table,true)).toEqual([]);
   expect(repo.list(table,true).some(row=>samples.includes(row.id))).toBe(false);
  }
  expect(demo.localSnapshot()).toEqual({});expect(demo.pending()).toEqual([]);
 } finally {sqlite.close();}
});

test('existing lb account beats a newer kg demo profile and demo storage is fully erased',async()=>{
 const {seedDemo}=await import('../../fixtures/demo');
 const {promoteDemo}=await import('../../src/features/onboarding/demo-transfer');
 const {syncedTables}=await import('../../src/data/rows');
 const {db,repo,sqlite}=await localDatabase();
 try {
  const account=repo.save('profile',{weight_unit:'lb'});
  const demo=new Repository(db,'demo',repo.device,randomUUID);seedDemo(demo);
  const newer=demo.save('profile',{weight_unit:'kg'});
  expect(newer.updated_at).toBeGreaterThan(account.updated_at);
  saveWeighIn(demo,80,'kg','2026-10-27');
  promoteDemo(demo,repo);
  expect(readProfile(repo).unit).toBe('lb');
  for(const table of syncedTables)expect(demo.list(table,true)).toEqual([]);
  expect(demo.localSnapshot()).toEqual({});
 } finally {sqlite.close();}
});

test('delete refuses Health imports and deleted rows, and successfully deletes an lb entry',async()=>{
 const {db,repo:fixture,sqlite}=await localDatabase();
 const repo=new Repository(db,fixture.owner,fixture.device,randomUUID);
 try {
  const {syntheticRow}=await import('../../fixtures/sync');
  const health={...syntheticRow('weigh_ins'),data:{day:'2026-10-27',weight_kg:80,source:'healthkit'}};
  repo.putLocal(health);
  const before=repo.pending();
  expect(deleteWeighIn(repo,health.id)).toBe(false);
  expect(repo.get('weigh_ins',health.id)?.deleted_at).toBeNull();expect(repo.pending()).toEqual(before);
  const row=saveWeighIn(repo,180,'lb','2026-10-27');
  expect(deleteWeighIn(repo,row.id)).toBe(true);
  expect(repo.get('weigh_ins',row.id)?.deleted_at).not.toBeNull();
  const pending=repo.pending();
  expect(deleteWeighIn(repo,row.id)).toBe(false);expect(repo.pending()).toEqual(pending);
 } finally {sqlite.close();}
});

test.each([false,true])('promotion reports skipped user weigh-ins only when account has readings (%s)',async existing=>{
 const {seedDemo}=await import('../../fixtures/demo');
 const {promoteDemo}=await import('../../src/features/onboarding/demo-transfer');
 const {db,repo,sqlite}=await localDatabase();
 try {
  const demo=new Repository(db,'demo',repo.device,randomUUID);seedDemo(demo);
  if(existing)repo.save('weigh_ins',{day:'2026-10-27',weight_kg:70,source:'app'});
  const user=saveWeighIn(demo,80,'kg','2026-10-27');
  expect(promoteDemo(demo,repo)).toEqual({weighInsSkipped:existing});
  expect(!!repo.get('weigh_ins',user.id)).toBe(!existing);
  expect(demo.list('weigh_ins',true)).toEqual([]);
  expect(promoteDemo(demo,repo)).toEqual({weighInsSkipped:false});
 } finally {sqlite.close();}
});
