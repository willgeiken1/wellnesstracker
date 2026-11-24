import { coveringLog, formatRoutineAmount, loggedAmountText, placedItems, routineBlockRows, type RoutineRow } from '@/features/routines/model/day';
import { routineBlockWindow, routineDayRolloverHour, routineMinuteOfDay } from '@/features/routines/model/dose';
import { formatRoutineWait, routineNextItem, routineNowNext } from '@/features/routines/model/now';
import type { RoutineBlock, RoutineView } from '@/features/routines/model/shape';
import { routineSupplyView } from '@/features/routines/model/supply';
import { routineClock24 } from '@/features/routines/model/types';
import { routinesText } from '@/i18n/en';
import { routinesOn } from './sun-model';

/* What the day view reads off the routines: the line for what is next, how a
   row reads, which routines are folded and which one Focus mode shows. Pure. */

/** "Next: {item}, in 20 min", or empty when nothing is open. */
export function nextLine(view: RoutineView, now: Date, day: string): { text: string; itemId: string; soon: boolean } {
  const next = routineNextItem(view, now, day);
  if (!next) return { text: '', itemId: '', soon: false };
  const name = next.item.name || '';
  const wait = next.overdue ? routinesText('overdue') : formatRoutineWait(next.waitMin);
  return {
    text: wait ? routinesText('next', { name, wait }) : routinesText('nextPlain', { name }),
    itemId: next.item.id ?? '',
    /* "Now" on a row's time rail is an instruction, so it shows only when the item is due this minute or is
       already overdue and still open. Until then the rail keeps the clock time, and the line above counts down. */
    soon: next.overdue === true || (typeof next.waitMin === 'number' && next.waitMin < 1),
  };
}

/** The amount a row shows: what was logged once it is logged, and before that the amount saved on the item. */
export function rowAmount(row: RoutineRow): string {
  if (!row.open) return loggedAmountText(row.log);
  if (row.item.kind !== 'dose' || !row.compound || typeof row.compound.amount !== 'number') return '';
  const amount = formatRoutineAmount(row.compound.amount);
  return amount ? (row.compound.unit ? `${amount} ${row.compound.unit}` : amount) : '';
}
/** The time on a row's rail, or empty when the item has none. */
export function rowTime(row: RoutineRow): string {
  const minute = routineMinuteOfDay(row.item.timeMin);
  return minute == null ? '' : routineClock24(minute);
}
/** A row's supply line: what is on hand with the days left, and how long ago a vial was mixed. Empty when the
 * item has no count and no mixed day. */
export function rowSupply(row: RoutineRow, view: RoutineView, day: string): string {
  return routineSupplyView({ item: row.item, logs: view.logs, today: day }).text;
}
export const rowDone = (row: RoutineRow) => !row.open && !!row.log && row.log.status !== 'skipped';
export const rowSkipped = (row: RoutineRow) => !row.open && !!row.log && row.log.status === 'skipped';

/** The routine Focus mode shows: the current one while it has something open, then the next one in the
 * routine day that does. Empty when nothing is left. */
export function focusBlockId(view: RoutineView, now: Date, day: string): string {
  const today = routinesOn(view, day);
  const moment = routineNowNext(view.blocks, now, day);
  const hasOpen = (block: RoutineBlock) => routineBlockRows(view, block.id, day).some(row => row.open);
  if (!moment.nowBlock) return '';
  if (hasOpen(moment.nowBlock as RoutineBlock)) return moment.nowBlock.id ?? '';
  const rollover = routineDayRolloverHour(view.settings.dayRolloverHour) * 60;
  const since = (minutes: number) => ((minutes - rollover) % 1440 + 1440) % 1440;
  const startOf = (block: RoutineBlock) => { const window = routineBlockWindow(block); return window ? since(window.startMin) : null; };
  const from = startOf(moment.nowBlock as RoutineBlock) ?? -1;
  const later = today.map(block => ({ block, at: startOf(block) })).filter((row): row is { block: RoutineBlock; at: number } => row.at != null && row.at > from && hasOpen(row.block))
    .sort((a, b) => a.at - b.at)[0];
  return later ? later.block.id : '';
}

/** The routine a link into the day asks for: the one it names, or the one that holds its item, among the
 * routines on the page today. Empty when the link names nothing that is there. */
export function routineLinkBlockId(view: RoutineView, today: readonly RoutineBlock[], jump: { blockId?: string; itemId?: string } | null | undefined): string {
  if (!jump) return '';
  const named = jump.blockId ? today.find(block => block.id === jump.blockId) : undefined;
  const holder = named ?? (jump.itemId ? today.find(block => view.placements.some(place => place.blockId === block.id && place.itemId === jump.itemId)) : undefined);
  return holder?.id ?? '';
}

/** The routines the day draws. Focus mode keeps to the one in focus, and to the one a link asked for: a
 * routine someone asked to see is shown without Focus mode being switched off. */
export function focusShown(today: readonly RoutineBlock[], focus: boolean, focusId: string, soughtId = ''): RoutineBlock[] {
  return focus ? today.filter(block => block.id === focusId || (!!soughtId && block.id === soughtId)) : today.slice();
}

/** Whether anything at all is on the page: an item placed in a routine or due on its own. */
export function hasItems(view: RoutineView): boolean {
  return view.items.length > 0;
}
/** How many of a day's items still wait. */
export function openCount(view: RoutineView, day: string): number {
  return placedItems(view, day).filter(item => !coveringLog(view.logs, item.id, day)).length;
}
