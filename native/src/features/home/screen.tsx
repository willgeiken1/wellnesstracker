import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { Button, touchTarget } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { localDay } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { useHomeWidgets, type WidgetId } from '@/features/home-widgets';
import { atlasGeometry, type Side } from '@/features/atlas/geometry';
import { atlasSessions } from '@/features/atlas/read-logs';
import { heatFill, heatmap, rollup, type MuscleVolume } from '@/features/atlas/volume';
import { attributedDay, foodTargets, totals } from '@/features/food/model';
import { useFoodRevision } from '@/features/food/use-food-revision';
import { PlanStore } from '@/features/plans/store';
import { Panel } from '@/features/workout/primitives';
import { useWorkout } from '@/features/workout/use-workout';
import { pluralize, t } from '@/i18n/en';

export const greeting = (hour: number) => t(hour >= 5 && hour < 12 ? 'goodMorning' : hour >= 12 && hour < 18 ? 'goodAfternoon' : 'goodEvening');
const label = { fontWeight: '600' } as const;
const whole = (n: number) => Math.round(n).toLocaleString('en-US');

/** Home (REDESIGN.md §2, I9a): the placed widgets in layout order. Read-only: it starts or resumes a
 * workout through the existing stores and never writes rows itself. Widgets without a renderer yet
 * (Insight Score, tray extras) are skipped rather than shown as empty tiles. */
