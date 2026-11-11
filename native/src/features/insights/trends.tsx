import { View } from 'react-native';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { fromKg } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { useFoodRevision } from '@/features/food/use-food-revision';
import { t } from '@/i18n/en';
import { average, dayPoints, hasAny, lastDays, weekDays, weekReport } from './model';
import { MiniChart } from './mini-chart';

const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const short = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const semibold = { fontWeight: '600' } as const;

function Empty() {
  return <Card testID="insights-empty">
    <ThemedText variant="headline" style={semibold}>{t('insightsEmpty')}</ThemedText>
    <ThemedText muted>{t('insightsEmptyBody')}</ThemedText>
  </Card>;
}
function ChartCard({ title, summary, children, testID }: { title: string; summary: string; children: React.ReactNode; testID: string }) {
  return <Card testID={testID} accessible accessibilityRole="image" accessibilityLabel={`${title}. ${summary}`} style={{ gap: tokens.spacing[1] }}>
    <ThemedText variant="headline" style={semibold}>{title}</ThemedText>
    <ThemedText muted numeric variant="caption">{summary}</ThemedText>
    {children}
  </Card>;
}

/** Trends: the last 14 days of calories, training volume and protein, from what was logged. */
export function Trends({ store, now }: { store: WorkoutStore; now: Date }) {
  const { mode } = useTheme(), revision = useFoodRevision(store.repo), unit = store.unit();
  const days = lastDays(14, now), points = dayPoints(store, days, revision);
  if (!hasAny(points)) return <Empty />;
  const food = tokens.color.pillar.food[mode], training = tokens.color.pillar.training[mode];
  const first = short(days[0]), last = short(days.at(-1)!), today = points.at(-1)!;
  const kcal = points.map(p => p.kcal), protein = points.map(p => p.protein), volume = points.map(p => p.workouts ? fromKg(p.volumeKg, unit) : null);
  const logged = kcal.filter(v => v !== null).length, sessions = points.reduce((n, p) => n + p.workouts, 0);
  const of = (text: string, values: (number | null)[], suffix: string) => {
    const mean = average(values.filter((v): v is number => v !== null));
    return mean === null ? t('insightsNoneLogged') : text.replace('{value}', `${whole(mean)} ${suffix}`);
  };
  return <View style={{ gap: tokens.spacing[3] }}>
    <ChartCard testID="trend-calories" title={t('insightsCalories')} summary={`${of(t('insightsAverage'), kcal, 'kcal')} · ${t('insightsDaysLogged').replace('{count}', String(logged)).replace('{days}', '14')}`}>
      <MiniChart values={kcal} goal={today.targetKcal} color={food} first={first} last={last} />
    </ChartCard>
    <ChartCard testID="trend-volume" title={t('insightsVolume')} summary={sessions ? `${t('insightsWorkouts').replace('{count}', String(sessions))} · ${whole(fromKg(points.reduce((n, p) => n + p.volumeKg, 0), unit))} ${unit}` : t('insightsNoneLogged')}>
      <MiniChart values={volume} bars color={training} first={first} last={last} />
    </ChartCard>
    <ChartCard testID="trend-protein" title={t('insightsProtein')} summary={of(t('insightsAverage'), protein, 'g')}>
      <MiniChart values={protein} goal={today.targetProtein} color={food} first={first} last={last} />
    </ChartCard>
    <ThemedText muted variant="caption">{t('insightsGoalHint')}</ThemedText>
  </View>;
}

/** Weekly: Monday to today in numbers, from what was logged. */
export function Weekly({ store, now }: { store: WorkoutStore; now: Date }) {
  const revision = useFoodRevision(store.repo), unit = store.unit();
  const days = weekDays(now), points = dayPoints(store, days, revision);
  const report = weekReport(points);
  const rows = [
    ['weeklyWorkouts', String(report.workouts)],
    ['weeklyVolume', report.workouts ? `${whole(fromKg(report.volumeKg, unit))} ${unit}` : '—'],
    ['weeklyFoodDays', t('weeklyOf').replace('{count}', String(report.foodDays)).replace('{days}', String(report.days))],
    ['weeklyOnTarget', report.targetDays ? t('weeklyOf').replace('{count}', String(report.onTargetDays)).replace('{days}', String(report.targetDays)) : '—'],
    ['weeklyAvgKcal', report.avgKcal === null ? '—' : `${whole(report.avgKcal)} kcal`],
    ['weeklyAvgProtein', report.avgProtein === null ? '—' : `${whole(report.avgProtein)} g`],
  ] as const;
  const { colors } = useTheme();
  return <View style={{ gap: tokens.spacing[3] }}>
    <Card testID="weekly-report" style={{ gap: 0 }}>
      <ThemedText muted variant="caption">{t('weeklyOfDate').replace('{day}', short(days[0]))}</ThemedText>
      <ThemedText variant="headline" style={[semibold, { marginBottom: tokens.spacing[1] }]}>
        {hasAny(points) ? t('weeklyHeadline').replace('{workouts}', String(report.workouts)).replace('{days}', String(report.foodDays)) : t('weeklyNothing')}
      </ThemedText>
      {rows.map(([label, value]) => <View key={label} accessible accessibilityLabel={`${t(label)}: ${value}`}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: 1, borderColor: colors['surface-2'] }}>
        <ThemedText style={{ flex: 1 }}>{t(label)}</ThemedText>
        <ThemedText numeric style={semibold}>{value}</ThemedText>
      </View>)}
    </Card>
    <ThemedText muted variant="caption">{t('weeklyHint')}</ThemedText>
  </View>;
}
