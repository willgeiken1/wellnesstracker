import type { HealthDays } from '@/features/health/days';

/** Hours slept on the sample week's six nights before last night, oldest first, from the design's example week. */
const WEEK_HOURS = [5.6, 7.2, 6.4, 8, 7.6, 8.16];
/** Last night in the example week: 6 h 53 m. */
const LAST_NIGHT_HOURS = 413 / 60;

const anySleep = (h: HealthDays | null) => !!h?.sleepHours?.some(v => typeof v === 'number' && v > 0);

/**
 * Sample data has no Apple Health or Oura, and the app stores no sleep of its own, so the example week would show
 * "No data" for sleep on every day. While the owner is the sample-data one and no real sleep was read, Home gets the
 * example week's nights instead. Made up, held in memory only, never saved, synced or sent.
 */
export function withDemoSleep(health: HealthDays | null, owner: string | null | undefined, days: number): HealthDays | null {
  if (owner !== 'demo' || anySleep(health) || days < 1) return health;
  const week = [...WEEK_HOURS, LAST_NIGHT_HOURS].slice(-days);
  const sleepHours = [...Array.from({ length: days - week.length }, () => null), ...week];
  return {
    steps: null, activeKcal: null, exerciseMinutes: null, waterMl: null, mindfulMinutes: null, bodyFat: null,
    ...health,
    sleepHours,
  };
}
