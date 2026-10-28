import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '../../components/button';
import { SegmentedControl } from '../../components/segmented-control';
import { ThemedText } from '../../components/themed-text';
import { fromKg } from '../../core/workout/rules';
import { compareRows } from '../../data/rows';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { readProfile, today } from '../onboarding/model';
import { Panel } from '../workout/primitives';
import { useWorkoutStore } from '../workout/use-workout';
import { BodyChart } from './chart';
import { WeightEntry } from './entry';
import { deleteWeighIn, dailyWeights, inRange, lastWeight, saveWeighIn, trendWeights, weeklyChange, type BodyRange } from './model';
export function Body({repository}:{repository:Repository}) {
  const facade=useWorkoutStore(repository);
  const repo=facade.repo,unit=readProfile(repo).unit;
  const [range,setRange]=useState<BodyRange>(30),[entry,setEntry]=useState(false),[saved,setSaved]=useState(false),[deleteFailed,setDeleteFailed]=useState(false);
  const [showAll,setShowAll]=useState(false);
  const rows=repo.list('weigh_ins').filter(r=>String(r.data.day)<=today());
  const deletable=rows.filter(row=>row.data.source==='app').sort((a,b)=>String(b.data.day).localeCompare(String(a.data.day)) || compareRows(b,a) || b.id.localeCompare(a.id));
  const deleteRows=showAll?deletable:deletable.slice(0,30);
  const trend=trendWeights(dailyWeights(rows)),visible=inRange(trend,range),last=trend.at(-1),change=weeklyChange(trend);
  const lastKg=lastWeight(rows);
  const raw=rows.filter(r=>visible.some(p=>p.day===r.data.day) && typeof r.data.weight_kg==='number' && Number.isFinite(r.data.weight_kg) && r.data.weight_kg>0).map(r=>({day:String(r.data.day),kg:Number(r.data.weight_kg)}));
  return <View style={{gap:16}}>
    <Button label={t('bodyLog')} disabled={entry} onPress={()=>{setEntry(true);setSaved(false);}}/>
    {entry&&<WeightEntry key={unit} initial={lastKg===null?null:fromKg(lastKg,unit)} unit={unit} onClose={()=>setEntry(false)} onSave={value=>{saveWeighIn(repo,value,unit);setEntry(false);setSaved(true);}}/>}
    {saved&&<ThemedText accessibilityLiveRegion="polite">{t('bodySaved')}</ThemedText>}
    <Panel>
      {last?<>
        <ThemedText variant="headline">{t('bodyTrend').replace('{weight}',fromKg(last.trendKg,unit).toFixed(1)).replace('{unit}',unit)}</ThemedText>
        <ThemedText muted>{t('bodyAsOf').replace('{day}',last.day)}</ThemedText>
        <ThemedText>{change===null?t('bodyWeekEmpty'):t('bodyWeek').replace('{change}',`${change>0?'+':''}${fromKg(change,unit).toFixed(1)}`).replace('{unit}',unit)}</ThemedText>
      </>:<ThemedText>{t('bodyEmpty')}</ThemedText>}
      <SegmentedControl label={t('bodyRanges')} value={String(range)} options={([7,30,90,365] as const).map(n=>({value:String(n),label:t(`bodyRange${n}`)}))} onChange={n=>setRange(Number(n) as BodyRange)}/>
      <BodyChart key={range} points={visible} raw={raw} unit={unit}/>
      <ThemedText muted variant="caption">{t('bodyAverageHint')}</ThemedText>
    </Panel>
    {deleteFailed&&<ThemedText accessibilityRole="alert">{t('bodyDeleteFailed')}</ThemedText>}
    {deleteRows.map(row=><Panel key={row.id}>
      <ThemedText numeric>{String(row.data.day)} · {fromKg(Number(row.data.weight_kg),unit).toFixed(1)} {unit}</ThemedText>
      <Button testID={`body-delete-${row.id}`} variant="destructive" label={t('bodyDelete')} accessibilityLabel={t('bodyDeleteLabel').replace('{day}',String(row.data.day)).replace('{value}',fromKg(Number(row.data.weight_kg),unit).toFixed(1)).replace('{unit}',unit)} onPress={()=>Alert.alert(t('bodyDeleteConfirm').replace('{day}',String(row.data.day)),undefined,[
        {text:t('cancel'),style:'cancel'},
        {text:t('bodyDelete'),style:'destructive',onPress:()=>{try{const deleted=deleteWeighIn(repo,row.id);setDeleteFailed(!deleted);if(deleted)setSaved(false);}catch{setDeleteFailed(true);}}},
      ])}/>
    </Panel>)}
    {!showAll&&deletable.length>30&&<Button label={t('bodyShowAll')} onPress={()=>setShowAll(true)}/>}
  </View>;
}
