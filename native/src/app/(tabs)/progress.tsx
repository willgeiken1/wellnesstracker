import { useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { Body } from '@/features/body/screen';
import { t } from '@/i18n/en';
export default function Page() {
  const {repository}=useAuth();
  const [selected,setSelected]=useState<'body'|'photos'|'goals'>('body');
  return <Screen title={t('progress')} tabHeader>
    <SegmentedControl label={t('segments')} value={selected} options={(['body','photos','goals'] as const).map(value=>({value,label:t(value)}))} onChange={setSelected}/>
    {selected==='body' ? repository&&<Body key={repository.owner} repository={repository}/> : <EmptyState title={t(selected)} action={{label:t('backHome'),onPress:()=>router.navigate('/')}}/>}
  </Screen>;
}
