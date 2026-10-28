import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { SegmentedControl } from '@/components/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { t } from '@/i18n/en';
import { useWorkout } from '@/features/workout/use-workout';
import { BodyAtlas } from '@/features/atlas/body-atlas';
import { atlasSessions } from '@/features/atlas/read-logs';
export default function Page() {
 const {store}=useWorkout();
 const [now,setNow]=useState(Date.now);
 const [section,setSection]=useState('trends');
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),60000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active') setNow(Date.now());});
  return ()=>{clearInterval(timer);sub.remove();};
 },[]);
 return <Screen title={t('insights')} tabHeader>
  <SegmentedControl label={t('segments')} options={(['trends','recovery','weekly'] as const).map(value=>({value,label:t(value)}))} value={section} onChange={setSection}/>
  {section==='trends'?<BodyAtlas sessions={atlasSessions(store)} now={now} haptics={store?.repo.localGet<boolean>('haptics')!==false}/>:<EmptyState title={t(section==='recovery'?'recovery':'weekly')} action={{label:t('backHome'),onPress:()=>router.navigate('/')}}/>}
  {section==='trends'&&<Button label={t('backHome')} variant="secondary" onPress={()=>router.navigate('/')}/>}
 </Screen>;
}
