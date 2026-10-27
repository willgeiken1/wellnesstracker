import type { Repository } from '../../data/repository';
import { compareRows } from '../../data/rows';
import { t } from '../../i18n/en';
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
/** Same BMR + baseline/steps model as the PWA, with K-6's lightly-active fallback.
 * No Health/Oura reads; maintenance only until a person overrides their targets. */
export function estimateTargets(input:ProfileInput,day=today()):Targets|null {
  if(!validProfile(input,day)||!input.sex)return null;
  const {height_m,weight_kg}=canonicalStats(input);if(!height_m||!weight_kg)return null;
  const bmr=10*weight_kg+6.25*height_m*100-5*ageOn(input.dob,day)!+(input.sex==='male'?5:-161);
  const steps={sitting:4000,light:7000,active:10000,very:14000}[input.activity];
  const kcal=Math.round((bmr*1.15+steps*0.0005*weight_kg)/10)*10;
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
export function finishOnboarding(repo:Repository,input:ProfileInput,template:'empty'|'fullBody',targets:Targets|null,day=today()) {
  if(!validProfile(input,day))throw new Error('Invalid profile.');
  if(targets&&Object.values(targets).some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid targets.');
  if(repo.localGet('onboardingComplete'))return;
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
