import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import type { WorkoutStore } from '@/data/workout/store';
import { useHomeWidgets, type WidgetId } from '@/features/home-widgets';
import { BodyAtlas } from '@/features/atlas/body-atlas';
import { atlasSessions } from '@/features/atlas/read-logs';
import { CalorieRing } from '@/features/food/ring';
import { attributedDay, foodTargets, totals } from '@/features/food/model';
import { useFoodRevision } from '@/features/food/use-food-revision';
import { PlanStore } from '@/features/plans/store';
import { WeekStrip } from '@/features/workout/days';
import { Panel } from '@/features/workout/primitives';
import { useWorkout } from '@/features/workout/use-workout';
import { pluralize, t } from '@/i18n/en';

/** Home (REDESIGN.md §2, I9a): the placed widgets in layout order. Read-only: it starts or resumes a
 * workout through the existing stores and never writes rows itself. Widgets without a renderer yet
 * (Insight Score, tray extras) are skipped rather than shown as empty tiles. */
export function Home() {
  const { store } = useWorkout();
  const { home } = useHomeWidgets(store?.repo);
  const renderers: Partial<Record<WidgetId, (store: WorkoutStore) => ReactNode>> = {
    bodyMap: s => <BodyMap store={s} />,
    todayWorkout: s => <TodayWorkout store={s} />,
    foodRing: s => <FoodToday store={s} />,
  };
  return <Screen title={t('home')} tabHeader>
    <WeekStrip />
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

function BodyMap({ store }: { store: WorkoutStore }) {
  const [now, setNow] = useState(Date.now);
  // useWorkout returns a new facade on repository revisions, including history edits.
  const sessions = useMemo(() => atlasSessions(store), [store]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  return <Card><BodyAtlas compact sessions={sessions} now={now} haptics={store.repo.localGet<boolean>('haptics') !== false} /></Card>;
}

function TodayWorkout({ store }: { store: WorkoutStore }) {
  const [error, setError] = useState(false);
  const next = nextRoutine(store);
  const title = <ThemedText muted variant="caption" style={{ fontWeight: '600' }}>{t('todayWorkout')}</ThemedText>;
  if (store.active()) return <Panel>{title}
    <ThemedText variant="headline">{t('workoutInProgress')}</ThemedText>
    <Button label={t('resumeWorkout')} onPress={() => router.push('/workout')} />
  </Panel>;
  if (next) {
    const name = String(next.data.name);
    return <Panel>{title}
      <ThemedText variant="headline">{name}</ThemedText>
      <ThemedText muted>{pluralize(store.templateExercises(next.id).length, 'exercise')}</ThemedText>
      {error && <ThemedText accessibilityRole="alert">{t('workoutSaveError')}</ThemedText>}
      <Button label={t('startTemplate').replace('{name}', name)} onPress={() => {
        try { new PlanStore(store.repo).startDay(next.id); setError(false); router.push('/workout'); } catch { setError(true); }
      }} />
    </Panel>;
  }
  return <Freestyle />;
}
/** Also the whole of Home while local data is still opening, so a start is never out of reach. */
function Freestyle() {
  return <Panel>
    <ThemedText muted variant="caption" style={{ fontWeight: '600' }}>{t('todayWorkout')}</ThemedText>
    <ThemedText variant="headline">{t('noRoutinePlanned')}</ThemedText>
    <Button label={t('startFreestyle')} onPress={() => router.push('/workout')} />
  </Panel>;
}

function FoodToday({ store }: { store: WorkoutStore }) {
  const revision = useFoodRevision(store.repo), day = attributedDay(), rows = foodRows(store, day, revision);
  return <Panel>
    <ThemedText muted variant="caption" style={{ fontWeight: '600' }}>{t('foodToday')}</ThemedText>
    {rows.length ? <CalorieRing total={totals(rows)} target={dayTargets(store, day, revision)} />
      : <ThemedText variant="headline">{t('nothingLogged')}</ThemedText>}
    <Button label={t('logFood')} variant={rows.length ? 'secondary' : 'primary'} onPress={() => router.push('/food')} />
  </Panel>;
}
