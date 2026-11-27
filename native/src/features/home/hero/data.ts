import { useMemo } from 'react';
import { localDay } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import type { HomeTileData } from '../tiles/data-types';
import { useHomeTileState } from '../tiles/state';
import { useWorkout } from '@/features/workout/use-workout';
import { useNumbersHidden } from '../hide-numbers';
import type { HeroDayIn, HeroGoals, HeroInput } from './model';

/** Goals the hero measures against where the app keeps none: a 60 minute session; 2,200 kcal and 8 hours until set. */
export const HERO_DEFAULT_GOALS: HeroGoals = { kcal: 2200, trainMin: 60, sleepMin: 480 };
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Minutes trained on each of the given local days: finished sessions' own durations, and the running session so far today. */
export function trainingMinutes(store: Pick<WorkoutStore, 'trainingHistory' | 'active'> | null, days: readonly string[], now: Date): (number | null)[] {
  const out = days.map(() => 0), index = new Map(days.map((d, i) => [d, i]));
  if (!store) return out;
  for (const s of store.trainingHistory()) {
    const i = index.get(String(s.data.day));
    if (i === undefined) continue;
    const ms = finite(s.data.duration_ms) && s.data.duration_ms > 0 ? s.data.duration_ms
      : finite(s.data.finished_at) && finite(s.data.started_at) ? s.data.finished_at - s.data.started_at : 0;
    out[i] += Math.max(0, ms) / 60000;
  }
  const live = store.active(), today = days.length - 1;
  if (live && String(live.data.day) === days[today] && finite(live.data.started_at)) out[today] += Math.max(0, now.getTime() - live.data.started_at) / 60000;
  return out.map(m => Math.round(m));
}

/** The last seven local days ending on `now`'s day, oldest first. */
export function lastWeek(now: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))));
}

/** The hero's input from Home's shared tile data (food, sleep, units) and the workout store (minutes trained). */
export function heroInput(data: HomeTileData | null, store: WorkoutStore | null, energy: 'kcal' | 'kJ', now: Date, hide = false): HeroInput {
  const days = lastWeek(now), train = trainingMinutes(store, days, now);
  const last7 = <T,>(list: readonly T[] | undefined | null) => { const l = list ?? []; return days.map((_, i) => l[l.length - 7 + i]); };
  const kcal = last7(data?.calories.series as (number | null)[] | undefined), sleepH = last7(data?.sleep.series as (number | null)[] | undefined);
  const out: HeroDayIn[] = days.map((_, i) => ({
    trainMin: train[i],
    kcal: finite(kcal[i]) ? kcal[i] : null,
    sleepMin: finite(sleepH[i]) && sleepH[i]! > 0 ? Math.round(sleepH[i]! * 60) : null,
  }));
  const goals: HeroGoals = {
    kcal: finite(data?.calories.goal) && data.calories.goal > 0 ? Math.round(data.calories.goal) : HERO_DEFAULT_GOALS.kcal,
    trainMin: HERO_DEFAULT_GOALS.trainMin,
    sleepMin: finite(data?.sleep.need) && data.sleep.need > 0 ? Math.round(data.sleep.need * 60) : HERO_DEFAULT_GOALS.sleepMin,
  };
  return { now, days: out, goals, energy, hide };
}

/** The hero's live input: follows every log, health read and the clock (the tile data refreshes each minute on Home), and
 * Hide numbers with its tap to show. */
export function useHeroInput(now: Date): HeroInput {
  const state = useHomeTileState();
  const { store } = useWorkout();
  const hide = useNumbersHidden();
  const minute = Math.floor(now.getTime() / 60000);
  return useMemo(() => heroInput(state?.data ?? null, store, state?.units.energy ?? 'kcal', new Date(minute * 60000), hide), [state, store, minute, hide]);
}
