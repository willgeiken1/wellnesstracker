import { useState } from 'react';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { Field } from '../onboarding/fields';
import { t } from '../../i18n/en';
import { portion, type Food } from './model';
export function FoodEntry({initial,day,onSave,onClose}:{initial?:Food;day:string;onSave:(food:Food,multiple:number)=>void;onClose:()=>void}) {
  const keys=['name','energy_kj','protein_g','carbs_g','fat_g','amount_g'] as const;
  const labels=['foodName','foodCalories','foodProtein','foodCarbs','foodFat','foodAmount'] as const;
  const [values,setValues]=useState(()=>Object.fromEntries(keys.map(k=>[k,initial?.[k]==null?'':k==='energy_kj'?String(Number(initial[k])/4.184):String(initial[k])])));
  const [multiple,setMultiple]=useState('1'),[error,setError]=useState<'foodInvalid'|'foodFailure'|null>(null);
  return <>
    {keys.map((key,i)=><Field key={key} label={t(labels[i])} numeric={key!=='name'} value={values[key]} onChange={value=>setValues({...values,[key]:value})}/>)}
    <Field label={t('foodPortions')} numeric value={multiple} onChange={setMultiple}/>
    {error&&<ThemedText accessibilityRole="alert">{t(error)}</ThemedText>}
    <Button label={t('foodSaveDay').replace('{day}',day)} onPress={()=>{
      let food:Food;let count:number;
      try {
        const numeric=[...keys.filter(k=>k!=='name').map(k=>values[k]),multiple];
        if(numeric.some(v=>v.trim()!==''&&!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v.trim())))throw new Error();
        count=Number(multiple);food={...initial,name:values.name,...Object.fromEntries(keys.filter(k=>k!=='name').map(k=>[k,values[k].trim()===''?null:Number(values[k])*(k==='energy_kj'?4.184:1)]))};
        portion(food,count);
      } catch {setError('foodInvalid');return;}
      try {onSave(food,count);}catch{setError('foodFailure');}
    }}/>
    <Button label={t('cancel')} variant="secondary" onPress={onClose}/>
  </>;
}
