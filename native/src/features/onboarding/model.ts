import type { Repository } from '../../data/repository';
import { compareRows } from '../../data/rows';
import { t } from '../../i18n/en';
import { WorkoutStore } from '../../data/workout/store';
import { displayWeight, toKg } from '../../core/workout/rules';
export const ONBOARDING_STEPS = ['welcome', 'about', 'start'] as const;
export type Unit = 'kg' | 'lb';
export type Activity = 'sitting' | 'light' | 'active' | 'very';
export interface ProfileInput { name:string; dob:string; unit:Unit; height:string; weight:string; sex:''|'male'|'female'; activity:Activity }
export interface Targets { energy_kj:number; protein_g:number; carbs_g:number; fat_g:number }
export interface DevicePreferences { crashReports:boolean; analytics:boolean }
export function today() { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function ageOn(dob:string,day=today()):number|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))return null;
  const date=new Date(`${dob}T12:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==dob||dob>day)return null;
  return Number(day.slice(0,4))-Number(dob.slice(0,4))-(day.slice(5)<dob.slice(5)?1:0);
}
export function defaultUnits(locale=Intl.DateTimeFormat().resolvedOptions().locale):Unit {
  // Region subtag, not language: English outside the US defaults to metric.
  return /(?:-|_)(US|LR|MM)(?:-|$)/i.test(locale)?'lb':'kg';
}
export function emptyProfile():ProfileInput { return {name:'',dob:'',unit:defaultUnits(),height:'',weight:'',sex:'',activity:'light'}; }
function positive(value:string) {return value.trim()===''?null:Number(value);}
export function validProfile(input:ProfileInput,day=today()) {
  const age=ageOn(input.dob,day);
  return age!==null&&age>=13&&['kg','lb'].includes(input.unit)&&['','male','female'].includes(input.sex)&&
    ['sitting','light','active','very'].includes(input.activity)&&[input.height,input.weight].every(v=>v.trim()===''||(Number.isFinite(positive(v))&&Number(v)>0));
}
export function canonicalStats(input:ProfileInput) {
  return {height_m:input.height.trim()?Number(input.height)*(input.unit==='kg'?0.01:0.0254):null,
    weight_kg:input.weight.trim()?Number(input.weight)/(input.unit==='kg'?1:2.2046226218487757):null};
}
/** Same BMR + baseline/steps model as the PWA, with K-6's lightly-active fallback. Mifflin-St Jeor: +5 for male, -161
 * for female, and the midpoint -78 when sex isn't given. A plan scales maintenance: Cut x0.85, Bulk x1.10.
 * No Health/Oura reads; maintenance only until a person overrides their targets. */
export function estimateTargets(input:ProfileInput,day=today(),plan:'cut'|'maintain'|'bulk'='maintain'):Targets|null {
  if(!validProfile(input,day))return null;
  const {height_m,weight_kg}=canonicalStats(input);if(!height_m||!weight_kg)return null;
  const bmr=10*weight_kg+6.25*height_m*100-5*ageOn(input.dob,day)!+(input.sex==='male'?5:input.sex==='female'?-161:-78);
  const steps={sitting:4000,light:7000,active:10000,very:14000}[input.activity];
  const maintenance=Math.round((bmr*1.15+steps*0.0005*weight_kg)/10)*10;
  const kcal=Math.round(maintenance*{cut:0.85,maintain:1,bulk:1.1}[plan]/10)*10;
  if(kcal<=0)return null;
  const protein_g=Math.round(2*weight_kg),fat_g=Math.round(kcal*0.25/9);
  return {energy_kj:kcal*4.184,protein_g,fat_g,carbs_g:Math.max(0,Math.round((kcal-protein_g*4-fat_g*9)/4))};
}
export function readProfile(repo:Repository):ProfileInput {
  const row=repo.list('profile').sort(compareRows).at(-1);
  const extra=repo.localGet<{sex:ProfileInput['sex'];activity:Activity}>('profileExtras');
  const unit:Unit=row?.data.weight_unit==='kg'?'kg':row?.data.weight_unit==='lb'?'lb':defaultUnits();
  return {...emptyProfile(),name:String(row?.data.name??''),dob:String(row?.data.dob??''),unit,
    height:row?.data.height_m==null?'':String(Number(row.data.height_m)/(unit==='kg'?0.01:0.0254)),
    sex:extra?.sex??'',activity:extra?.activity??'light'};
}
export function changeUnits(input:ProfileInput,unit:Unit):ProfileInput {
  if(input.unit===unit)return input;
  const {height_m,weight_kg}=canonicalStats(input);
  return {...input,unit,height:height_m===null?'':String(height_m/(unit==='kg'?0.01:0.0254)),weight:weight_kg===null?'':String(weight_kg*(unit==='kg'?1:2.2046226218487757))};
}
export function saveProfile(repo:Repository,input:ProfileInput,day=today()) {
  if(!validProfile(input,day))throw new Error('Invalid profile.');
  const stats=canonicalStats(input),current=repo.list('profile').sort(compareRows).at(-1);
  repo.atomic(()=>{
    repo.save('profile',{name:input.name.trim()||null,dob:input.dob,weight_unit:input.unit,height_m:stats.height_m},current?.id);
    // No physical columns exist yet; these stay local, never encoded in a wire blob.
    repo.localSave('profileExtras',{sex:input.sex,activity:input.activity});
    if(stats.weight_kg!==null)repo.save('weigh_ins',{day,weight_kg:stats.weight_kg,entered_value:Number(input.weight),entered_unit:input.unit,source:'app'});
  });
}
/** Renames the saved profile and keeps every other field as it is. A profile from setup may have no birth date (About you
 * skipped or age left blank), which the full save in saveProfile rightly refuses, so a name change goes through here.
 * Writes nothing when there is no profile yet: a profile row marks the account as set up. */
export function saveProfileName(repo:Repository,name:string) {
  const current=repo.list('profile').sort(compareRows).at(-1);
  if(!current)return;
  repo.save('profile',{...current.data,name:name.trim()||null},current.id);
}
/** Changes only the profile's weight unit, which Progress, Body and new workout entries read, keeping every other
 * field. Settings' Units page calls it with its own weight choice so the two never disagree. Without a profile row it
 * writes nothing, because a profile row marks the account as set up. Height stays in metres, so it needs no change. */
export function saveProfileUnit(repo:Repository,unit:Unit) {
  const current=repo.list('profile').sort(compareRows).at(-1);
  if(!current||current.data.weight_unit===unit)return;
  // Weights typed but not yet logged in a workout that's going are shown in the new unit, as the same load.
  const store=new WorkoutStore(repo),live=store.active(),entries=live?store.entries(live.id):[];
  const before=new Map(entries.map(e=>[e.id,store.unit(e.id)]));
  repo.atomic(()=>{
    repo.save('profile',{...current.data,weight_unit:unit},current.id);
    for(const e of entries){
      const from=before.get(e.id)!,to=store.unit(e.id),drafts=repo.localGet<{weight:string;rightWeight?:string}[]>(`draft:${e.id}`);
      if(from===to||!drafts)continue;
      const convert=(w:string)=>w&&Number.isFinite(Number(w))?String(displayWeight(toKg(Number(w),from),to)):w;
      repo.localSave(`draft:${e.id}`,drafts.map(d=>({...d,weight:convert(d.weight),...(d.rightWeight!==undefined?{rightWeight:convert(d.rightWeight)}:{})})));
      drafts.forEach((_,i)=>{repo.localSave(`input:${e.id}:${i}:weight`,null);repo.localSave(`input:${e.id}:${i}:right:weight`,null);});
    }
  });
}
export function finishOnboarding(repo:Repository,input:ProfileInput,template:'empty'|'fullBody',targets:Targets|null,day=today()) {
  if(!validProfile(input,day))throw new Error('Invalid profile.');
  if(targets&&Object.values(targets).some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid targets.');
  // A stale onboarding route must never replace a pulled/legacy account profile.
  if(repo.localGet('onboardingComplete')||repo.list('profile').length)return;
  repo.atomic(()=>{
    saveProfile(repo,input,day);
    if(template==='fullBody') {
      const routine=repo.save('routines',{name:t('starterFullBody'),position:repo.list('routines').length});
      ['Squat','Bench Press','Dumbbell Row'].forEach((exercise,position)=>repo.save('routine_exercises',{routine_id:routine.id,exercise,position,target_sets:3,target_reps:8}));
    }
    if(targets){
      repo.save('food_targets',{day,...targets});
      const automatic=estimateTargets(input,day);
      repo.localSave('targetBasis',automatic&&Object.entries(targets).every(([key,value])=>value===automatic[key as keyof Targets])?'estimated':'manual');
    }
    repo.localSave('onboardingComplete',true);
  });
}

export function onboardingProgress(step:number) { return t('onboardingStep').replace('{step}',String(step)).replace('{total}',String(ONBOARDING_STEPS.length)); }
