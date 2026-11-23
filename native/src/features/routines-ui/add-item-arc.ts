/* The sun path math for the sheets: the time picker in Add item and the
   window picker in New routine. A time maps to a place on a half ellipse
   over a horizon. Dragging is sideways only, so it never fights the page.

   The Add item path is ported from the web app's
   pages/daily-routines-sheet-parts.js. The window path follows the design
   spec (section 3, picker box 260 by 132). */

import { rs } from '@/i18n/en';
import { routineClock24 } from '@/features/routines/model/types';

const DAY_MIN = 1440;

export interface ArcShape {
  startMin: number; endMin: number; width: number; height: number;
  /** Centre x, horizon y and the two radii. */
  cx: number; hy: number; rx: number; ry: number;
  /** Where the axis starts and ends along x. */
  x0: number; x1: number;
  /** "angle": equal minutes are equal angles. "x": equal minutes are equal widths. */
  spread: 'angle' | 'x';
}

export const ARC: ArcShape = Object.freeze({ startMin: 5 * 60, endMin: 23 * 60, width: 300, height: 122, cx: 150, hy: 100, rx: 130, ry: 80, x0: 20, x1: 280, spread: 'angle' as const });
export const WINDOW_ARC: ArcShape = Object.freeze({ startMin: 5 * 60, endMin: 23 * 60, width: 260, height: 132, cx: 130, hy: 112, rx: 114, ry: 84, x0: 16, x1: 244, spread: 'x' as const });

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function arcPoint(minutes: number, shape: ArcShape = ARC): [number, number] {
  const part = (minutes - shape.startMin) / (shape.endMin - shape.startMin);
  if (shape.spread === 'angle') {
    const angle = Math.PI * (1 - part);
    return [shape.cx + shape.rx * Math.cos(angle), shape.hy - shape.ry * Math.sin(angle)];
  }
  const x = shape.x0 + part * (shape.x1 - shape.x0);
  const across = clamp((x - shape.cx) / shape.rx, -1, 1);
  return [x, shape.hy - shape.ry * Math.sqrt(1 - across * across)];
}

/* The time under an x on the shape's own width, snapped to `snap` minutes. */
export function arcMinutesAt(x: unknown, shape: ArcShape = ARC, snap = 5): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const span = shape.endMin - shape.startMin;
  let minutes: number;
  if (shape.spread === 'angle') {
    const cos = clamp((x - shape.cx) / shape.rx, -1, 1);
    minutes = shape.startMin + span * (1 - Math.acos(cos) / Math.PI);
  } else {
    minutes = shape.startMin + span * clamp((x - shape.x0) / (shape.x1 - shape.x0), 0, 1);
  }
  return clamp(Math.round(minutes / snap) * snap, shape.startMin, shape.endMin);
}

export function arcHolds(minutes: unknown, shape: ArcShape = ARC): minutes is number {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= shape.startMin && minutes <= shape.endMin;
}

/* The time after a step of `step` minutes, on the 5 minute grid. A time on
   the path stops at its ends. A time typed outside it (02:00) moves from
   where it is and stops at the ends of the day, so a step never jumps it
   onto the path. */
export function arcStepMinutes(current: unknown, step: unknown): number | null {
  if (typeof current !== 'number' || !Number.isFinite(current) || typeof step !== 'number' || !Number.isFinite(step)) return null;
  const inside = arcHolds(current);
  const low = inside ? ARC.startMin : 0;
  const high = inside ? ARC.endMin : DAY_MIN - 5;
  return clamp(Math.round((current + step) / 5) * 5, low, high);
}

export interface ArcWindow { startMin: number; endMin: number }

/* The parts of a routine's window that sit on the path. A window that runs
   past midnight can show twice: late at night and early the next morning. */
