import type { Unit } from '@/features/onboarding/model';
import { t } from '@/i18n/en';
import { fill, wtS } from './format';
import { addDays, emptyProgress, HISTORY, LB, IN, parseDay, type Daily, type ProgressData, type Stage } from './model';

/**
 * The sample numbers Look around first shows on Progress: made-up, never anyone's, and the same set the design was drawn
 * with. Days are counted back from today, so the sample always ends today. Nothing here is saved.
 */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gen(seed: number, n: number, base: number, amp: number, dec = 0) {
  const r = rng(seed), out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Number((base + (r() - 0.5) * 2 * amp).toFixed(dec)));
  return out;
}
const kg = (lb: number) => lb / LB;
/** A 365-day list: the last `recent` values as given, and each older day its month's value from `year` (12 months, this month last). */
function history(today: string, recent: readonly (number | null)[], year: readonly (number | null)[] | null): Daily {
  const out: Daily = Array(HISTORY).fill(null), t0 = parseDay(today);
  for (let i = 0; i < HISTORY; i++) {
    const back = HISTORY - 1 - i;
    if (back < recent.length) { out[i] = recent[recent.length - 1 - back]; continue; }
    if (!year) continue;
    const d = parseDay(addDays(today, -back)), months = (t0.getFullYear() - d.getFullYear()) * 12 + t0.getMonth() - d.getMonth();
    out[i] = months <= 11 ? year[11 - months] : null;
  }
  return out;
}
const HYP: (readonly [Stage, number])[] = [['awake', 6], ['core', 28], ['deep', 34], ['core', 30], ['rem', 18], ['awake', 3], ['core', 36], ['deep', 26], ['core', 34], ['rem', 24], ['awake', 4], ['core', 40], ['deep', 12], ['core', 28], ['rem', 30], ['awake', 5], ['core', 25], ['rem', 22], ['awake', 8]];

