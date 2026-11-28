import { clockHM, type ClockUnit } from '@/features/settings/clock';
import type { Unit } from '@/features/onboarding/model';
import { IN, LB } from './model';

/** How Progress writes numbers: thousands separators, the design's minus sign, weights and lengths in the person's units. */
export function fmt(n: number, dec = 0): string {
  const fixed = Math.abs(n).toFixed(dec), [int, frac] = fixed.split('.');
  return (n < 0 && Number(fixed) !== 0 ? '−' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}
/** "+1.2", "−0.4", "0" */
export function signed(v: number, dec = 0): string {
  const s = fmt(Math.abs(v), dec), zero = Number(Math.abs(v).toFixed(dec)) === 0;
  return (zero ? '' : v > 0 ? '+' : '−') + s;
}
export const wtU = (unit: Unit) => unit;
export const wtV = (kg: number, unit: Unit) => unit === 'lb' ? kg * LB : kg;
export const toKg = (v: number, unit: Unit) => unit === 'lb' ? v / LB : v;
/** "182.1" */
export const wtN = (kg: number, unit: Unit, dec = 1) => fmt(wtV(kg, unit), dec);
/** "182.1 lb" */
export const wtS = (kg: number, unit: Unit, dec = 1) => `${wtN(kg, unit, dec)} ${unit}`;
/** A goal: "178", "80.7" */
export const wGoal = (kg: number, unit: Unit) => fmt(wtV(kg, unit), 1).replace(/\.0$/, '');
/** A signed change in the person's unit. */
export const wD = (dkg: number, unit: Unit, dec = 1) => signed(wtV(dkg, unit), dec);

export const lenU = (unit: Unit) => unit === 'lb' ? 'in' : 'cm';
export const lenV = (cm: number, unit: Unit) => unit === 'lb' ? cm / IN : cm;
export const lenS = (cm: number, unit: Unit) => `${fmt(lenV(cm, unit), 1)} ${lenU(unit)}`;
export const fromLen = (v: number, unit: Unit) => unit === 'lb' ? v * IN : v;

/** Hours as "6h 53m". */
export function hm(hours: number) { const m = Math.round(hours * 60); return `${Math.floor(m / 60)}h ${m % 60}m`; }
/** Minutes after midnight as a clock time, "6:21 AM", or "06:21" on a 24-hour clock. */
export function clock(min: number, c: ClockUnit = '12') {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return clockHM(Math.floor(m / 60), m % 60, c);
}
/** A moment as a clock time. */
export const clockAt = (ms: number) => { const d = new Date(ms); return clock(d.getHours() * 60 + d.getMinutes()); };
export const kcalS = (kcal: number) => `${fmt(kcal)} kcal`;
const ONE = /^(\s(?:new |CSV |full )?)(sessions|workouts|photos|records|days|weeks|months|exercises|files|hours|nights|weigh-ins)\b/;
/** Fill `{name}` slots in a string. A count of 1 takes the singular of the noun right after it, so "1 sessions" reads "1 session". */
export function fill(text: string, values: Record<string, string | number>) {
  const parts = text.split(/(\{\w+\})/);
  return parts.map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) return part;
    const v = values[m[1]];
    if (v == null) return '';
    if (String(v) === '1' && parts[i + 1]) parts[i + 1] = parts[i + 1].replace(ONE, (_, pre: string, noun: string) => pre + noun.slice(0, -1));
    return String(v);
  }).join('');
}