export function arcSegments(window: Partial<ArcWindow> | null | undefined, shape: ArcShape = ARC): [number, number][] {
  if (!window || typeof window.startMin !== 'number' || typeof window.endMin !== 'number') return [];
  const out: [number, number][] = [];
  for (const shift of [0, -DAY_MIN]) {
    const from = Math.max(shape.startMin, window.startMin + shift);
    const to = Math.min(shape.endMin, window.endMin + shift);
    if (to > from) out.push([from, to]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

const n1 = (value: number) => String(Math.round(value * 10) / 10);

export function arcSegmentPath(from: number, to: number, shape: ArcShape = ARC): string {
  const [x1, y1] = arcPoint(from, shape);
  const [x2, y2] = arcPoint(to, shape);
  return `M${n1(x1)} ${n1(y1)} A${shape.rx} ${shape.ry} 0 0 1 ${n1(x2)} ${n1(y2)}`;
}

export function windowHolds(window: Partial<ArcWindow> | null | undefined, minutes: unknown): boolean {
  if (!window || typeof minutes !== 'number' || typeof window.startMin !== 'number' || typeof window.endMin !== 'number') return false;
  return (minutes >= window.startMin && minutes <= window.endMin)
    || (minutes + DAY_MIN >= window.startMin && minutes + DAY_MIN <= window.endMin);
}

/* "7:05" or "21:30" as minutes from midnight. */
export function clockMinutes(text: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(typeof text === 'string' ? text.trim() : '');
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
}

/* What a person typed in a time field, as "HH:MM": 7, 730, 0730, 7:30 and
   19.30 all work. Anything else is refused, and the field keeps what it had. */
export function typedClock(text: unknown): string | null {
  const raw = typeof text === 'string' ? text.trim().replace(/[.\s]/g, ':') : '';
  if (!raw) return null;
  let hour: number, minute: number;
  const split = /^(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (split) { hour = Number(split[1]); minute = Number(split[2]); }
  else if (/^\d{1,2}$/.test(raw)) { hour = Number(raw); minute = 0; }
  else if (/^\d{3,4}$/.test(raw)) { hour = Number(raw.slice(0, -2)); minute = Number(raw.slice(-2)); }
  else return null;
  return hour < 24 && minute < 60 ? routineClock24(hour * 60 + minute) : null;
}

export interface ArcRoutine { id: string; name: string; window: ArcWindow | null }

/* The two lines over the path. Each routine is { name, window }, in page
   order. `picked` are the ones the item sits in. */
export function arcReadout({ timeMin, routines, picked }: { timeMin: number | null; routines: readonly ArcRoutine[]; picked: readonly ArcRoutine[] }): { big: string; sub: string } {
  if (typeof timeMin === 'number') {
    const inside = routines.find((routine) => windowHolds(routine.window, timeMin));
    return { big: routineClock24(timeMin), sub: inside ? rs('arcInRoutine', { name: inside.name }) : rs('arcOwnTime') };
  }
  if (picked.length === 1) {
    const start = picked[0].window ? picked[0].window.startMin : null;
    return { big: picked[0].name, sub: start != null ? rs('arcAtStart', { time: routineClock24(start) }) : rs('arcNoStart') };
  }
  if (picked.length > 1) return { big: rs('arcMany', { count: picked.length }), sub: rs('arcManySub') };
  return { big: rs('arcNone'), sub: routines.length ? rs('arcPick') : rs('arcTap') };
}

/* ---------- Touch ---------- */

/** A sideways drag: more than 6 points across before 10 points up or down. A drag up or down is left to the sheet. */
export function sidewaysDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > 6 && Math.abs(dy) < 10;
}

/** Whether a touch at (x, y), in the shape's own units, is within `reach` of the path. */
export function nearArc(x: number, y: number, shape: ArcShape = ARC, reach = 24): boolean {
  const minutes = arcMinutesAt(x, shape, 1);
  if (minutes == null) return false;
  const [px, py] = arcPoint(minutes, shape);
  return Math.hypot(x - px, y - py) <= reach;
}

/** Which handle a drag that starts at x takes hold of: the nearer one within `reach`, or none. */
export function handleAt(x: number, handles: readonly (number | null)[], shape: ArcShape = ARC, reach = 28): number {
  let best = -1, distance = reach;
  handles.forEach((minutes, index) => {
    if (minutes == null) return;
    const away = Math.abs(arcPoint(clamp(minutes, shape.startMin, shape.endMin), shape)[0] - x);
    if (away <= distance) { best = index; distance = away; }
  });
  return best;
}

/** Whether both ends of a routine window sit on the path. A window that starts before the path, ends after it
 * or runs past midnight does not: the path cannot show where its ends really are. */
export function windowOnArc(window: ArcWindow, shape: ArcShape = WINDOW_ARC): boolean {
  return window.startMin >= shape.startMin && window.endMin <= shape.endMin && window.endMin > window.startMin;
}

/* A routine window after one end was dragged to `minutes` on the path. The
   two ends keep at least 15 minutes between them. A window with an end off
   the path is returned as it is: a drag there would pull the other end onto
   the path too, and silently rewrite a time the person typed. Those windows
   are set with the time fields. */
export function dragWindow(window: ArcWindow, end: 0 | 1, minutes: number, shape: ArcShape = WINDOW_ARC): ArcWindow {
  if (!windowOnArc(window, shape)) return window;
  const { startMin, endMin } = window;
  if (end === 0) return { startMin: clamp(minutes, shape.startMin, Math.max(shape.startMin, endMin - 15)), endMin };
  return { startMin, endMin: clamp(minutes, Math.min(shape.endMin, startMin + 15), shape.endMin) };
}

/* A start or end time moved by `step` minutes with the buttons. It stays on
   the clock's quarter hours and wraps past midnight. */
export function stepClock(minutes: number, step: number): number {
  const next = Math.round((minutes + step) / 15) * 15;
  return ((next % DAY_MIN) + DAY_MIN) % DAY_MIN;
}
