import type { Repository } from '../../data/repository';
import { compareRows, type Row, type Scalar } from '../../data/rows';
import { dayStamp } from '../body/model';
import { readProfile, estimateTargets, today, type Activity, type Targets } from '../onboarding/model';
import { t } from '../../i18n/en';
export const nutrients=['energy_kj','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg','amount_g'] as const;
export type Nutrient=typeof nutrients[number];
export type Food=Record<string,Scalar>;
export function shiftDay(day:string,offset:number) {return new Date(dayStamp(day)+offset*86400000).toISOString().slice(0,10);}
export function attributedDay(now=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,current=false) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=(type:string)=>parts.find(p=>p.type===type)!.value;
  const day=`${get('year')}-${get('month')}-${get('day')}`;
  return !current&&Number(get('hour'))<4?shiftDay(day,-1):day;
}
export function assertDay(day:string,now=today()) {if(!Number.isFinite(dayStamp(day))||day>now)throw new Error('Invalid food day.');}
export function totals(rows:Row[]) {
  return Object.fromEntries(nutrients.map(key=>{const values=rows.filter(r=>r.deleted_at===null).map(r=>r.data[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));return [key,values.length?values.reduce((a,b)=>a+b,0):null];})) as Record<Nutrient,number|null>;
}
export function portion(food:Food,multiple:number):Food {
  if(!String(food.name??'').trim()||!Number.isFinite(multiple)||multiple<=0)throw new Error('Invalid food.');
  const data:Food={name:String(food.name).trim()};
  for(const key of nutrients) {
    const value=food[key];
    if(value!=null&&(typeof value!=='number'||value<0||!Number.isFinite(value*multiple)))throw new Error('Invalid nutrient.');
    data[key]=value==null?null:Number(value)*multiple;
  }
  return data;
}
export function saveFood(repo:Repository,day:string,meal:string,food:Food,multiple=1,id?:string,now=today()) {
  assertDay(day,now);if(!meal)throw new Error('Missing meal.');
  const data=portion(food,multiple);
  return repo.atomic(()=>{
    const initial=defaultMeals().find(m=>m.id===meal);
    if(initial&&!repo.get('meals',meal))saveMeal(repo,initial.name,meal);
    return repo.save('food_entries',{...data,day,meal_id:meal,saved_food_id:food.saved_food_id??null},id);
  });
}
export interface Undo {id:string;data:Food;stamp:number;owner:string}
export function deleteFood(repo:Repository,id:string):Undo {
  const row=repo.get('food_entries',id);if(!row||row.deleted_at!==null)throw new Error('Missing food.');
  const data={...row.data};repo.remove('food_entries',id);
  return {id,data,stamp:repo.get('food_entries',id)!.updated_at,owner:repo.owner};
}
export function undoFood(repo:Repository,token:Undo) {
  const row=repo.get('food_entries',token.id);
  if(token.owner!==repo.owner||!row||row.deleted_at===null||row.updated_at!==token.stamp)return false;
  repo.save('food_entries',token.data,token.id);return true;
}
const defaultMealKeys=['foodBreakfast','foodLunch','foodDinner','foodSnacks'] as const;
function defaultMeals() {return defaultMealKeys.map((key,position)=>({id:`fd000000-0000-4000-8000-00000000000${position}`,name:t(key),position}));}
export function meals(repo:Repository):{id:string;name:string;position:number}[] {
  const rows=repo.list('meals').map(r=>({id:r.id,name:String(r.data.name??''),position:Number(r.data.position??0)}));
  const existing=new Set(repo.list('meals',true).map(r=>r.id));
  return [...defaultMeals().filter(m=>!existing.has(m.id)),...rows].sort((a,b)=>a.position-b.position);
}
export function saveMeal(repo:Repository,name:string,id?:string) {
  if(!name.trim())throw new Error('Invalid meal.');
  const existing=meals(repo).find(m=>m.id===id);
  return repo.save('meals',{name:name.trim(),position:existing?.position??Math.max(-1,...meals(repo).map(m=>m.position))+1},id);
}
export function recentFoods(repo:Repository) {
  const seen=new Set<string>();return repo.list('food_entries').sort((a,b)=>compareRows(b,a)).filter(row=>{const key=String(row.data.name).trim().toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,25).map(r=>r.data);
}
function favoriteMap(repo:Repository) {return repo.localGet<Record<string,Food[]>>('foodFavorites')??{};}
export function allFavorites(repo:Repository,meal:string) {return favoriteMap(repo)[meal]??[];}
export function favorites(repo:Repository,meal:string) {return allFavorites(repo,meal).slice(0,5);}
export function toggleFavorite(repo:Repository,meal:string,food:Food) {
  const map=favoriteMap(repo),list=map[meal]??[],exists=list.some(f=>f.name===food.name);
  repo.localSave('foodFavorites',{...map,[meal]:exists?list.filter(f=>f.name!==food.name):[portion(food,1),...list]});
}
export function saveReusable(repo:Repository,food:Food) {const data=portion(food,1),serving=data.amount_g;delete data.amount_g;return repo.save('saved_foods',{...data,serving_g:serving??null});}
export interface Combo {name:string;foods:Food[]}
export function combos(repo:Repository) {return repo.localGet<Combo[]>('foodCombos')??[];}
export function saveCombo(repo:Repository,day:string,meal:string,name:string) {
  const foods=repo.list('food_entries').filter(r=>r.data.day===day&&r.data.meal_id===meal).map(r=>portion(r.data,1));
  if(!name.trim()||!foods.length)throw new Error('Empty combo.');
  const combo={name:name.trim(),foods};repo.localSave('foodCombos',[combo,...combos(repo).filter(c=>c.name!==combo.name)]);return combo;
}
export function logCombo(repo:Repository,combo:Combo,day:string,meal:string,now=today()) {
  assertDay(day,now);const foods=combo.foods.map(f=>portion(f,1));
  repo.atomic(()=>foods.forEach(food=>saveFood(repo,day,meal,food,1,undefined,now)));
}
export function copyYesterday(repo:Repository,day:string,meal:string,now=today()) {
  const foods=repo.list('food_entries').filter(r=>r.data.day===shiftDay(day,-1)&&r.data.meal_id===meal).map(r=>r.data);
  logCombo(repo,{name:'',foods},day,meal,now);
}
export function foodTargets(repo:Repository,day:string,steps?:number):{targets:Targets|null;basis:'manual'|'estimated';activity:Activity} {
  const persisted=repo.list('food_targets').filter(r=>typeof r.data.day==='string'&&r.data.day<=day).sort((a,b)=>String(a.data.day).localeCompare(String(b.data.day))||compareRows(a,b)).at(-1);
  const map=repo.localGet<Record<string,'manual'|'estimated'>>('foodTargetBasis')??{};
  const basis=(persisted?map[String(persisted.data.day)]:undefined)??(repo.localGet<string>('targetBasis')==='manual'?'manual':'estimated');
  const input=readProfile(repo);
  const weight=repo.list('weigh_ins').filter(r=>typeof r.data.day==='string'&&r.data.day<=day&&typeof r.data.weight_kg==='number'&&Number.isFinite(r.data.weight_kg)&&r.data.weight_kg>0).sort((a,b)=>String(a.data.day).localeCompare(String(b.data.day))||compareRows(a,b)).at(-1);
  input.weight=weight?String(Number(weight.data.weight_kg)*(input.unit==='kg'?1:2.2046226218487757)):'';
  if(steps!==undefined&&Number.isFinite(steps)&&steps>=0)input.activity=steps<5000?'sitting':steps<8500?'light':steps<12500?'active':'very';
  const targets=persisted?Object.fromEntries(['energy_kj','protein_g','carbs_g','fat_g'].map(k=>[k,persisted.data[k]])) as unknown as Targets:null;
  const valid=targets&&Object.values(targets).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)&&targets.energy_kj>0;
  return {targets:basis==='manual'&&valid?targets:estimateTargets(input,day)??(valid&&!map[String(persisted?.data.day)]?targets:null),basis,activity:input.activity};
}
export function setTargets(repo:Repository,day:string,targets:Targets,now=today()) {
  assertDay(day,now);if(Object.values(targets).some(v=>!Number.isFinite(v)||v<0)||targets.energy_kj<=0)throw new Error('Invalid targets.');
  repo.atomic(()=>{const row=repo.list('food_targets').find(r=>r.data.day===day);repo.save('food_targets',{day,...targets},row?.id);repo.localSave('foodTargetBasis',{...(repo.localGet<Record<string,string>>('foodTargetBasis')??{}),[day]:'manual'});});
}

/** A dated mode change preserves manual targets on earlier days. No wire mode column. */
export function resetFoodTargets(repo:Repository,day:string,now=today()) {
  assertDay(day,now);
  repo.atomic(()=>{
    const row=repo.list('food_targets').find(r=>r.data.day===day);
    repo.save('food_targets',{day,energy_kj:null,protein_g:null,carbs_g:null,fat_g:null},row?.id);
    repo.localSave('foodTargetBasis',{...(repo.localGet<Record<string,string>>('foodTargetBasis')??{}),[day]:'estimated'});
  });
}