export function Home() {
  const { store } = useWorkout();
  const { home } = useHomeWidgets(store?.repo);
  const { colors } = useTheme();
  const now = new Date();
  const renderers: Partial<Record<WidgetId, (store: WorkoutStore) => ReactNode>> = {
    bodyMap: s => <BodyMap store={s} />,
    todayWorkout: s => <TodayWorkout store={s} />,
    foodRing: s => <FoodToday store={s} />,
  };
  return <Screen tabHeader>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
      <View style={{ flex: 1 }}>
        <ThemedText muted variant="caption" style={label}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</ThemedText>
        <ThemedText variant="title" accessibilityRole="header">{greeting(now.getHours())}</ThemedText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('openSettings')} onPress={() => router.push('/settings')}
        style={{ width: touchTarget, height: touchTarget, borderRadius: touchTarget / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <Icon name="avatar" size={22} />
      </Pressable>
    </View>
    <Week store={store} />
    {!store && <Freestyle />}
    {store && home.filter(item => !item.locked).map(item => {
      const body = renderers[item.id]?.(store);
      return body ? <View key={item.id} testID={`home-widget-${item.id}`}>{body}</View> : null;
    })}
  </Screen>;
}

// These take the store facade, which is new on every repository revision, so compiled
// memoization re-reads after a save instead of holding the first answer.
function nextRoutine(store: WorkoutStore) {
  const plans = new PlanStore(store.repo), days = plans.read().days;
  return days.length ? store.templates().find(r => r.id === days[plans.nextIndex()]?.routineId) : undefined;
}
function foodRows(store: WorkoutStore, day: string, _revision: number) {
  return store.repo.list('food_entries').filter(r => r.data.day === day);
}
function dayTargets(store: WorkoutStore, day: string, _revision: number) { return foodTargets(store.repo, day).targets; }
function trainedDays(store: WorkoutStore | null) { return new Set((store?.history() ?? []).map(s => String(s.data.day))); }

/** The past seven days. A dot marks a day with a finished workout; today is outlined. */
function Week({ store }: { store: WorkoutStore | null }) {
  const { colors } = useTheme();
  const today = new Date(), trained = trainedDays(store);
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + i));
  return <View accessibilityLabel={t('workoutWeek')} style={{ flexDirection: 'row', gap: 6 }}>
    {days.map((date, i) => {
      const day = localDay(date), isToday = i === 6, done = trained.has(day);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
      const chip = { flex: 1, minHeight: 60, borderRadius: tokens.radii.card, alignItems: 'center', justifyContent: 'center', gap: 2,
        backgroundColor: isToday ? colors.surface : 'transparent', borderWidth: isToday ? 1.5 : 0, borderColor: colors.accent } as const;
      const inside = <>
        <ThemedText muted={!isToday} variant="caption" style={label}>{weekday.slice(0, 1)}</ThemedText>
        <ThemedText numeric muted={!isToday && !done}>{date.getDate()}</ThemedText>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: done ? colors.accent : 'transparent' }} />
      </>;
      const spoken = done ? `, ${t('workoutLogged')}` : '';
      return isToday
        ? <View key={day} accessible accessibilityLabel={`${t('today')}, ${weekday} ${date.getDate()}${spoken}`} style={chip}>{inside}</View>
        : <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${t('viewDayWorkouts').replace('{day}', day)}${spoken}`}
          onPress={() => router.push({ pathname: '/workout/day', params: { day } })} style={chip}>{inside}</Pressable>;
    })}
  </View>;
}

function Figure({ side, values, dark }: { side: Side; values: Map<string, MuscleVolume>; dark: boolean }) {
  const { colors } = useTheme(), geometry = atlasGeometry.male[side];
  return <View style={{ alignItems: 'center', gap: 4 }}>
    <View testID={`home-body-${side}`} style={{ width: 116, aspectRatio: 200 / 440 }}>
      <Svg width="100%" height="100%" viewBox="0 0 200 440" accessible={false}>
        <Path d={geometry.skin} fill={colors['surface-2']} />
        {geometry.muscles.map(path => {
          const value = values.get(path.id);
          return value ? <Path key={path.id} d={path.d} fill={heatFill(value, dark)} fillOpacity={0.65 + 0.35 * value.freshness}
            stroke={colors.surface} strokeWidth={1} strokeLinejoin="round" /> : null;
        })}
      </Svg>
    </View>
    <ThemedText muted variant="caption">{t(side === 'front' ? 'atlasFront' : 'atlasBack')}</ThemedText>
  </View>;
}

/** Home's body map: both sides at a glance and one plain line. The full map, list and controls live on Insights. */
function BodyMap({ store }: { store: WorkoutStore }) {
  const { colors, mode } = useTheme(), dark = mode === 'dark';
  const [now, setNow] = useState(Date.now);
  // useWorkout returns a new facade on repository revisions, including history edits.
  const sessions = useMemo(() => atlasSessions(store), [store]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  const list = useMemo(() => heatmap(sessions, now), [sessions, now]);
  const values = useMemo(() => new Map(list.map(value => [value.key, value])), [list]);
  const groups = Object.values(rollup(list)).filter(sets => sets > 0).length;
  const summary = groups ? t('homeMusclesTrained').replace('{groups}', `${groups} muscle group${groups === 1 ? '' : 's'}`) : t('homeMusclesNone');
  const swatch = (sets: number) => heatFill({ key: '', group: '', sets, lastTrained: null, freshness: 0, target: [10, 20] }, dark);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${t('atlasTitle')}. ${summary}`} accessibilityHint={t('insights')} onPress={() => router.navigate('/insights')}
    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
    <Card style={{ gap: tokens.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <ThemedText variant="headline">{t('atlasTitle')}</ThemedText>
          <ThemedText muted variant="caption">{summary}</ThemedText>
        </View>
        <Icon name="chevron" size={18} color={colors['text-muted']} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing[5] }}>
        <Figure side="front" values={values} dark={dark} /><Figure side="back" values={values} dark={dark} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing[3] }}>
        {([['homeBelow', 1], ['homeOnTarget', 10], ['homeAbove', 21]] as const).map(([key, sets]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: swatch(sets) }} />
          <ThemedText muted variant="caption">{t(key)}</ThemedText>
        </View>)}
      </View>
    </Card>
  </Pressable>;
}

