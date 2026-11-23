import { coveringLog, placedItems, routineBlockRows } from '@/features/routines/model/day';
import { routineBlockRunsOn, routineBlockWindow, routineMinuteOfDay } from '@/features/routines/model/dose';
import { routineBlockCount, routineSunAxis } from '@/features/routines/model/now';
import type { RoutineBlock, RoutineView } from '@/features/routines/model/shape';
import { routineShortName } from '@/features/routines/model/types';

/* The sun path's shape and what a day puts on it. Time runs left to right
   along a dome over a horizon; where a time sits depends only on the axis,
   so one function places everything. Pure: no drawing here. */

/** One drawing of the path, in the units of its own viewBox. */
export interface SunBox { width: number; height: number; /** The horizon. */ hy: number; x0: number; x1: number; cx: number; rx: number; ry: number }
/** The day view's path. */
export const DAY_BOX: SunBox = Object.freeze({ width: 292, height: 162, hy: 122, x0: 18, x1: 274, cx: 146, rx: 128, ry: 96 });
/** The smaller path a picker draws in a sheet. */
export const PICK_BOX: SunBox = Object.freeze({ width: 260, height: 132, hy: 112, x0: 16, x1: 244, cx: 130, rx: 114, ry: 84 });

export interface SunAxis { start: number; end: number; place: (minutes: number) => number }
const round = (value: number) => String(Math.round(value * 10) / 10);

/** Where times fall in a box: x for a minute of the day, the dome's y above an x, the stroke between two
 * times, and the minute under an x (for a picker's drag). */
export function sunGeometry(axis: SunAxis, box: SunBox) {
  const span = Math.max(1, axis.end - axis.start);
  const x = (minutes: number) => box.x0 + ((axis.place(minutes) - axis.start) / span) * (box.x1 - box.x0);
  const y = (at: number) => {
    const u = (at - box.cx) / box.rx;
    return box.hy - box.ry * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const arc = (from: number, to: number) => {
    const a = x(from), b = x(Math.min(to, axis.end));
    if (b - a < 0.5) return '';
    return `M${round(a)} ${round(y(a))} A${box.rx} ${box.ry} 0 0 1 ${round(b)} ${round(y(b))}`;
  };
  const minuteAt = (at: number) => axis.start + (Math.min(box.x1, Math.max(box.x0, at)) - box.x0) / (box.x1 - box.x0) * span;
  return { x, y, arc, minuteAt };
}

export interface SunWindow { id: string; color: string; startMin: number; endMin: number }
export interface SunPin { id: string; minute: number; /** The routine's stored colour id, or null for an item that sits in no drawn routine. */ color: string | null; done: boolean }
export type SunLegend = { id: string; name: string; color: string; done: number; total: number };
export interface SunDay { axis: SunAxis; windows: SunWindow[]; pins: SunPin[]; legend: SunLegend[]; total: number; left: number }

/** The routines that run on a day, in page order. */
export function routinesOn(view: RoutineView, day: string): RoutineBlock[] {
  return view.blocks.filter(block => routineBlockRunsOn(block, day));
}

/** What the day view's path shows: each routine's window, one pin per item at its time, and the counts. Timed
 * items no drawn routine holds, such as a peptide that lives only on its tab, get a pin of their own, and the
 * axis stretches so no pin is pushed to an end. */
export function sunDay(view: RoutineView, day: string): SunDay {
  const today = routinesOn(view, day);
  const timed = today.map(block => ({ block, window: routineBlockWindow(block) })).filter((row): row is { block: RoutineBlock; window: NonNullable<ReturnType<typeof routineBlockWindow>> } => !!row.window);
  const drawn = new Set<string>();
  const points: { startMin: number; endMin: number }[] = timed.map(row => row.window);
  const pins: SunPin[] = [];
  for (const { block, window } of timed) {
    for (const row of routineBlockRows(view, block.id, day)) {
      const id = row.item.id ?? '';
      if (!id || drawn.has(id)) continue;
      drawn.add(id);
      const own = routineMinuteOfDay(row.item.timeMin);
      if (own != null) points.push({ startMin: own, endMin: own });
      pins.push({ id, minute: own ?? window.startMin, color: block.color, done: !row.open && !!row.log && row.log.status !== 'skipped' });
    }
  }
  const due = placedItems(view, day);
  for (const item of due) {
    const own = routineMinuteOfDay(item.timeMin);
    if (!item.id || drawn.has(item.id) || own == null) continue;
    const log = coveringLog(view.logs, item.id, day);
    points.push({ startMin: own, endMin: own });
    pins.push({ id: item.id, minute: own, color: null, done: !!log && log.status !== 'skipped' });
  }
  const left = due.filter(item => !coveringLog(view.logs, item.id, day)).length;
  return {
    axis: routineSunAxis(points),
    windows: timed.map(({ block, window }) => ({ id: block.id, color: block.color, startMin: window.startMin, endMin: window.endMin })),
    pins,
    legend: today.map((block) => {
      const count = routineBlockCount(view, block.id, day);
      return { id: block.id, name: routineShortName(block), color: block.color, done: count.done, total: count.total };
    }),
    total: due.length,
    left,
  };
}
