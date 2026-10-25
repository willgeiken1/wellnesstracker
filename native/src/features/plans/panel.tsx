import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { SegmentedControl } from '../../components/segmented-control';
import { useTheme } from '../../design/theme-provider';
import type { WorkoutStore } from '../../data/workout/store';
import { t } from '../../i18n/en';
import { Panel, layout } from '../workout/primitives';
import { PlanStore } from './store';
import type { Plan } from './schedule';
const weekdayKeys = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
function Choice({label, checked, onPress}:{label:string;checked:boolean;onPress:()=>void}) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked}}
    onPress={onPress} style={{minHeight:touchTarget,minWidth:touchTarget,justifyContent:'center'}}>
    <ThemedText>{label}{checked ? ' ✓' : ''}</ThemedText>
  </Pressable>;
}
export function PlansPanel({store}:{store:WorkoutStore}) {
  const plans=new PlanStore(store.repo);
  const [editing,setEditing]=useState(false),[error,setError]=useState(false);
  const plan=plans.read();
  const next=plan.days[plans.nextIndex()];
  const name=(id:string)=>String(store.repo.get('routines',id)?.data.name ?? '');
  return <Panel>
    <ThemedText variant="headline">{t('plans')}</ThemedText>
    <ThemedText>{t('planTarget').replace('{mode}',t(plan.mode==='fixed'?'fixedWeekdays':'rotation')).replace('{count}',String(plan.daysPerWeek))}</ThemedText>
    {editing ? <PlanEditor store={store} initial={plan} onClose={()=>setEditing(false)} /> : <>
      <ThemedText muted>{t(plan.mode==='rotation'?'rotationForecast':'fixedForecast')}</ThemedText>
      {plan.days.length===0 && <ThemedText muted>{t('planEmpty')}</ThemedText>}
      {(plan.mode==='rotation' ? (next?[next]:[]) : plan.days.filter(d=>d.weekdays.includes((new Date().getDay()+6)%7))).map(day=>
        <Button key={day.routineId} label={t('startPlanDay').replace('{name}',name(day.routineId))} disabled={!!store.active()} onPress={()=>{
          try {plans.startDay(day.routineId);setError(false);router.push('/workout');} catch {setError(true);}
        }} />)}
      {error && <ThemedText accessibilityRole="alert">{t('workoutSaveError')}</ThemedText>}
      <Button label={t('editPlan')} variant="secondary" onPress={()=>setEditing(true)} />
    </>}
  </Panel>;
}
function PlanEditor({store,initial,onClose}:{store:WorkoutStore;initial:Plan;onClose:()=>void}) {
  const {colors}=useTheme();
  const [mode,setMode]=useState(initial.mode),[target,setTarget]=useState(String(initial.daysPerWeek)),
    [days,setDays]=useState(initial.days),[error,setError]=useState(false);
  const enabled=store.repo.syncFlags?.syncedV1Columns;
  return <>
    {enabled ? <>
      <SegmentedControl label={t('planMode')} options={[{value:'rotation',label:t('rotation')},{value:'fixed',label:t('fixedWeekdays')}]} value={mode} onChange={setMode}/>
      <ThemedText>{t('daysPerWeek')}</ThemedText>
      <TextInput accessibilityLabel={t('daysPerWeek')} keyboardType="number-pad" value={target} onChangeText={setTarget}
        style={[layout.input,{color:colors.text,backgroundColor:colors['surface-2']}]} />
    </> : <ThemedText muted>{t('planFlagOff')}</ThemedText>}
    <ThemedText muted>{t('planLocal')}</ThemedText>
    <ThemedText muted>{t('planEmpty')}</ThemedText>
    {store.templates().map(r=>{
      const name=String(r.data.name),day=days.find(d=>d.routineId===r.id);
      return <View key={r.id}>
        <Choice label={t('planDayLabel').replace('{name}',name)} checked={!!day} onPress={()=>setDays(current=>day?current.filter(d=>d.routineId!==r.id):[...current,{routineId:r.id,weekdays:[]}])}/>
        {mode==='fixed' && day && weekdayKeys.map((weekday,index)=><Choice key={weekday}
          label={t('planWeekdayLabel').replace('{name}',name).replace('{weekday}',t(weekday))} checked={day.weekdays.includes(index)}
          onPress={()=>setDays(current=>current.map(d=>d.routineId===r.id?{...d,weekdays:d.weekdays.includes(index)?d.weekdays.filter(w=>w!==index):[...d.weekdays,index]}:d))}/>)}
      </View>;
    })}
    {error && <ThemedText accessibilityRole="alert">{t('invalidPlan')}</ThemedText>}
    <Button label={t('savePlan')} onPress={()=>{
      try {
        const ordered=store.templates().flatMap(r=>days.filter(d=>d.routineId===r.id));
        new PlanStore(store.repo).save({mode,daysPerWeek:Number(target),days:ordered});onClose();
      } catch {setError(true);}
    }}/>
    <Button label={t('cancel')} variant="secondary" onPress={onClose}/>
  </>;
}
