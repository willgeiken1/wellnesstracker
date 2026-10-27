import { useState } from 'react';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { Field } from '../onboarding/fields';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { foodTargets, setTargets, resetFoodTargets } from './model';
export function FoodTargets({repo,day,revision}:{repo:Repository;day:string;revision:number}) {
 'use no memo';
 // The revision prop invalidates the parent's child element after local writes.
 void revision;
 const current=foodTargets(repo,day),[editing,setEditing]=useState(false),[values,setValues]=useState(['','','','']),[error,setError]=useState(false);
 const target=current.targets,labels=['foodTargetCalories','foodTargetProtein','foodTargetCarbs','foodTargetFat'] as const;
 return <>
  <ThemedText>{target?t(current.basis==='manual'?'foodTargetsManual':'estimatedTargets'):t('targetsUnset')}</ThemedText>
  {target&&<ThemedText>{t('foodTargetSummary').replace('{calories}',String(Math.round(target.energy_kj/4.184))).replace('{protein}',String(target.protein_g)).replace('{carbs}',String(target.carbs_g)).replace('{fat}',String(target.fat_g))}</ThemedText>}
  {current.basis==='estimated'&&<ThemedText muted>{t('foodActivityEstimate').replace('{level}',t(({sitting:'activitySitting',light:'activityLight',active:'activityActive',very:'activityVery'} as const)[current.activity]??'activityLight'))}</ThemedText>}
  {!editing?<Button label={t(target?'foodTargetsEdit':'foodTargetsSet')} variant="secondary" onPress={()=>{setValues(target?[String(Math.round(target.energy_kj/4.184)),String(target.protein_g),String(target.carbs_g),String(target.fat_g)]:['','','','']);setEditing(true);setError(false);}}/>:<>
   {labels.map((label,i)=><Field key={label} label={t(label)} numeric value={values[i]} onChange={value=>setValues(values.map((v,n)=>n===i?value:v))}/>)}
   {error&&<ThemedText accessibilityRole="alert">{t('invalidTargets')}</ThemedText>}
   <Button label={t('foodTargetsSave')} onPress={()=>{try{if(values.some(v=>!v.trim()||!Number.isFinite(Number(v))))throw new Error();setTargets(repo,day,{energy_kj:Number(values[0])*4.184,protein_g:Number(values[1]),carbs_g:Number(values[2]),fat_g:Number(values[3])});setEditing(false);}catch{setError(true);}}}/>
   <Button label={t('foodTargetsAuto')} variant="secondary" onPress={()=>{try{resetFoodTargets(repo,day);setEditing(false);}catch{setError(true);}}}/>
   <Button label={t('cancel')} variant="secondary" onPress={()=>setEditing(false)}/>
  </>}
 </>;
}
