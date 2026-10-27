import type { Repository } from '../../data/repository';
import { compareRows, type Row } from '../../data/rows';
import { toKg } from '../../core/workout/rules';
import { today, type Unit } from '../onboarding/model';
export interface DailyWeight { day: string; kg: number; count: number }
export interface TrendWeight extends DailyWeight { trendKg: number }
export type BodyRange = 7 | 30 | 90 | 365;
export function dayStamp(day: string) {
  const stamp = Date.parse(`${day}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === day ? stamp : NaN;
}
function validReading(row: Row) {
  return row.table === 'weigh_ins' && row.deleted_at === null && typeof row.data.day === 'string' && Number.isFinite(dayStamp(row.data.day)) && typeof row.data.weight_kg === 'number' && Number.isFinite(row.data.weight_kg) && row.data.weight_kg > 0;
}
/** Derived values only: never collapse or rewrite the original measurements. */
export function dailyWeights(rows: Row[]): DailyWeight[] {
  const days = new Map<string, number[]>();
  for (const row of rows.filter(validReading)) {
    const day = String(row.data.day);
    days.set(day, [...(days.get(day) ?? []), Number(row.data.weight_kg)]);
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([day,values])=>({day,kg:values.reduce((sum,n)=>sum+n,0)/values.length,count:values.length}));
}
/** Ten-day EWMA span (alpha=2/11); missing calendar days increase decay without
 * inventing readings. First daily mean seeds the series. Units never affect it. */
export function trendWeights(daily: DailyWeight[]): TrendWeight[] {
  let previous: TrendWeight | undefined;
  return daily.map(point => {
    const alpha = previous ? 1 - Math.pow(9/11,(dayStamp(point.day)-dayStamp(previous.day))/86400000) : 1;
    const trendKg = previous ? previous.trendKg + alpha*(point.kg-previous.trendKg) : point.kg;
    previous = {...point,trendKg};return previous;
  });
}
export function inRange(points: TrendWeight[], days: BodyRange, end = today()) {
  const upper = dayStamp(end), lower = upper-(days-1)*86400000;
  return points.filter(point=>dayStamp(point.day)>=lower && dayStamp(point.day)<=upper);
}
/** Seven-day change at the latest measured day, interpolating only between
 * known trend points. No extrapolation for a history shorter than a week. */
export function weeklyChange(points: TrendWeight[]): number | null {
  const last=points.at(-1);if(!last)return null;
  const target=dayStamp(last.day)-7*86400000;
  if(target<dayStamp(points[0].day))return null;
  for(let i=0;i<points.length;i++) {
    const p=points[i], stamp=dayStamp(p.day);
    if(stamp===target)return last.trendKg-p.trendKg;
    if(stamp>target && i>0) {
      const before=points[i-1], fraction=(target-dayStamp(before.day))/(stamp-dayStamp(before.day));
      return last.trendKg-(before.trendKg+(p.trendKg-before.trendKg)*fraction);
    }
  }
  return null;
}
export function lastWeight(rows: Row[]): number | null {
  return Number(rows.filter(validReading).sort((a,b)=>String(a.data.day).localeCompare(String(b.data.day)) || compareRows(a,b) || a.id.localeCompare(b.id)).at(-1)?.data.weight_kg) || null;
}
export function saveWeighIn(repo: Repository, value: number, unit: Unit, day = today()) {
  if(!Number.isFinite(value) || value<=0 || !['kg','lb'].includes(unit) || !Number.isFinite(dayStamp(day)))throw new Error('Invalid weigh-in.');
  return repo.save('weigh_ins',{day,weight_kg:toKg(value,unit),entered_value:value,entered_unit:unit,source:'app'});
}

/** Broad warning bounds, not a save restriction. Compare canonical kg in both units. */
export function unusualWeight(value: number, unit: Unit, lastKg: number | null) {
  const kg = toKg(value,unit);
  return kg < 30 - 1e-9 || kg > 300 + 1e-9 || (lastKg !== null && Math.abs(kg-lastKg) > lastKg*0.1 + 1e-9);
}
export function deleteWeighIn(repo: Repository, id: string) {
  const row = repo.get('weigh_ins',id);
  if(row && row.owner_id === repo.owner && row.deleted_at === null && row.data.source === 'app')repo.remove('weigh_ins',id);
}
