import type { Repository } from '../src/data/repository';
import { syncedTables, type Row } from '../src/data/rows';
import { localDay } from '../src/core/workout/rules';
import { saveWeighIn } from '../src/features/body/model';
import { defaultMeals, saveFood, setTargets } from '../src/features/food/model';
import { DEFAULT_CONTAINERS, WATER_KEY, readWater, type Drink } from '../src/features/food/water';
import { seedTrainingDemo } from '../src/features/workout/training-demo';
import { t } from '../src/i18n/en';
export const DEMO_ROUTINE_ID='de000000-0000-4000-8000-000000000001';
export const DEMO_SESSION_ID='de000000-0000-4000-8000-000000000002';
/** Reserved identities survive edits. Exact original seed shapes recognize #70's
 * random-ID samples; names alone never identify samples. */
export function sampleRow(row:Row,legacy=false) {
  if([DEMO_ROUTINE_ID,DEMO_SESSION_ID].includes(row.id))return true;
  if(!legacy)return false;
  const meaningful=Object.entries(row.data).filter(([,value])=>value!==null);
  return row.table==='routines'&&meaningful.length===2&&row.data.name==='Demo full body'&&row.data.position===0 ||
    row.table==='sessions'&&meaningful.length===4&&row.data.name==='Demo workout'&&row.data.day==='2026-01-01'&&row.data.origin==='routine'&&row.data.finished_at===1767272400000;
}

/* The example week behind "Explore with sample data". Made-up numbers from the frozen mockup: today is 1,364 kcal of
 * 2,200 with breakfast, lunch and a snack logged; the six days before it eat around the goal; weight drifts down a
 * little over a month. Training comes from the Training tab's own sample (a five day plan with a workout going now),
 * so Home and Training tell the same story. Sleep is read from Apple Health or Oura only, so the sample has none. */
const KJ=4.184;
type Item=[name:string,grams:number,kcal:number,protein:number,carbs:number,fat:number,fiber:number];
type Meal=[slot:number,items:Item[]];
/** Today, per the mockup: 412 + 618 + 334 = 1,364 kcal. Slots: 0 Breakfast, 1 Lunch, 3 Snack (Dinner still open). */
const TODAY:[hour:number,meal:Meal][]=[
  [7,[0,[['Greek yogurt, plain 2%',227,180,20,9,5,0],['Blueberries',74,42,1,11,1,2],['Granola',40,190,5,27,9,4]]]],
  [12,[1,[['Chicken breast, grilled',170,280,52,0,9,0],['Jasmine rice',158,205,4,45,1,1],['Broccoli',91,31,3,6,0,3],['Teriyaki sauce',36,102,2,17,0,0]]]],
  [15,[3,[['Apple, medium',182,95,0,25,0,5],['Peanut butter',32,190,8,7,16,3],['Cold brew, black',473,5,0,1,0,0],['String cheese',28,44,6,0,3,0]]]],
];
/** Three whole days that rotate through the week before today. Each is scaled to that day's total below. */
const DAYS:Meal[][]=[
  [[0,[['Eggs, scrambled',150,300,20,2,22,0],['Whole wheat toast',64,160,8,28,2,4],['Banana',118,105,1,27,0,3]]],
   [1,[['Turkey sandwich',230,520,36,48,18,5],['Baby carrots',85,30,1,7,0,2]]],
   [2,[['Salmon fillet',170,350,38,0,21,0],['Roasted potatoes',200,250,5,40,8,4],['Green beans',125,45,2,9,0,4]]],
   [3,[['Protein shake',350,210,32,10,4,1],['Almonds',28,165,6,6,14,3]]]],
  [[0,[['Oatmeal with berries',300,330,10,58,6,8],['Coffee with milk',240,40,2,4,2,0]]],
   [1,[['Chicken burrito bowl',450,690,45,72,22,12]]],
   [2,[['Beef stir-fry with noodles',420,720,42,70,26,5]]],
   [3,[['Greek yogurt, plain 2%',227,180,20,9,5,0],['Granola',40,190,5,27,9,4]]]],
  [[0,[['Bagel with cream cheese',130,390,12,58,12,2],['Orange juice',240,110,2,26,0,0]]],
   [1,[['Lentil soup',350,320,18,48,6,14],['Sourdough bread',60,160,6,30,1,1]]],
   [2,[['Chicken pasta',400,720,50,80,18,6]]],
   [3,[['Apple, medium',182,95,0,25,0,5],['Peanut butter',32,190,8,7,16,3],['Protein bar',60,210,20,22,7,3]]]],
];
/** Energy eaten on each of the six days before today, oldest first (kcal). */
const EATEN=[2140,2310,1980,2260,2050,2410];
/** The month of weigh-ins in lb, oldest first; the last is this morning. */
const WEIGHT_LB=[184.4,184.6,184.1,184.3,183.9,184.0,183.8,183.6,183.9,183.5,183.4,183.6,183.2,183.1,183.3,182.9,183.0,182.8,182.9,182.6,182.7,182.5,182.6,182.4,182.3,182.5,182.2,182.3,182.0,182.1];
/** Water on each day of the week, oldest first, as quick-add containers (Glass, Bottle, Tumbler, Large bottle). */
const WATER:[container:string,hour:number][][]=[
  [['bottle',8],['tumbler',12],['glass',15],['large',18]],
  [['glass',7],['bottle',10],['tumbler',13],['bottle',16],['glass',20]],
  [['tumbler',9],['bottle',13],['large',17]],
  [['glass',7],['large',11],['bottle',15],['glass',19]],
  [['bottle',8],['tumbler',12],['bottle',16],['glass',20]],
  [['large',10],['tumbler',14],['glass',18]],
  [['glass',8],['tumbler',11],['bottle',14]],
];
const food=([name,grams,kcal,protein,carbs,fat,fiber]:Item)=>({name,amount_g:grams,energy_kj:kcal*KJ,protein_g:protein,carbs_g:carbs,fat_g:fat,fiber_g:fiber,sugar_g:null,sodium_mg:null});