export function sampleProgress(today: string, unit: Unit, now = Date.now()): ProgressData {
  const d = emptyProgress(today, unit, now), back = (n: number) => addDays(today, -n);
  const N10 = Array(10).fill(null);
  const scoreWeek = [78, 74, 92, 81, 88, 85, 63], kcalWeek = [2140, 2310, 1980, 2260, 2050, 2410, 1364], minWeek = [52, 0, 61, 48, 0, 55, 24];
  const sleepWeek = [7.4, 8.1, 6.9, 7.6, 8.3, 7.9, 6.88], hrv = [52, 57, 49, 55, 58, 56, 54], rhr = [57, 55, 58, 56, 55, 55, 56];
  const steps = [9120, 6480, 11250, 8340, 5960, 10410, 7940];
  const weight30 = [184.4, 184.6, 184.1, 184.3, 183.9, 184.0, 183.8, 183.6, 183.9, 183.5, 183.4, 183.6, 183.2, 183.1, 183.3, 182.9, 183.0, 182.8, 182.9, 182.6, 182.7, 182.5, 182.6, 182.4, 182.3, 182.5, 182.2, 182.3, 182.0, 182.1];
  const r5 = rng(5), train: number[] = [];
  for (let b = 29; b >= 7; b--) { const wd = parseDay(back(b)).getDay(); train.push([1, 3, 4, 6].includes(wd) ? Math.round(45 + r5() * 17) : 0); }
  d.demo = true;
  d.days = {
    weight: history(today, weight30.map(kg), [191.2, 190.6, 190.9, 189.8, 189.1, 188.4, 188.9, 188.0, 187.6, 187.2, 185.4, 182.8].map(kg)),
    sleep: history(today, [...gen(21, 23, 7.5, 0.8, 2), ...sleepWeek], [7.1, 7.0, 7.2, 7.3, 7.4, 7.2, 7.5, 7.6, 7.3, 7.4, 7.5, 7.6]),
    hrv: history(today, [...gen(31, 23, 54, 6), ...hrv], [50, 51, 49, 52, 53, 52, 54, 55, 53, 54, 55, 55]),
    rhr: history(today, [...gen(41, 23, 56.5, 2.5), ...rhr], [59, 59, 58, 58, 57, 57, 56, 56, 57, 56, 56, 56]),
    steps: history(today, [...gen(51, 23, 8300, 2600).map(x => Math.round(x / 10) * 10), ...steps], [7200, 6900, 7400, 7900, 8600, 9100, 9400, 9000, 8500, 8200, 8400, 8500]),
    kcal: history(today, [...gen(61, 23, 2170, 240), ...kcalWeek], [...N10, 2230, 2190]),
    // Training adds up each month, so older days carry a month's minutes spread over its sessions.
    training: history(today, [...train, ...minWeek], [...N10, 640 / 13, 760 / 15]),
    score: history(today, [...gen(71, 23, 78, 11), ...scoreWeek], [...N10, 75, 80]),
  };
  // Training before the last 30 days: sessions on four days a week, no minutes on the rest.
  for (let i = 0; i < HISTORY - 30; i++) {
    const v = d.days.training[i];
    if (v == null) continue;
    const wd = parseDay(back(HISTORY - 1 - i)).getDay();
    d.days.training[i] = [1, 3, 4, 6].includes(wd) ? Math.round(v * 7 / 4) : 0;
  }
  const dp: [number, number, number][] = [[80, 70, 84], [70, 60, 92], [100, 94, 82], [82, 75, 86], [70, 100, 94], [95, 70, 90], [40, 62, 86]];
  d.weekPillars = dp.map(([training, food, sleep]) => ({ training, food, sleep }));
  d.pillars = { training: 40, food: 62, sleep: 86 };
  d.yesterdayScore = 71;
  d.baseline = { score: 76, training: 70, food: 74, sleep: 84 };
  d.dayNotes = [0, 1, 2, 3, 4, 5, 6].map(i => fill(t(`progressSampleNote${i}` as 'progressSampleNote0'), { squat: wtS(kg(245), unit, 0) }));
  d.night = { min: 413, bed: -32, wake: 381, deep: 72, rem: 94, core: 221, awake: 26, source: 'Oura', segments: HYP };
  d.wake = [370, 405, 365, 380, 435, 460, 381];
  d.hrvBand = [46, 62]; d.rhrBand = [54, 60];
  d.sources = { oura: true, apple: true, ouraSynced: '6:40 AM' };
  d.weight = { kg: kg(182.1), day: today, time: '6:52 AM', startKg: kg(186.4), startDay: back(49), goalKg: kg(178) };
  d.bodyFat = [[63, 19.1], [49, 18.8], [35, 18.5], [21, 18.2], [7, 17.8]].map(([b, pct]) => ({ day: back(b), pct }));
  const inch = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * IN]));
  d.measures = [
    { day: back(63), cm: inch({ chest: 41.5, waist: 35.0, hips: 39.3, neck: 15.8, arm: 14.2, thigh: 23.5 }) },
    { day: back(21), cm: inch({ chest: 41.2, waist: 34.0, hips: 38.8, neck: 15.6, arm: 14.4, thigh: 23.2 }) },
    { day: back(7), cm: inch({ chest: 41.0, waist: 33.5, hips: 38.5, neck: 15.5, arm: 14.5, thigh: 23.0 }) },
  ];
  d.photos = ([[49, 186.4, 16.6], [35, 185.2, 16.2], [28, 184.6, 16.0], [21, 183.9, 15.7], [14, 182.9, 15.4], [7, 182.6, 15.2]] as const)
    .map(([b, lb, fig], i) => ({ id: `sample-${i}`, day: back(b), kg: kg(lb), pose: 'Front' as const, uri: null, fig }));
  d.training = {
    goalMin: 60, weekVolumeKg: kg(52890), lastWeekVolumeKg: kg(64200), sessions: 4,
    active: { name: t('progressSampleActive'), min: 24 },
    plan: { name: t('progressSamplePlan'), perWeek: 5, done: 4 },
    next: { name: t('progressSampleNext'), exercises: 6, estMin: 50, when: t('progressTomorrow') },
    records: [
      { name: t('progressSampleRow'), kg: kg(185), reps: 8, day: back(1), unit: 'lb' },
      { name: t('progressSampleSquat'), kg: kg(245), reps: 5, day: back(4), unit: 'lb' },
    ],
    streak: 12,
  };
  d.food = { goalKcal: 2200, eatenKcal: 1364, proteinG: 92, proteinGoal: 165 };
  return d;
}
