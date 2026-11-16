import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { SegmentedControl } from '@/components/segmented-control';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';
import { useWorkout } from '@/features/workout/use-workout';
import { BodyAtlas } from '@/features/atlas/body-atlas';
import { atlasSessions } from '@/features/atlas/read-logs';
import { Trends, Weekly } from '@/features/insights/trends';
import { Recovery } from '@/features/insights/recovery';
import { useRecovery } from '@/features/health/use-recovery';
import { useFocused } from '@/features/home/use-focused';
const SECTIONS = ['trends', 'recovery', 'muscles', 'weekly'] as const;
export default function Page() {
 const {store}=useWorkout();
 const [now,setNow]=useState(Date.now);
 const [section,setSection]=useState<(typeof SECTIONS)[number]>('trends');
 // useWorkout returns a new facade on repository revisions, including history edits.
 const sessions=useMemo(()=>atlasSessions(store),[store]);
 // Read only while Recovery is the section in front, so the other sections never touch Apple Health.
 const focused=useFocused();
 const recovery=useRecovery(focused&&section==='recovery');
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),60000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active') setNow(Date.now());});
  return ()=>{clearInterval(timer);sub.remove();};
 },[]);
 const today=useMemo(()=>new Date(now),[now]);
 return <Screen title={t('insights')} tabHeader>
  <SegmentedControl label={t('segments')} options={SECTIONS.map(value=>({value,label:t(value)}))} value={section} onChange={setSection}/>
  {section==='trends'&&store&&<Trends store={store} now={today}/>}
  {section==='weekly'&&store&&<Weekly store={store} now={today}/>}
  {section==='muscles'&&<BodyAtlas sessions={sessions} now={now} haptics={store?.repo.localGet<boolean>('haptics')!==false}/>}
  {section==='recovery'&&<Recovery access={recovery.access} recovery={recovery.recovery} now={today}/>}
 </Screen>;
}
