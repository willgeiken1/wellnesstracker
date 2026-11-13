import { useState } from 'react';
import { Screen } from '@/components/screen';
import { Panel } from '@/components/card';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { tokens } from '@/design/tokens';
import { t, type MessageKey } from '@/i18n/en';
/** A tab whose content is not built yet: the title, its sections if any, and one plain line saying so. */
export function TabPlaceholder({ title, segments }: { title: MessageKey; segments?: readonly MessageKey[] }) {
  const [selected, setSelected] = useState(segments?.[0]);
  return <Screen title={t(title)} tabHeader>
    {segments && selected && <SegmentedControl label={t('segments')}
      options={segments.map(value => ({ value, label: t(value) }))} value={selected} onChange={setSelected} />}
    <Panel testID="tab-empty" style={{ borderRadius: 18, padding: tokens.spacing[3] }}>
      {/* The screen title already names the tab, so a heading appears only for a chosen section. */}
      {selected && <ThemedText variant="headline" accessibilityRole="header" style={{ fontWeight: '600' }}>{t(selected)}</ThemedText>}
      <ThemedText muted>{t('placeholderBody')}</ThemedText>
    </Panel>
  </Screen>;
}