/** One row: what it is, the fact, and a single action on the right. */
function Row({ title, headline, detail, action, lead }: { title: string; headline: ReactNode; detail?: string; action: ReactNode; lead?: ReactNode }) {
  return <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
    {lead}
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText muted variant="caption" style={label}>{title}</ThemedText>
      {typeof headline === 'string' ? <ThemedText variant="headline">{headline}</ThemedText> : headline}
      {!!detail && <ThemedText muted variant="caption">{detail}</ThemedText>}
    </View>
    {action}
  </Panel>;
}

function TodayWorkout({ store }: { store: WorkoutStore }) {
  const [error, setError] = useState(false);
  const next = nextRoutine(store);
  if (store.active()) return <Row title={t('todayWorkout')} headline={t('workoutInProgress')}
    action={<Button label={t('resume')} accessibilityLabel={t('resumeWorkout')} onPress={() => router.push('/workout')} />} />;
  if (!next) return <Freestyle />;
  const name = String(next.data.name);
  return <Row title={t('todayWorkout')} headline={name}
    detail={error ? t('workoutSaveError') : pluralize(store.templateExercises(next.id).length, 'exercise')}
    action={<Button label={t('start')} accessibilityLabel={t('startTemplate').replace('{name}', name)} onPress={() => {
      try { new PlanStore(store.repo).startDay(next.id); setError(false); router.push('/workout'); } catch { setError(true); }
    }} />} />;
}
/** Also shown while local data is still opening, so a start is never out of reach. */
function Freestyle() {
  return <Row title={t('todayWorkout')} headline={t('noRoutinePlanned')}
    action={<Button label={t('start')} accessibilityLabel={t('startFreestyle')} onPress={() => router.push('/workout')} />} />;
}

function FoodToday({ store }: { store: WorkoutStore }) {
  const { colors } = useTheme();
  const revision = useFoodRevision(store.repo), day = attributedDay(), rows = foodRows(store, day, revision);
  const total = totals(rows), target = dayTargets(store, day, revision);
  const kcal = total.energy_kj === null ? null : total.energy_kj / 4.184, goal = target ? target.energy_kj / 4.184 : null;
  const progress = kcal !== null && goal ? Math.min(1, Math.max(0, kcal / goal)) : 0, r = 22, c = 2 * Math.PI * r;
  const ring = <Svg width={56} height={56} viewBox="0 0 56 56" accessible={false}>
    <Circle cx={28} cy={28} r={r} fill="none" stroke={colors['surface-2']} strokeWidth={6} />
    {progress > 0 && <Circle cx={28} cy={28} r={r} fill="none" stroke={colors.accent} strokeWidth={6} strokeLinecap="round"
      strokeDasharray={`${c * progress} ${c}`} transform="rotate(-90 28 28)" />}
  </Svg>;
  const log = <Button label={t('log')} accessibilityLabel={t('logFood')} variant={rows.length ? 'secondary' : 'primary'} onPress={() => router.push('/food')} />;
  if (!rows.length) return <Row lead={ring} title={t('foodToday')} headline={t('nothingLogged')} action={log} />;
  const value = (n: number | null) => n === null ? '—' : String(Math.round(n));
  const spoken = t('foodRing').replace('{calories}', value(kcal)).replace('{target}', goal ? String(Math.round(goal)) : '—')
    .replace('{protein}', value(total.protein_g)).replace('{carbs}', value(total.carbs_g)).replace('{fat}', value(total.fat_g));
  return <Row lead={ring} title={t('foodToday')} action={log}
    headline={<View accessible accessibilityLabel={spoken} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <ThemedText numeric style={{ fontSize: 24 }}>{kcal === null ? '—' : whole(kcal)}</ThemedText>
      <ThemedText muted variant="caption">{goal ? t('homeKcalOf').replace('{target}', whole(goal)) : 'kcal'}</ThemedText>
    </View>}
    detail={`${t('homeProtein')} ${value(total.protein_g)} g · ${t('homeCarbs')} ${value(total.carbs_g)} g · ${t('homeFat')} ${value(total.fat_g)} g`} />;
}
