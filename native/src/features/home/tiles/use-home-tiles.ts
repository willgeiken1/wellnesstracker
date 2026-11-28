import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { cachedReads } from '@/data/read-cache';
import { WorkoutStore } from '@/data/workout/store';
import type { Repository } from '@/data/repository';
import { addWater } from '@/features/food/actions';
import { attributedDay, deleteFood, recentFoods, saveFood } from '@/features/food/model';
import { quickContainers, readWater } from '@/features/food/water';
import { logForToday } from '@/features/food/selection';
import { appleHealth } from '@/features/health/apple';
import type { HealthDays } from '@/features/health/days';
import type { OuraRecovery } from '@/features/health/oura';
import type { RecoveryRead } from '@/features/health/use-recovery';
import { weekScores } from '@/features/score/days';
import { STEP_GOAL } from '@/features/score/model';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { showToast } from '@/features/shell/toast';
import { t } from '@/i18n/en';
import type { HealthDetailIn, HomeInput, RecoveryIn } from './data';
import { readHealthDetail } from './health-detail';
import { readAppData, windowDays } from './read';
import { buildState, setHomeTileState, type HomeTileState } from './state';
import { DEFAULT_UNITS } from './studio';
import { weightGoalKg } from '@/features/settings/goals-data';

/** Daily goals the tiles measure against until the app keeps its own for these readings. */
export const HOME_GOALS: HomeInput['goals'] = { steps: STEP_GOAL, exercise: 30, active: 500, sleepHours: 8, mindful: 10 };
/** Home's goals with the two the person sets in Settings, Goals: sleep (minutes) and daily training, which the Exercise tile measures against. */
export function homeGoals(sleepMin: number, trainMin: number): HomeInput['goals'] {
  const ok = (v: number) => Number.isFinite(v) && v > 0;
  return { ...HOME_GOALS, sleepHours: ok(sleepMin) ? sleepMin / 60 : HOME_GOALS.sleepHours, exercise: ok(trainMin) ? Math.round(trainMin) : HOME_GOALS.exercise };
}

/** HRV, resting heart rate and sleep score from one source only: Oura when it is connected, otherwise Apple Health. */
export function pickRecovery(oura: OuraRecovery | null, apple: RecoveryRead): RecoveryIn | null {
  if (oura) return { hrv: oura.hrv, rhr: oura.restingHeartRate, sleepScore: oura.sleepScore, source: 'Oura' };
  if (apple.recovery) return { hrv: apple.recovery.hrv, rhr: apple.recovery.restingHeartRate, sleepScore: null, source: 'Apple Health' };
  return null;
}

/** Last night's stages and bedtimes come from Apple Health; with Oura as the sleep source they would describe another night's
 * reading, so they are left out and the tile says why. */
export function detailFor(detail: HealthDetailIn | null, ouraSleep: boolean, ouraSteps = false): HealthDetailIn | null {
  if (!detail || (!ouraSleep && !ouraSteps)) return detail;
  return { ...detail, ...(ouraSleep ? { night: null, bedtimes: null } : {}), ...(ouraSteps ? { stepsHourly: null } : {}) };
}

const named = (from: 'oura' | 'apple' | null | undefined) => from === 'oura' ? 'Oura' : from === 'apple' ? 'Apple Health' : null;

/** Where today's steps and last night's sleep came from, read from the day the tile shows rather than from which
 * services are connected, so a day filled from the other source is labelled by it. Apple Health's hourly steps and
 * last night's stages describe Apple Health's reading, so they are left out when the shown total is Oura's. */
export function todaySources(health: Pick<HealthDays, 'stepsFrom' | 'sleepFrom'> | null, oura: boolean, appleAccess: string | null) {
  const steps = named(health?.stepsFrom?.at(-1)) ?? (appleAccess === 'asked' || !oura ? 'Apple Health' : 'Oura');
  const sleep = named(health?.sleepFrom?.at(-1)) ?? (oura ? 'Oura' : 'Apple Health');
  return { steps, sleep, ouraSteps: steps === 'Oura', ouraSleep: sleep === 'Oura' };
}

/** Today's finer Apple Health readings, read when Home comes to the front and when the app is reopened. Memory only. */
function useHealthDetail(focused: boolean, refresh: unknown): HealthDetailIn | null {
  const source = useMemo(() => appleHealth(), []);
  const [detail, setDetail] = useState<HealthDetailIn | null>(null);
  useEffect(() => {
    if (!source || !focused) return;
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, now = new Date();
      readHealthDetail(source, windowDays(now), now).catch(() => null).then(value => { if (live && mine === latest) setDetail(value); });
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, focused, refresh]);
  return detail;
}

/**
 * One-tap logging from inside the tiles: a container of water goes into today's water, through the same model the Food tab
 * uses; a recent food goes into the meal due next. Both say so with Undo.
 */
