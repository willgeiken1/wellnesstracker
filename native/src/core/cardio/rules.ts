import type { Row } from '../../data/rows';
export const machines = ['treadmill', 'stair', 'elliptical', 'bike', 'rower'] as const;
export type Machine = typeof machines[number];
export interface Settings { mph: number; incline: number; level: number }
export interface Timer { startedAt: number; pausedAt: number | null; pausedMs: number }
export const defaults: Settings = { mph: 3, incline: 12, level: 8 };
export function localDay(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function bodyWeight(rows: Row[], today = localDay()): { kg: number; fallback: boolean } {
  const latest = rows.filter(r => r.deleted_at === null && String(r.data.day) <= today && Number(r.data.weight_kg) > 0 && Number.isFinite(r.data.weight_kg))
    .sort((a, b) => String(b.data.day).localeCompare(String(a.data.day)) || b.updated_at - a.updated_at)[0];
  // weigh_ins stores canonical kg for both lb and kg entry; never convert twice.
  return latest ? { kg: Number(latest.data.weight_kg), fallback: false } : { kg: 80, fallback: true };
}
/** Port of logger/js/pages/cardio.js kcalPerMin (ACSM treadmill / level-scaled MET). */
export function kcalPerMin(machine: Machine, seg: Settings, kg: number): number {
  const inc = Math.max(0, seg.incline || 0) / 100;
  if (machine === 'treadmill') {
    const speed = Math.max(0, seg.mph || 0) * 26.8224;
    const vo2 = (seg.mph || 0) < 4.5 ? 3.5 + .1 * speed + 1.8 * speed * inc : 3.5 + .2 * speed + .9 * speed * inc;
    return vo2 * kg / 1000 * 5;
  }
  const level = Math.max(1, Math.min(20, seg.level || 1));
  const met = machine === 'stair' ? (4 + .4 * level) * (1 + inc * .5)
    : machine === 'elliptical' ? (4 + .25 * level) * (1 + inc * .5)
    : machine === 'bike' ? 3.5 + .3 * level : 4.5 + .3 * level;
  return met * 3.5 * kg / 200;
}
export function weeklyMinutes(rows: Row[], pauses: Row[], today: string): number {
  // Calendar dates, UTC only for arithmetic: DST never changes the week edges.
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const start = monday.toISOString().slice(0, 10);
  monday.setUTCDate(monday.getUTCDate() + 7);
  const end = monday.toISOString().slice(0, 10);
  return rows.filter(r => r.deleted_at === null && String(r.data.day) >= start && String(r.data.day) < end && !pauses.some(p =>
    p.deleted_at === null && p.data.start_day != null && String(r.data.day) >= String(p.data.start_day) && (p.data.end_day == null || String(r.data.day) <= String(p.data.end_day))))
    .reduce((sum, r) => sum + Math.max(0, Number(r.data.duration_ms) || 0) / 60000, 0);
}
export function elapsedMs(timer: Timer, now: number): number {
  return Math.max(0, (timer.pausedAt ?? now) - timer.startedAt - timer.pausedMs);
}
export function pauseLive<T extends Timer>(timer: T, now: number): T {
  return timer.pausedAt === null ? { ...timer, pausedAt: now } : timer;
}
export function resumeLive<T extends Timer>(timer: T, now: number): T {
  return timer.pausedAt === null ? timer : { ...timer, pausedAt: null, pausedMs: timer.pausedMs + Math.max(0, now - timer.pausedAt) };
}
