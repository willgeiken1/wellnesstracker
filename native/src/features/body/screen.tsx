import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Button } from '../../components/button';
import { SegmentedControl } from '../../components/segmented-control';
import { ThemedText } from '../../components/themed-text';
import { fromKg } from '../../core/workout/rules';
import { compareRows } from '../../data/rows';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { readProfile, today } from '../onboarding/model';
import { Host, BottomSheet, RNHostView } from '@expo/ui';
import { TonePanel, Label } from './presentation';
import { Measurements } from './measurements';
import { useTheme } from '@/design/theme-provider';
import { useWorkoutStore } from '../workout/use-workout';
import { BodyChart } from './chart';
import { WeightEntry } from './entry';
import { deleteWeighIn, dailyWeights, inRange, lastWeight, saveWeighIn, trendWeights, weeklyChange, type BodyRange } from './model';
export function Body({repository}:{repository:Repository}) {
  const { colors } = useTheme();
  const facade=useWorkoutStore(repository);
  const repo=facade.repo,unit=readProfile(repo).unit;
  const [range,setRange]=useState<BodyRange | 'all'>(30),[entry,setEntry]=useState(false),[saved,setSaved]=useState(false),[deleteFailed,setDeleteFailed]=useState(false);
  const [showAll,setShowAll]=useState(false);
  const rows=repo.list('weigh_ins').filter(r=>String(r.data.day)<=today());
  const deletable=rows.filter(row=>row.data.source==='app').sort((a,b)=>String(b.data.day).localeCompare(String(a.data.day)) || compareRows(b,a) || b.id.localeCompare(a.id));
  const deleteRows=showAll?deletable:deletable.slice(0,30);
  const trend=trendWeights(dailyWeights(rows)),visible=(range==='all'?trend:inRange(trend,range)),last=trend.at(-1),change=weeklyChange(trend);
  const lastKg=lastWeight(rows);
  const raw=rows.filter(r=>visible.some(p=>p.day===r.data.day) && typeof r.data.weight_kg==='number' && Number.isFinite(r.data.weight_kg) && r.data.weight_kg>0).map(r=>({day:String(r.data.day),kg:Number(r.data.weight_kg)}));
  return <View style={{gap:16}}>
    <Button label={last ? t('bodyLog') : 'Add your first weigh-in'} disabled={entry} onPress={()=>{setEntry(true);setSaved(false);}}/>
    {entry&&<Host><BottomSheet testID="weight-entry-sheet" isPresented onDismiss={()=>setEntry(false)} containerColor={colors['surface-2']} snapPoints={['full']}><RNHostView><ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{paddingBottom:32}}><WeightEntry key={unit} initial={lastKg===null?null:fromKg(lastKg,unit)} unit={unit} onClose={()=>setEntry(false)} onSave={value=>{saveWeighIn(repo,value,unit);setEntry(false);setSaved(true);}}/></ScrollView></RNHostView></BottomSheet></Host>}
    {saved&&<ThemedText accessibilityLiveRegion="polite">{t('bodySaved')}</ThemedText>}
    <TonePanel>
      {last?<>
        <Label>Weight trend</Label>
        <ThemedText numeric variant="title">{t('bodyTrend').replace('{weight}',fromKg(last.trendKg,unit).toFixed(1)).replace('{unit}',unit)}</ThemedText>
        <ThemedText muted>{t('bodyAsOf').replace('{day}',last.day)}</ThemedText>
        <ThemedText>{change===null?t('bodyWeekEmpty'):t('bodyWeek').replace('{change}',`${change>0?'+':''}${fromKg(change,unit).toFixed(1)}`).replace('{unit}',unit)}</ThemedText>
      </>:<ThemedText>{t('bodyEmpty')}</ThemedText>}
      <SegmentedControl label={t('bodyRanges')} value={String(range)} options={[{value:'30',label:'1M'},{value:'90',label:'3M'},{value:'365',label:'1Y'},{value:'all',label:'All'}]} onChange={n=>setRange(n==='all'?'all':Number(n) as BodyRange)}/>
      <BodyChart key={range} points={visible} raw={raw} unit={unit}/>
      <ThemedText muted variant="caption">{t('bodyAverageHint')}</ThemedText>
    </TonePanel>
    {deleteFailed&&<ThemedText accessibilityRole="alert">{t('bodyDeleteFailed')}</ThemedText>}
    <Measurements repository={repo} />
    {lastKg!==null&&<ThemedText numeric>Latest weigh-in: {fromKg(lastKg,unit).toFixed(1)} {unit}</ThemedText>}
    <Label>Weigh-ins</Label>
    <View style={{gap:0}}>
    {deleteRows.map(row=><View key={row.id} style={{minHeight:44,paddingVertical:8,borderBottomWidth:0.5,borderBottomColor:colors['text-muted'],gap:8}}>
      <ThemedText numeric>{String(row.data.day)} · {fromKg(Number(row.data.weight_kg),unit).toFixed(1)} {unit}</ThemedText>
      <Button testID={`body-delete-${row.id}`} variant="destructive" label={t('bodyDelete')} accessibilityLabel={t('bodyDeleteLabel').replace('{day}',String(row.data.day)).replace('{value}',fromKg(Number(row.data.weight_kg),unit).toFixed(1)).replace('{unit}',unit)} onPress={()=>Alert.alert(t('bodyDeleteConfirm').replace('{day}',String(row.data.day)),undefined,[
        {text:t('cancel'),style:'cancel'},
        {text:t('bodyDelete'),style:'destructive',onPress:()=>{try{const deleted=deleteWeighIn(repo,row.id);setDeleteFailed(!deleted);if(deleted)setSaved(false);}catch{setDeleteFailed(true);}}},
      ])}/>
    </View>)}
    </View>
    {!showAll&&deletable.length>30&&<Button label={t('bodyShowAll')} onPress={()=>setShowAll(true)}/>}
  </View>;
}
