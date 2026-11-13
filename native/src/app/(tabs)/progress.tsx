import { useState } from 'react';
import { useAuth } from '@/auth/provider';
import { Panel } from '@/components/card';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Body } from '@/features/body/screen';
import { Records } from '@/features/progress/records-screen';
import { t } from '@/i18n/en';
export default function Page() {
  const {repository}=useAuth();
  const [selected,setSelected]=useState<'body'|'photos'|'goals'>('body');
  return <Screen title={t('progress')} tabHeader>
    <SegmentedControl label={t('segments')} value={selected} options={(['body','photos','goals'] as const).map(value=>({value,label:t(value)}))} onChange={setSelected}/>
    {selected==='body' && repository && <Body key={repository.owner} repository={repository}/>}
    {selected==='goals' && repository && <Records key={repository.owner} repository={repository}/>}
    {selected==='photos' && <Panel testID="photos-later">
      <ThemedText variant="headline" accessibilityRole="header">{t('photosLaterTitle')}</ThemedText>
      <ThemedText muted>{t('photosLaterBody')}</ThemedText>
    </Panel>}
  </Screen>;
}