/** The week's food, water, weigh-ins and targets, dated back from `now` so the sample always ends today. */
function seedWeek(repo:Repository,now:number) {
  const at=(ago:number,hour=12,minute=0)=>{const d=new Date(now);return new Date(d.getFullYear(),d.getMonth(),d.getDate()-ago,hour,minute);};
  const day=(ago:number)=>localDay(at(ago)), today=day(0), hour=new Date(now).getHours(), slots=defaultMeals().sort((a,b)=>a.position-b.position);
  setTargets(repo,day(WEIGHT_LB.length-1),{energy_kj:2200*KJ,protein_g:165,carbs_g:240,fat_g:70},today);
  WEIGHT_LB.forEach((lb,i)=>saveWeighIn(repo,lb,'lb',day(WEIGHT_LB.length-1-i)));
  EATEN.forEach((kcal,i)=>{
    const meals=DAYS[i%DAYS.length], total=meals.flatMap(([,items])=>items).reduce((sum,item)=>sum+item[2],0);
    for(const [slot,items] of meals)for(const item of items)saveFood(repo,day(EATEN.length-i),slots[slot].id,food(item),kcal/total,undefined,today);
  });
  // Today only shows the meals whose time has come.
  for(const [from,[slot,items]] of TODAY)if(hour>=from)for(const item of items)saveFood(repo,today,slots[slot].id,food(item),1,undefined,today);
  const water=readWater(repo), log:Record<string,Drink[]>={...water.log};
  WATER.forEach((drinks,i)=>{
    const ago=WATER.length-1-i, list=drinks.map(([id,h],n)=>({c:DEFAULT_CONTAINERS.find(c=>c.id===id)!,stamp:at(ago,h,10+n*7).getTime()}))
      .filter(d=>d.stamp<=now).map(({c,stamp},n):Drink=>({id:`wdemo${i}${n}`,c:c.id,name:c.name,oz:c.oz,icon:c.icon,at:stamp}));
    if(list.length)log[day(ago)]=[...(log[day(ago)]??[]),...list];
  });
  repo.localSave(WATER_KEY,{...water,log});
}

/** The repository with every new row given a reserved sample id (de000000-0000-4000-8001-…), counted from 1, so the
 * sample never draws on the namespace's own id source and each sample row reads as one by its id. */
function withSampleIds(repo:Repository):Repository {
  let n=0;
  const next=()=>`de000000-0000-4000-8001-${(++n).toString(16).padStart(12,'0')}`;
  return new Proxy(repo,{get(target,prop){
    const value=Reflect.get(target,prop,target) as unknown;
    if(prop==='save')return (...[table,data,id,...rest]:Parameters<Repository['save']>)=>target.save(table,data,id??next(),...rest);
    return typeof value==='function'?(value as (...args:unknown[])=>unknown).bind(target):value;
  }});
}

/** Entirely synthetic; demo never has a Transport. Every row it writes is listed in `demoSamples`, so promotion
 * never carries a sample into an account. */
export function seedDemo(repo: Repository, now = Date.now()) {
  if(repo.owner!=='demo')throw new Error('Demo namespace required.');
  if(repo.localGet('demoSamples'))return;
  const legacy=['routines','sessions'].flatMap(table=>repo.list(table as 'routines'|'sessions')).filter(row=>sampleRow(row,true));
  if(legacy.length===2&&new Set(legacy.map(row=>row.table)).size===2){repo.localSave('demoSamples',legacy.map(row=>row.id));return;}
  // A partial/edited old seed has no trustworthy provenance. Keep it available
  // locally, but promotion will refuse it rather than guess which rows are samples.
  if(repo.list('routines',true).length||repo.list('sessions',true).length)return;
  if(repo.list('routines').length)return;
  repo.atomic(()=>{
    const before=new Set(syncedTables.flatMap(table=>repo.list(table,true)).map(row=>row.id));
    repo.save('routines',{name:t('demoFullBody'),position:0},DEMO_ROUTINE_ID);
    repo.save('sessions',{name:t('demoWorkoutName'),day:'2026-01-01',origin:'routine',finished_at:1767272400000},DEMO_SESSION_ID);
    // Listed before the Training sample runs, which adds its own rows to this list.
    repo.localSave('demoSamples',[DEMO_ROUTINE_ID,DEMO_SESSION_ID]);
    const sample=withSampleIds(repo);
    seedWeek(sample,now);
    seedTrainingDemo(sample,now);
    const generated=syncedTables.flatMap(table=>repo.list(table,true)).filter(row=>!before.has(row.id)).map(row=>row.id);
    repo.localSave('demoSamples',[...new Set([DEMO_ROUTINE_ID,DEMO_SESSION_ID,...(repo.localGet<string[]>('demoSamples')??[]),...generated])]);
  });
}
