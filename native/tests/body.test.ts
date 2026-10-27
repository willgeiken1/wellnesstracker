import { bodyGolden, bodyGoldenTrend } from '../fixtures/body';
import { dailyWeights, trendWeights, weeklyChange, inRange, saveWeighIn, lastWeight } from '../src/features/body/model';
import { fromKg, toKg } from '../src/core/workout/rules';
import { readProfile, saveProfile } from '../src/features/onboarding/model';
import { memoryRepository } from './workout-repository';
const rows = () => { const repo = memoryRepository();bodyGolden.forEach(p => saveWeighIn(repo, p.kg, 'kg', p.day));return repo.list('weigh_ins'); };
test('synthetic 10-day EWMA golden includes elapsed-day decay', () => {
 const trend = trendWeights(dailyWeights(rows()));
 expect(trend).toHaveLength(bodyGoldenTrend.length);
 trend.forEach((p,i) => expect(p.trendKg).toBeCloseTo(bodyGoldenTrend[i], 8));
 expect(trendWeights([])).toEqual([]);
});
test('same-day entries average once before smoothing, independent of input order', () => {
 const repo=memoryRepository();saveWeighIn(repo,80,'kg','2026-10-01');saveWeighIn(repo,84,'kg','2026-10-01');saveWeighIn(repo,80,'kg','2026-10-02');
 const daily=dailyWeights(repo.list('weigh_ins').reverse());expect(daily).toEqual([{day:'2026-10-01',kg:82,count:2},{day:'2026-10-02',kg:80,count:1}]);
 expect(trendWeights(daily)[1].trendKg).toBeCloseTo(81.6363636364);
 expect(repo.list('weigh_ins')).toHaveLength(3);expect(lastWeight(repo.list('weigh_ins'))).toBe(80);
});
test.each(['kg','lb'] as const)('%s round trips preserve canonical weight and profile changes never rewrite history', unit => {
 const repo=memoryRepository();saveWeighIn(repo,fromKg(80,unit),unit,'2026-10-01');
 expect(repo.list('weigh_ins')[0].data).toMatchObject({weight_kg:expect.closeTo(80,10),entered_unit:unit,entered_value:fromKg(80,unit),source:'app'});
 expect(toKg(fromKg(80,unit),unit)).toBeCloseTo(80,12);
 const before=JSON.stringify(repo.list('weigh_ins'));
 const profile={...readProfile(repo),dob:'2000-01-01',unit,weight:''};saveProfile(repo,profile);saveProfile(repo,{...profile,unit:unit==='kg'?'lb':'kg'});
 expect(JSON.stringify(repo.list('weigh_ins'))).toBe(before);
});
test('weekly change uses seven calendar days and needs a full week', () => {
 expect(weeklyChange([{day:'2026-03-01',kg:80,count:1,trendKg:80},{day:'2026-03-11',kg:79,count:1,trendKg:79}])).toBeCloseTo(-0.7);
 expect(weeklyChange(trendWeights(dailyWeights(rows())).slice(0,2))).toBeNull();
});
test.each([7,30,90,365] as const)('%i-day range includes today and preserves pre-range smoothing', range => {
 const points=trendWeights(dailyWeights(rows()));expect(inRange(points,range,'2026-10-11')).toEqual(points.filter(p=>p.day>=(range===7?'2026-10-05':'2025-10-12')));
 expect(inRange(points,7,'2026-10-11')[0].trendKg).toBeCloseTo(bodyGoldenTrend[3],8);
});
test('invalid, nonfinite and deleted readings do not poison averages; invalid saves write nothing', () => {
 const repo=memoryRepository();for(const n of [0,-1,NaN,Infinity])expect(()=>saveWeighIn(repo,n,'kg','2026-10-01')).toThrow();
 expect(()=>saveWeighIn(repo,80,'kg','2026-02-30')).toThrow();expect(repo.list('weigh_ins')).toHaveLength(0);
 const good=rows()[0];expect(dailyWeights([{...good,deleted_at:1},{...good,data:{...good.data,weight_kg:NaN}},{...good,data:{...good.data,day:'2026-02-30'}}])).toEqual([]);
});
test.each([7,30,90,365] as const)('%i-day boundaries include exactly N calendar days and exclude future points', range => {
 const day=(offset:number)=>new Date(Date.UTC(2026,9,27-offset)).toISOString().slice(0,10);
 const points=[range,range-1,0,-1].map(offset=>({day:day(offset),kg:80,count:1,trendKg:80}));
 expect(inRange(points,range,'2026-10-27').map(p=>p.day)).toEqual([day(range-1),day(0)]);
});
test('EWMA stays flat for a constant series and counts calendar days across DST',()=>{
 const points=[{day:'2026-03-07',kg:80,count:1},{day:'2026-03-09',kg:82,count:1}];
 expect(trendWeights(points)[1].trendKg).toBeCloseTo(80+2*(1-(9/11)**2),12);
 expect(trendWeights(points.map(p=>({...p,kg:80}))).map(p=>p.trendKg)).toEqual([80,80]);
});
