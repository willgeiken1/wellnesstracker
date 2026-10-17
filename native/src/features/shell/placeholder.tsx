import { useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/empty-state';
import { SegmentedControl } from '@/components/segmented-control';
import { t, type MessageKey } from '@/i18n/en';
export function TabPlaceholder({ title, segments }: { title: MessageKey; segments?: readonly MessageKey[] }) {
  const [selected, setSelected] = useState(segments?.[0]);
  return <Screen title={t(title)} tabHeader>
    {segments && selected && <SegmentedControl label={t('segments')}
      options={segments.map(value => ({ value, label: t(value) }))} value={selected} onChange={setSelected} />}
    <EmptyState title={t(selected ?? title)} action={{ label: t('backHome'), onPress: () => router.navigate('/') }} />
  </Screen>;
}
