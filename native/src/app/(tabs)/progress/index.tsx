import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Body } from '@/features/body/screen';
import { ProgressCollection } from '@/features/body/collections';
import { ExampleTag, LoadingPanels, LoadError, ReadBoundary } from '@/features/body/presentation';
import { t } from '@/i18n/en';
export default function Page() {
 const auth = useAuth();
 const [selected, setSelected] = useState<'body' | 'photos' | 'goals'>('body');
 return <Screen title={t('progress')} tabHeader>
  {auth.demo && <ExampleTag />}
  {auth.syncStatus === 'offline' && <ThemedText muted variant="caption">Offline · logs save here and sync when you reconnect.</ThemedText>}
  <SegmentedControl label={t('segments')} value={selected} options={(['body', 'photos', 'goals'] as const).map(value => ({ value, label: t(value) }))} onChange={setSelected} />
  {auth.recovery ? <LoadError name="progress" onRetry={() => auth.retryBoot?.()} /> : auth.ready === false || !auth.repository ? <LoadingPanels /> :
   <ReadBoundary key={`${auth.repository.owner}:${selected}`} name="progress"><View>
    {selected === 'body' ? <Body repository={auth.repository} /> : <ProgressCollection repository={auth.repository} section={selected} />}
   </View></ReadBoundary>}
  <Button label={t('backHome')} variant="secondary" onPress={() => router.navigate('/')} />
 </Screen>;
}
