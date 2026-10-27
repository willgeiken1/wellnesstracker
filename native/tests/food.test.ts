import { attributedDay, shiftDay, totals, saveFood, deleteFood, undoFood, recentFoods, toggleFavorite, favorites, saveCombo, logCombo, copyYesterday, foodTargets, setTargets, meals, saveMeal, resetFoodTargets } from '../src/features/food/model';
import { memoryRepository } from './workout-repository';
const day='2026-10-27';
const food={name:'Synthetic oats',energy_kj:418.4,protein_g:4,carbs_g:20,fat_g:2,fiber_g:null,sugar_g:null,sodium_mg:null,amount_g:100};
test.each([
 ['2026-10-27T05:00:00Z','America/Chicago','2026-10-26'],
 ['2026-10-27T08:59:59Z','America/Chicago','2026-10-26'],
 ['2026-10-27T09:00:00Z','America/Chicago',day],
 ['2026-01-01T08:01:00Z','America/Los_Angeles','2025-12-31'],
 ['2026-11-01T06:30:00Z','America/Chicago','2026-10-31'],
 ['2026-11-01T07:30:00Z','America/Chicago','2026-10-31'],
 ['2026-03-08T09:00:00Z','America/Chicago','2026-03-08'],
 ['2026-10-27T15:30:00Z','Asia/Tokyo',day],
])('attributes %s in %s to %s',(iso,tz,expected)=>expect(attributedDay(new Date(iso),tz)).toBe(expected));
test('one tap uses actual calendar day; leap and year boundaries',()=>{
 expect(attributedDay(new Date('2026-10-27T06:00:00Z'),'America/Chicago',true)).toBe(day);
 expect(shiftDay('2024-03-01',-1)).toBe('2024-02-29');expect(shiftDay('2026-01-01',-1)).toBe('2025-12-31');
});
test('totals leave unknown blank and sum known zeroes',()=>{
 const repo=memoryRepository();saveFood(repo,day,'meal',food,1,undefined,day);
 expect(totals(repo.list('food_entries'))).toMatchObject({energy_kj:418.4,fiber_g:null,sodium_mg:null});
 saveFood(repo,day,'meal',{...food,fiber_g:0,sodium_mg:12},2,undefined,day);
 expect(totals(repo.list('food_entries'))).toMatchObject({fiber_g:0,sodium_mg:24});expect(totals([]).protein_g).toBeNull();
});
test('portions preserve blanks, edit same row, reject future and invalid inputs',()=>{
 const repo=memoryRepository(),row=saveFood(repo,day,'meal',food,2,undefined,day);
 expect(row.data).toMatchObject({energy_kj:836.8,fiber_g:null,amount_g:200});
 saveFood(repo,day,'meal',food,1,row.id,day);expect(repo.list('food_entries')).toHaveLength(1);
 for(const bad of [0,-1,NaN,Infinity])expect(()=>saveFood(repo,day,'meal',food,bad,undefined,day)).toThrow();
 expect(()=>saveFood(repo,'2026-10-28','meal',food,1,undefined,day)).toThrow();
 expect(()=>saveFood(repo,'2026-02-30','meal',food,1,undefined,day)).toThrow();
 expect(()=>saveFood(repo,day,'meal',{...food,name:' '},1,undefined,day)).toThrow();
});
test('delete tombstone and undo restore original identity only while tombstone unchanged',()=>{
 const repo=memoryRepository(),row=saveFood(repo,day,'meal',food,1,undefined,day),data={...row.data},token=deleteFood(repo,row.id);
 expect(repo.get('food_entries',row.id)?.deleted_at).not.toBeNull();expect(totals(repo.list('food_entries')).energy_kj).toBeNull();
 expect(undoFood(repo,token)).toBe(true);expect(repo.get('food_entries',row.id)?.data).toEqual(data);expect(undoFood(repo,token)).toBe(false);
 const next=deleteFood(repo,row.id);repo.save('food_entries',{...data,name:'Changed'},row.id);expect(undoFood(repo,next)).toBe(false);
});
test('recent limits to 25 distinct foods, favorites top five per meal',()=>{
 const repo=memoryRepository();for(let i=0;i<30;i++)saveFood(repo,day,'meal',{...food,name:`Food ${i}`},1,undefined,day);
 expect(recentFoods(repo)).toHaveLength(25);for(const row of repo.list('food_entries').slice(0,7))toggleFavorite(repo,'meal',row.data);
 expect(favorites(repo,'meal')).toHaveLength(5);expect(favorites(repo,'other')).toHaveLength(0);
 toggleFavorite(repo,'meal',favorites(repo,'meal')[0]);expect(favorites(repo,'meal')).toHaveLength(5);
});
test('combos and copy yesterday create new identities and block future dates',()=>{
 const repo=memoryRepository();saveFood(repo,shiftDay(day,-1),'meal',food,1,undefined,day);
 copyYesterday(repo,day,'meal',day);expect(repo.list('food_entries')).toHaveLength(2);
 const combo=saveCombo(repo,day,'meal','Oats combo');logCombo(repo,combo,day,'other',day);
 expect(repo.list('food_entries')).toHaveLength(3);expect(new Set(repo.list('food_entries').map(r=>r.id)).size).toBe(3);
 expect(()=>logCombo(repo,combo,'2026-10-28','meal',day)).toThrow();
});
test('four persistent meals support rename and add',()=>{
 const repo=memoryRepository();expect(meals(repo)).toHaveLength(4);saveMeal(repo,'Morning',meals(repo)[0].id);saveMeal(repo,'Late snack');
 expect(meals(repo)).toHaveLength(5);expect(meals(repo)[0].name).toBe('Morning');
});
test('targets hydrate profile and weight; manual override wins; missing stats unset',()=>{
 const repo=memoryRepository();expect(foodTargets(repo,day).targets).toBeNull();
 repo.save('profile',{dob:'1990-01-01',height_m:1.75,weight_unit:'kg'});repo.localSave('profileExtras',{sex:'male',activity:'light'});repo.save('weigh_ins',{day,weight_kg:80,source:'app'});
 expect(foodTargets(repo,day).basis).toBe('estimated');expect(foodTargets(repo,day).targets!.energy_kj).toBeGreaterThan(0);
 const manual={energy_kj:8000,protein_g:100,carbs_g:200,fat_g:60};setTargets(repo,day,manual,day);
 expect(foodTargets(repo,day).targets).toEqual(manual);expect(foodTargets(repo,day).basis).toBe('manual');
 expect(()=>setTargets(repo,day,{...manual,protein_g:-1},day)).toThrow();
});
test('step activity estimate uses available steps, preserves manual profile choice without steps, manual targets win',()=>{
 const repo=memoryRepository();repo.save('profile',{dob:'1990-01-01',height_m:1.75,weight_unit:'kg'});repo.localSave('profileExtras',{sex:'male',activity:'light'});repo.save('weigh_ins',{day,weight_kg:80,source:'app'});
 const low=foodTargets(repo,day,1000),high=foodTargets(repo,day,14000);
 expect(low.activity).toBe('sitting');expect(high.activity).toBe('very');expect(high.targets!.energy_kj).toBeGreaterThan(low.targets!.energy_kj);
 expect(foodTargets(repo,day,NaN).activity).toBe('light');
 setTargets(repo,day,{energy_kj:8000,protein_g:100,carbs_g:200,fat_g:60},day);expect(foodTargets(repo,day,14000).targets!.energy_kj).toBe(8000);
});

test('return to automatic is dated and does not relabel old manual targets or invent missing stats',()=>{
 const repo=memoryRepository();setTargets(repo,'2026-10-26',{energy_kj:8000,protein_g:100,carbs_g:200,fat_g:60},day);
 resetFoodTargets(repo,day,day);expect(foodTargets(repo,day).targets).toBeNull();expect(foodTargets(repo,'2026-10-26').basis).toBe('manual');
 expect(foodTargets(repo,'2026-10-26').targets!.energy_kj).toBe(8000);
});
