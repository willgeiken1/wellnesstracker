import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { saveFood, deleteFood, undoFood, totals, meals, saveMeal, saveCombo, logCombo, favorites, toggleFavorite, saveReusable } from '../../src/features/food/model';
const day='2026-10-27';
const food={name:'Synthetic oats',energy_kj:418.4,protein_g:5,carbs_g:20,fat_g:2};
test('production SQLite CRUD, tombstone stripping, undo, retained identity and outbox revision',async()=>{
 const {db,sqlite,repo:base}=await localDatabase();const repo=new Repository(db,base.owner,base.device,randomUUID);
 const meal=meals(repo)[0];const row=saveFood(repo,day,meal.id,food,2,undefined,day);
 expect(repo.get('meals',meal.id)?.data.name).toBe('Breakfast');expect(row.data.energy_kj).toBeCloseTo(836.8);
 const data={...repo.get('food_entries',row.id)!.data},token=deleteFood(repo,row.id);
 expect(repo.list('food_entries')).toEqual([]);expect(repo.get('food_entries',row.id)?.data.name).toBeNull();
 expect(repo.pending().find(p=>p.row.id===row.id)?.row.deleted_at).not.toBeNull();
 expect(undoFood(repo,token)).toBe(true);expect(repo.get('food_entries',row.id)?.data).toEqual(data);
 expect(repo.pending().find(p=>p.row.id===row.id)?.row.deleted_at).toBeNull();expect(undoFood(repo,token)).toBe(false);
 const later=deleteFood(repo,row.id);repo.remove('food_entries',row.id);expect(undoFood(repo,later)).toBe(false);sqlite.close();
});
test('local favorites and combos are owner isolated, rename keeps meal references, reopen retains local collections',async()=>{
 const {db,sqlite,repo:base}=await localDatabase();const repo=new Repository(db,base.owner,base.device,randomUUID),other=new Repository(db,'synthetic-other',base.device,randomUUID);
 const meal=meals(repo)[0];saveFood(repo,day,meal.id,food,1,undefined,day);saveMeal(repo,'Morning',meal.id);
 expect(saveReusable(repo,food).data.name).toBe(food.name);toggleFavorite(repo,meal.id,food);const combo=saveCombo(repo,day,meal.id,'Synthetic combo');logCombo(repo,combo,day,meal.id,day);
 expect(repo.list('food_entries')).toHaveLength(2);expect(repo.list('food_entries').every(r=>r.data.meal_id===meal.id)).toBe(true);
 const reopened=new Repository(db,base.owner,base.device,randomUUID);expect(favorites(reopened,meal.id)).toHaveLength(1);expect(favorites(other,meal.id)).toEqual([]);
 expect(totals(repo.list('food_entries'))).toMatchObject({fiber_g:null,sugar_g:null,sodium_mg:null});
 expect(repo.syncFlags.syncedV1Columns).toBe(false);sqlite.close();
});