export function homeTileAction(repo: Repository | null, nextMeal: HomeInput['nextMeal'], data: Record<string, string>) {
  if (data.ql === 'water') {
    const c = repo ? quickContainers(readWater(repo)).find(x => x.id === data.wc) : undefined;
    if (repo && c) addWater(repo, attributedDay(), { c });
    else { logForToday(); router.push('/food/water' as unknown as Href); }
    return;
  }
  // A meal slot opens the log on that meal, not the one due next (breakfast tapped after breakfast is still breakfast).
  if (data.ql === 'meal') logForToday();
  if (data.ql === 'meal' && data.meal) { router.push({ pathname: '/food/log', params: { meal: String(data.meal) } } as unknown as Href); return; }
  if (data.ql === 'meal' || !repo || !nextMeal) { logForToday(); router.push('/food/log' as unknown as Href); return; }
  if (data.ql !== 'food') return;
  const wanted = String(data.food ?? '').trim().toLowerCase();
  const food = recentFoods(repo).find(f => String(f.name ?? '').trim().toLowerCase() === wanted);
  if (!food) { showToast(t('homeFoodNotSaved'), { color: 'warning' }); return; }
  try {
    const row = saveFood(repo, attributedDay(), nextMeal.id, food);
    const name = String(food.name), meal = nextMeal.name.toLowerCase();
    showToast(t('homeFoodAdded').replace('{name}', name).replace('{meal}', meal), {
      color: 'food',
      action: { label: t('homeUndo'), onAction: () => {
        try { deleteFood(repo, row.id); showToast(t('homeFoodRemoved').replace('{meal}', meal), { color: 'food' }); } catch { /* already gone */ }
      } },
    });
  } catch {
    showToast(t('homeFoodNotSaved'), { color: 'warning' });
  }
}

export interface HomeTileSources {
  store: WorkoutStore | null;
  focused: boolean;
  health: HealthDays | null;
  apple: RecoveryRead;
  oura: OuraRecovery | null;
}

/**
 * Builds Home's tile data from the stores and health readings and shares it with every Home tile. Re-reads when the
 * repository changes, when health readings land, and once a minute while Home is in front.
 */
export function useHomeTiles({ store, focused, health, apple, oura }: HomeTileSources): HomeTileState | null {
  const detailRaw = useHealthDetail(focused, health);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    if (!focused) return;
    const tick = () => setMinute(Math.floor(Date.now() / 60_000));
    // Coming back to Home reads the clock at once, then every 15 s, so the day and the times shown are never a minute behind.
    const first = setTimeout(tick, 0), id = setInterval(tick, 15_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [focused]);
  const reader = useMemo(() => store ? new WorkoutStore(cachedReads(store.repo), store.viewRevision) : null, [store]);
  const repo = store?.repo ?? null;
  // The Apple read is a new object on each draw until it lands, so only its parts are watched.
  const appleAccess = apple.access, appleRecovery = apple.recovery;
  const prefs = useSettingsPrefs()[0], hide = prefs.priv.hide, sleepGoal = prefs.goals.sleep, trainGoal = prefs.goals.train, energy = prefs.units.energy, clock = prefs.units.clock;
  const state = useMemo(() => {
    if (!reader) return null;
    const now = new Date(minute * 60_000);
    const today = todaySources(health, !!oura, appleAccess);
    const app = readAppData(reader, now, health);
    const recovery = pickRecovery(oura, { access: appleAccess, recovery: appleRecovery });
    const input: HomeInput = {
      now, ...app, weightGoalKg: weightGoalKg(reader.repo),
      health: health ? { steps: health.steps, activeKcal: health.activeKcal, exerciseMinutes: health.exerciseMinutes, sleepHours: health.sleepHours, mindfulMinutes: health.mindfulMinutes } : null,
      detail: detailFor(detailRaw, today.ouraSleep, today.ouraSteps), recovery,
      sources: { activity: appleAccess === 'asked' || !oura ? 'Apple Health' : 'Oura', steps: today.steps, sleep: today.sleep, body: 'Apple Health' },
      goals: homeGoals(sleepGoal, trainGoal),
    };
    const nextMeal = input.nextMeal;
    const scores = weekScores(reader, now, health);
    return { ...buildState(input, { ...DEFAULT_UNITS, weight: app.weightUnit, energy: energy === 'kJ' ? 'kJ' : 'kcal', clock: clock === '24' ? '24' : '12' }, data => homeTileAction(repo, nextMeal, data), hide), scores };
  }, [reader, repo, minute, health, detailRaw, appleAccess, appleRecovery, oura, hide, sleepGoal, trainGoal, energy, clock]);
  useEffect(() => { setHomeTileState(state); }, [state]);
  return state;
}
