/* Which routine is current, which item is next, and how the clock reads.
   Ported from the pure helpers in the web app's pages/daily-routines.js. */

import { coveringLog, placedItems, routineBlockRows, type RoutineRow } from "./day";
import { nextItemCountdown, routineBlockRunsOn, routineBlockWindow, type RoutineWindow } from "./dose";
import { isLive } from "./shape";
import type { BlockLike, ItemLike, LogLike, ViewLike } from "./shape";

export function routineSlotIndex(date: Date): number {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
}

export function formatRoutineClock(date: Date): string {
  let hour = date.getHours();
  const min = String(date.getMinutes()).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${min} ${suffix}`;
}

/* The dose clock on a log is `at`, read in the phone's local zone. */
export function routineClockTime(stamp: unknown): string {
  if (typeof stamp !== "number" || !Number.isFinite(stamp) || stamp <= 0) return "";
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatRoutineWait(waitMin: unknown): string {
  if (typeof waitMin !== "number" || !Number.isFinite(waitMin) || waitMin < 0) return "";
  if (waitMin < 1) return "now";
  const hours = Math.floor(waitMin / 60);
  const mins = waitMin % 60;
  if (hours && mins) return `in ${hours} hr ${mins} min`;
  if (hours) return hours === 1 ? "in 1 hr" : `in ${hours} hr`;
  return mins === 1 ? "in 1 min" : `in ${mins} min`;
}

export interface NowNext<B extends BlockLike = BlockLike> { nowBlock: B | null; nextBlock: B | null; waitMin: number | null; slot: number }

/* Which routine is current follows its window. Inside a window, that
   routine is now. Between windows, the one that started last stays now
   until the next one starts. Before the first start of the day, the last
   routine of the evening is still now. A routine with no window falls back
   to block order by time of day (morning, afternoon, night). A day key
   leaves out routines that do not run that weekday. */
export function routineNowNext<B extends BlockLike>(blocks: readonly B[] | null | undefined, date: Date, day?: string): NowNext<B> {
  const live = (Array.isArray(blocks) ? (blocks as B[]) : []).filter((block) => isLive(block) && block.hidden !== true && (!day || routineBlockRunsOn(block, day)));
  const sorted = live.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || ((a.id || "") < (b.id || "") ? -1 : (a.id || "") > (b.id || "") ? 1 : 0));
  const slot = routineSlotIndex(date);
  if (!sorted.length) return { nowBlock: null, nextBlock: null, waitMin: null, slot };
  const nowMin = date.getHours() * 60 + date.getMinutes();
  const timed: { block: B; window: RoutineWindow }[] = [];
  for (const block of sorted) {
    const window = routineBlockWindow(block);
    if (window) timed.push({ block, window });
  }
  let nowBlock: B;
  if (timed.length) {
    /* When windows overlap, the one that started last is now, whatever
       their order on the page. */
    const elapsed = (window: RoutineWindow) => ((nowMin - window.startMin) % 1440 + 1440) % 1440;
    const inside = timed.filter(({ window }) => (nowMin >= window.startMin && nowMin < window.endMin)
      || (nowMin + 1440 >= window.startMin && nowMin + 1440 < window.endMin))
      .sort((a, b) => elapsed(a.window) - elapsed(b.window))[0];
    const started = timed.filter(({ window }) => window.startMin <= nowMin).sort((a, b) => b.window.startMin - a.window.startMin)[0];
    const latest = timed.slice().sort((a, b) => b.window.startMin - a.window.startMin)[0];
    nowBlock = (inside || started || latest).block;
  } else {
    nowBlock = sorted[Math.min(slot, sorted.length - 1)];
  }
  const others = timed.filter((row) => row.block.id !== nowBlock.id);
  let nextBlock: B | null = null;
  let waitMin: number | null = null;
  if (others.length) {
    const ahead = others.map((row) => ({ block: row.block, wait: ((row.window.startMin - nowMin) % 1440 + 1440) % 1440 || 1440 }))
      .sort((a, b) => a.wait - b.wait)[0];
    nextBlock = ahead.block;
    waitMin = ahead.wait;
  } else if (!timed.length && sorted.length > 1) {
    const index = sorted.indexOf(nowBlock);
    nextBlock = sorted[(index + 1) % sorted.length];
  }
  return { nowBlock, nextBlock, waitMin, slot };
}

interface Timing { waitMin: number | null; overdue: boolean; today?: boolean }

/* Doses and checks share one clock: the rollover hour decides which
   routine day a time belongs to, and an off day is not overdue. */
function itemTiming(projected: ViewLike, item: ItemLike, date: Date, day: string): Timing {
  const result = nextItemCountdown({
    item,
    blocks: projected.blocks,
    placements: projected.placements,
    logs: [],
    date,
    day,
    hour: projected.settings ? projected.settings.dayRolloverHour : undefined,
  });
  if (!result || typeof result.waitMin !== "number") return { waitMin: null, overdue: false };
  return { waitMin: result.waitMin, overdue: result.missed === true, today: result.tomorrow !== true };
}

function placementOrder(projected: ViewLike, itemId: string | undefined): number {
  let best = Number.POSITIVE_INFINITY;
  for (const place of projected.placements || []) {
    if (isLive(place) && place.itemId === itemId && typeof place.order === "number" && place.order < best) best = place.order;
  }
  return best;
}

export interface NextItem extends Timing { item: ItemLike; order: number }

/* The next line names an item, not a block. Upcoming items come before
   overdue ones. The wait is the same block clock the row countdown uses. */
export function routineNextItem(projected: ViewLike | null | undefined, date: unknown, day: string): NextItem | null {
  if (!projected || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const open = placedItems(projected, day).filter((item) => !coveringLog(projected.logs, item.id, day));
  if (!open.length) return null;
  const ranked: NextItem[] = open.map((item) => ({ item, ...itemTiming(projected, item, date, day), order: placementOrder(projected, item.id) }));
  ranked.sort((a, b) => {
    const group = (row: NextItem) => (row.overdue ? 1 : row.waitMin == null ? 2 : 0);
    const ag = group(a);
    const bg = group(b);
    if (ag !== bg) return ag - bg;
    const aw = a.waitMin == null ? Number.POSITIVE_INFINITY : a.waitMin;
    const bw = b.waitMin == null ? Number.POSITIVE_INFINITY : b.waitMin;
    if (aw !== bw) return aw - bw;
    if (a.order !== b.order) return a.order - b.order;
    if (a.item.id === b.item.id) return 0;
    return (a.item.id || "") < (b.item.id || "") ? -1 : 1;
  });
  return ranked[0];
}

export function lastDoseLabel(log: LogLike | null | undefined): string {
  if (!log || log.rest === true || log.status === "skipped") return "";
  if (log.status !== "done" && log.status !== "partial") return "";
  if (typeof log.at !== "number" || !Number.isFinite(log.at) || log.at <= 0) return "";
  const date = new Date(log.at);
  if (Number.isNaN(date.getTime())) return "";
  return `last: ${formatRoutineClock(date)}`;
}

/* Handled-and-taken rows out of all rows in a routine. A skip is not done. */
export function routineBlockCount(projected: ViewLike | null | undefined, blockId: string, day: string): { done: number; total: number; rows: RoutineRow[] } {
  const rows = routineBlockRows(projected, blockId, day);
  const done = rows.filter((row) => !row.open && !!row.log && row.log.status !== "skipped").length;
  return { done, total: rows.length, rows };
}

/* Minutes on the sun path for a time of day: a time before the path starts
   counts as after midnight when the path runs that late. */
export function routineSunAxis(windows: readonly { startMin: number; endMin: number }[]): { start: number; end: number; place: (minutes: number) => number } {
  let start = 5 * 60;
  let end = 23 * 60;
  for (const window of windows) {
    start = Math.min(start, window.startMin);
    end = Math.max(end, window.endMin);
  }
  start = Math.floor(start / 60) * 60;
  end = Math.ceil(end / 60) * 60;
  if (end - start > 1440) end = start + 1440;
  const place = (minutes: number) => {
    let value = minutes;
    if (value < start && value + 1440 <= end) value += 1440;
    return Math.min(end, Math.max(start, value));
  };
  return { start, end, place };
}
