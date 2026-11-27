import { t, type MessageKey } from '@/i18n/en';
import { METRICS, type MetricKey, type ProgressData, type Range } from './model';
import { fill, fmt, hm, wGoal } from './format';

/* How each metric reads: its name, unit, goal or usual range, axis ticks and the line about where it comes from. */

export interface MetricView {
  key: MetricKey; name: string; short: string; unit: string;
  goal: number | null; goalL: string | null; band: readonly [number, number] | null;
  tick?: (v: number) => string; about: string; src: string;
}
const cap = (k: MetricKey) => k.charAt(0).toUpperCase() + k.slice(1);
const msg = (k: string) => t(k as MessageKey);
/** HRV is a true acronym and its name in every language, so it is kept here like the tile catalogue's own 'HRV' rather
 * than as an all-capitals string in the copy. */
export const HRV_NAME = 'HRV';
/** A metric's name, as Progress shows it. */
export const metricName = (key: MetricKey) => key === 'hrv' ? HRV_NAME : msg(`progressM${cap(key)}`);

export function metricView(d: ProgressData, key: MetricKey): MetricView {
  const name = metricName(key), short = key === 'rhr' ? t('progressRhrShort') : name;
  const ouraOrApple = d.sources.oura || d.demo ? t('progressSrcOura') : t('progressSrcApple');
  // HRV and resting heart rate name the source their readings came from, not just whether Oura is connected.
  const heartOura = d.demo || d.sources.heart === 'Oura', heartSrc = heartOura ? t('progressSrcOura') : t('progressSrcApple');
  switch (key) {
    case 'weight': {
      const g = d.weight.goalKg;
      return { key, name, short, unit: d.unit, goal: g == null ? null : d.unit === 'lb' ? g * 2.2046226218487757 : g, goalL: g == null ? null : fill(t('progressGoalIs'), { v: wGoal(g, d.unit) }), band: null, about: t('progressAboutWeight'), src: t('progressSrcApple') };
    }
    case 'sleep': return { key, name, short, unit: '', goal: d.sleepGoalMin / 60, goalL: fill(t('progressGoalIs'), { v: hmShort(d.sleepGoalMin) }), band: null, tick: v => `${Math.round(v)}h`, about: t('progressAboutSleep'), src: ouraOrApple };
    case 'hrv': return { key, name, short, unit: 'ms', goal: null, goalL: null, band: d.hrvBand, about: heartOura ? t('progressAboutHrv') : t('progressAboutHrvApple'), src: heartSrc };
    case 'rhr': return { key, name, short, unit: 'bpm', goal: null, goalL: null, band: d.rhrBand, about: t('progressAboutRhr'), src: heartSrc };
    case 'steps': return { key, name, short, unit: 'steps', goal: d.stepGoal, goalL: fill(t('progressGoalIs'), { v: fmt(d.stepGoal) }), band: null, tick: v => v ? `${Math.round(v / 1000)}k` : '0', about: fill(t('progressAboutSteps'), { goal: fmt(d.stepGoal) }), src: t('progressSrcApple') };
    case 'kcal': {
      const g = d.food.goalKcal;
      return { key, name, short, unit: 'kcal', goal: g, goalL: g == null ? null : fill(t('progressGoalIs'), { v: fmt(g) }), band: null, tick: v => v ? `${(v / 1000).toFixed(1)}k` : '0', about: t('progressAboutKcal'), src: t('progressSrcInsight') };
    }
    case 'training': return { key, name, short, unit: 'min', goal: d.training.goalMin, goalL: null, band: null, tick: v => `${Math.round(v)}`, about: t('progressAboutTraining'), src: t('progressSrcInsight') };
    default: return { key, name, short, unit: '', goal: null, goalL: null, band: null, about: '', src: t('progressSrcInsight') };
  }
}
/** "8h" or "7h 30m". */
export const hmShort = (min: number) => min % 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min / 60}h`;

/** A value as text with its unit ("8,420 steps", "6h 53m"), or "No data". */
export function vText(d: ProgressData, key: MetricKey, v: number | null | undefined, withUnit = true) {
  if (v == null || !Number.isFinite(v)) return t('progressNoData');
  if (key === 'sleep') return hm(v);
  const s = fmt(v, METRICS[key].dec === 2 ? 1 : METRICS[key].dec), u = metricView(d, key).unit;
  return withUnit && u ? `${s} ${u}` : s;
}
/** The range in words: "This week", "30 days", "12 months" (tiles) or "Last 30 days" (screens). */
export const rangeShort = (r: Range) => t(r === 'week' ? 'progressThisWeek' : r === 'month' ? 'progress30Days' : 'progress12Months');
export const rangeLong = (r: Range) => t(r === 'week' ? 'progressThisWeek' : r === 'month' ? 'progressLast30' : 'progressLast12');
/** Short axis ticks: a letter a day for a week, a date a week apart for 30 days, a letter a month for a year. */
export function shortTicks(se: { ticks: string[]; sl: string[]; v: unknown[] }, r: Range, sparse: boolean) {
  return se.ticks.map((tk, i) => {
    if (r === 'week') return tk.charAt(0);
    if (r === 'year') return sparse ? (i === 0 || i === se.v.length - 1 || i === 6 ? se.sl[i] : '') : tk;
    return sparse ? (i === 0 ? se.sl[0] : i === se.v.length - 1 ? t('today') : '') : tk;
  });
}
