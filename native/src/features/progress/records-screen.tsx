import { useMemo } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { useWorkoutStore } from '../workout/use-workout';
import { lifetime, liftRecords } from './records';

const whole = (n: number) => Math.round(n).toLocaleString('en-US');
/** Goals & PRs: the best lift for each exercise as a binder of cards, then lifetime totals. Read-only. */
export function Records({ repository }: { repository: Repository }) {
  const store = useWorkoutStore(repository), { colors } = useTheme();
  const records = useMemo(() => liftRecords(store), [store]), totals = useMemo(() => lifetime(store), [store]);
  const rows = [
    ['recordsWorkouts', whole(totals.workouts)],
    ['recordsSets', whole(totals.sets)],
    ['recordsVolume', `${whole(totals.volume)} ${totals.unit}`],
    ['recordsCount', whole(records.length)],
  ] as const;
  return <View style={{ gap: tokens.spacing[3] }}>
    <ThemedText variant="headline" accessibilityRole="header">{t('recordsTitle').replace('{count}', String(records.length))}</ThemedText>
    {records.length === 0
      ? <Card testID="records-empty"><ThemedText>{t('recordsEmpty')}</ThemedText><ThemedText muted variant="caption">{t('recordsEmptyBody')}</ThemedText></Card>
      : <View testID="records-binder" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
        {records.map(record => <View key={record.exercise} testID="record-card" accessible
          accessibilityLabel={t('recordLabel').replace('{exercise}', record.exercise).replace('{weight}', String(record.weight)).replace('{unit}', record.unit).replace('{day}', record.day)}
          style={{ flexGrow: 1, flexBasis: '45%', minHeight: 104, padding: tokens.spacing[2], gap: tokens.spacing[0], borderRadius: tokens.radii.card,
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors['hair-2'], borderTopWidth: 3, borderTopColor: colors.training }}>
          <ThemedText numberOfLines={2} style={{ fontWeight: '600' }}>{record.exercise}</ThemedText>
          <View style={{ flex: 1 }} />
          <ThemedText numeric style={{ fontSize: 24, lineHeight: 28, fontWeight: '600' }}>{record.weight}<ThemedText muted> {record.unit}</ThemedText></ThemedText>
          <ThemedText muted numeric variant="caption">{record.day}</ThemedText>
        </View>)}
        {records.length % 2 === 1 && <View style={{ flexGrow: 1, flexBasis: '45%' }} />}
      </View>}
    <ThemedText variant="headline" accessibilityRole="header">{t('recordsLifetime')}</ThemedText>
    <Card testID="records-lifetime" style={{ gap: 0, paddingVertical: tokens.spacing[1] }}>
      {rows.map(([label, value], index) => <View key={label} accessible accessibilityLabel={`${t(label)}: ${value}`}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: index ? 1 : 0, borderColor: colors.hair }}>
        <ThemedText style={{ flex: 1 }}>{t(label)}</ThemedText>
        <ThemedText numeric style={{ fontWeight: '600' }}>{value}</ThemedText>
      </View>)}
    </Card>
    <ThemedText muted variant="caption">{t('recordsGoalsLater')}</ThemedText>
  </View>;
}
