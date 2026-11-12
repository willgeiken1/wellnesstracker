import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { fromKg } from '../../core/workout/rules';
import { compareRows } from '../../data/rows';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { appleHealth } from '../health/apple';
import { refreshWeights } from '../health/weights';
import { readProfile, today } from '../onboarding/model';
import { Panel } from '../workout/primitives';
import { useWorkoutStore } from '../workout/use-workout';
import { BodyChart } from './chart';
import { WeightEntry } from './entry';
import { deleteWeighIn, dailyWeights, inRange, lastWeight, saveWeighIn, trendWeights, weeklyChange, type BodyRange } from './model';
export function Body({repository}:{repository:Repository}) {
  const facade=useWorkoutStore(repository),{colors}=useTheme();
  const repo=facade.repo,unit=readProfile(repo).unit;
  // Once Apple Health is connected, opening Body quietly picks up new readings. It never prompts from here.
  useEffect(()=>{void refreshWeights(repo,appleHealth()).catch(()=>{});},[repo]);
  const [range,setRange]=useState<BodyRange>(30),[entry,setEntry]=useState(false),[saved,setSaved]=useState(false),[deleteFailed,setDeleteFailed]=useState(false);
  const [showAll,setShowAll]=useState(false);
  const rows=repo.list('weigh_ins').filter(r=>String(r.data.day)<=today());
  const deletable=rows.filter(row=>row.data.source==='app').sort((a,b)=>String(b.data.day).localeCompare(String(a.data.day)) || compareRows(b,a) || b.id.localeCompare(a.id));
  const deleteRows=showAll?deletable:deletable.slice(0,30);
  const trend=trendWeights(dailyWeights(rows)),visible=inRange(trend,range),last=trend.at(-1),change=weeklyChange(trend);
  const lastKg=lastWeight(rows);
  const raw=rows.filter(r=>visible.some(p=>p.day===r.data.day) && typeof r.data.weight_kg==='number' && Number.isFinite(r.data.weight_kg) && r.data.weight_kg>0).map(r=>({day:String(r.data.day),kg:Number(r.data.weight_kg)}));
  const delta=(kg:number|null)=>kg===null?'—':`${kg>0?'+':''}${fromKg(kg,unit).toFixed(1)} ${unit}`;
  const stats=[
    [t('bodyStatChange').replace('{range}',t(`bodyRange${range}`)),delta(visible.length>1?visible.at(-1)!.trendKg-visible[0].trendKg:null)],
    [t('bodyStatPace'),delta(change)],
    [t('bodyStatCount'),String(raw.length)],
  ] as const;
  return <View style={{gap:16}}>
    <Panel>
      {last?<>
        <ThemedText numeric style={{fontSize:28,lineHeight:34,fontWeight:'600'}}>{t('bodyTrend').replace('{weight}',fromKg(last.trendKg,unit).toFixed(1)).replace('{unit}',unit)}</ThemedText>
        <ThemedText muted variant="caption">{t('bodyAsOf').replace('{day}',last.day)}</ThemedText>
      </>:<ThemedText>{t('bodyEmpty')}</ThemedText>}
      {/* Four equal segments on one row, so no range is left alone on a second line at phone width. */}
      <View testID="body-ranges" accessibilityRole="tablist" accessibilityLabel={t('bodyRanges')} style={{flexDirection:'row',gap:tokens.spacing[0]}}>
        {([7,30,90,365] as const).map(n=>{const on=n===range;return <Pressable key={n} accessibilityRole="tab" accessibilityLabel={t(`bodyRange${n}`)} accessibilityState={{selected:on}} onPress={()=>setRange(n)}
          style={{flex:1,minHeight:touchTarget,justifyContent:'center',paddingHorizontal:tokens.spacing[0],paddingVertical:tokens.spacing[1],borderRadius:tokens.radii.input,backgroundColor:on?colors.accent:colors['surface-2']}}>
          <ThemedText style={{color:on?colors['on-accent']:colors.text,textAlign:'center'}}>{t(`bodyRange${n}`)}</ThemedText>
        </Pressable>;})}
      </View>
      <BodyChart key={range} points={visible} raw={raw} unit={unit}/>
      <ThemedText muted variant="caption">{t('bodyAverageHint')}</ThemedText>
    </Panel>
    {last&&<Panel testID="body-stats" style={{flexDirection:'row',justifyContent:'space-around'}}>
      {stats.map(([label,value])=><View key={label} accessible accessibilityLabel={`${label}: ${value}`} style={{alignItems:'center',flex:1}}>
        <ThemedText numeric style={{fontWeight:'600'}}>{value}</ThemedText>
        <ThemedText muted variant="caption" style={{textAlign:'center'}}>{label}</ThemedText>
      </View>)}
    </Panel>}
    {last&&change===null&&<ThemedText muted variant="caption">{t('bodyWeekEmpty')}</ThemedText>}
    <Button label={t('bodyLog')} disabled={entry} onPress={()=>{setEntry(true);setSaved(false);}}/>
    {entry&&<WeightEntry key={unit} initial={lastKg===null?null:fromKg(lastKg,unit)} unit={unit} onClose={()=>setEntry(false)} onSave={value=>{saveWeighIn(repo,value,unit);setEntry(false);setSaved(true);}}/>}
    {saved&&<ThemedText accessibilityLiveRegion="polite">{t('bodySaved')}</ThemedText>}
    {deleteFailed&&<ThemedText accessibilityRole="alert">{t('bodyDeleteFailed')}</ThemedText>}
    {deleteRows.length>0&&<Panel testID="body-entries" style={{gap:0}}>
      <ThemedText variant="headline" accessibilityRole="header">{t('bodyEntries')}</ThemedText>
      {deleteRows.map((row,index)=>{
        const value=fromKg(Number(row.data.weight_kg),unit).toFixed(1),day=String(row.data.day);
        return <View key={row.id} style={{flexDirection:'row',alignItems:'center',minHeight:48,borderTopWidth:index?1:0,borderColor:colors['surface-2']}}>
          <ThemedText numeric style={{flex:1}}>{day} · {value} {unit}</ThemedText>
          <Pressable testID={`body-delete-${row.id}`} accessibilityRole="button" hitSlop={4}
            accessibilityLabel={t('bodyDeleteLabel').replace('{day}',day).replace('{value}',value).replace('{unit}',unit)}
            onPress={()=>Alert.alert(t('bodyDeleteConfirm').replace('{day}',day),undefined,[
              {text:t('cancel'),style:'cancel'},
              {text:t('bodyDelete'),style:'destructive',onPress:()=>{try{const deleted=deleteWeighIn(repo,row.id);setDeleteFailed(!deleted);if(deleted)setSaved(false);}catch{setDeleteFailed(true);}}},
            ])} style={{minHeight:44,minWidth:64,alignItems:'flex-end',justifyContent:'center'}}>
            <ThemedText style={{color:colors.danger,fontWeight:'600'}}>{t('bodyDeleteShort')}</ThemedText>
          </Pressable>
        </View>;})}
    </Panel>}
    {!showAll&&deletable.length>30&&<Button label={t('bodyShowAll')} onPress={()=>setShowAll(true)}/>}
  </View>;
}
