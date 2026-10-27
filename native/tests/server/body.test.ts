import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { saveWeighIn, dailyWeights } from '../../src/features/body/model';
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
