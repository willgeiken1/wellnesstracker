/* What the Add item sheet holds while it is open, and what Save needs before
   it will save. The name, amount and unit are what the user typed. A new
   item starts with no amount, no unit and no time, so each one is something
   the user chose.

   Ported from the web app's routineItemDraft and the item sheet's taps. */

import { rs, type RoutinesSheetsKey } from '@/i18n/en';
import type { ItemDraft } from '@/features/routines/model/actions';
import { routineItemType, ROUTINE_DOSE_UNITS } from '@/features/routines/model/day';
import { routineBlockWindow, routineMinuteOfDay } from '@/features/routines/model/dose';
import type { RoutineView } from '@/features/routines/model/shape';
import { supplyDraftError } from '@/features/routines/model/supply';
import { routineClock24, routineShortName, routineTypeChoices, ROUTINE_TYPE_ORDER, type RoutineTypeChoice } from '@/features/routines/model/types';
import { doseSet, parseSheetAmount } from './add-item-amounts';
import { clockMinutes, type ArcWindow } from './add-item-arc';

const DOSE_UNITS = new Set<string>(ROUTINE_DOSE_UNITS);

export interface ItemSheetDraft {
  itemId: string | null; name: string; kind: 'check' | 'dose'; amount: string; unit: string; type: string; time: string;
  onHand: string; mixedOn: string; blockIds: string[];
}

export interface ItemSheetSource { itemId?: string | null; type?: string | null }

export function openItemDraft(view: RoutineView | null, source: ItemSheetSource = {}): ItemSheetDraft {
  const item = source.itemId && view ? view.items.find((row) => row.id === source.itemId) ?? null : null;
  const compound = item && item.compoundId && view ? view.compounds.find((row) => row.id === item.compoundId) ?? null : null;
  const shown = new Set((view ? view.blocks : []).map((block) => block.id));
  const placed = item && view ? view.placements.filter((row) => row.itemId === item.id && shown.has(row.blockId)).map((row) => row.blockId) : [];
  const presetType = !item && typeof source.type === 'string' ? routineItemType({ type: source.type }, view ? view.prefs : null) : '';
  /* A new item opens on the routine last used. With a type given it needs no routine. */
  const last = view && view.prefs.lastBlockId && shown.has(view.prefs.lastBlockId) ? view.prefs.lastBlockId : '';
  const opened = presetType ? '' : last;
  const dose = !!item && item.kind === 'dose';
  const timeMin = item ? routineMinuteOfDay(item.timeMin) : null;
  return {
    itemId: item ? item.id : null,
    name: item ? item.name : '',
    kind: dose ? 'dose' : 'check',
    amount: dose && compound && typeof compound.amount === 'number' ? String(compound.amount) : '',
    /* Only a saved dose has a unit. Anything else starts with none picked. */
    unit: dose && compound && DOSE_UNITS.has(compound.unit) ? compound.unit : '',
    type: item ? routineItemType(item, view ? view.prefs : null) : presetType,
    time: timeMin != null ? routineClock24(timeMin) : '',
    onHand: item && typeof item.onHand === 'number' && Number.isInteger(item.onHand) ? String(item.onHand) : '',
    mixedOn: item && typeof item.mixedOn === 'string' ? item.mixedOn : '',
    blockIds: item ? placed : opened ? [opened] : [],
  };
}

export function sameItemDraft(a: ItemSheetDraft, b: ItemSheetDraft): boolean {
  return a.name === b.name && a.kind === b.kind && a.amount === b.amount && a.unit === b.unit && a.type === b.type && a.time === b.time
    && a.onHand === b.onHand && a.mixedOn === b.mixedOn && a.blockIds.join('\n') === b.blockIds.join('\n');
}

/* Built-in types in tab order, then the user's own. */
export function sheetTypeChoices(view: RoutineView | null): RoutineTypeChoice[] {
  const rank = (choice: RoutineTypeChoice) => {
    const at = (ROUTINE_TYPE_ORDER as readonly string[]).indexOf(choice.id);
    return at < 0 ? ROUTINE_TYPE_ORDER.length : at;
  };
  return routineTypeChoices(view ? view.prefs : null)
    .map((choice, index) => ({ choice, index }))
    .sort((a, b) => (a.choice.custom ? 1 : 0) - (b.choice.custom ? 1 : 0) || rank(a.choice) - rank(b.choice) || a.index - b.index)
    .map((row) => row.choice);
}

export interface SheetRoutine { id: string; full: string; name: string; color: string; window: ArcWindow | null }

/* The routines the sheet offers, in page order. A hidden routine is not
   offered. One with no window has no stroke on the path, only a chip. */
export function sheetRoutines(view: RoutineView | null): SheetRoutine[] {
  return (view ? view.blocks : []).map((block) => {
    const window = routineBlockWindow(block);
    const short = routineShortName(block) || block.name;
    return {
      id: block.id, full: block.name, name: short.length > 22 ? `${short.slice(0, 21).trimEnd()}…` : short, color: block.color,
      window: window ? { startMin: window.startMin, endMin: window.endMin } : null,
    };
  });
}

/* A tap on a type. The same type again clears it, unless that would leave
   the item with no type and no routine. A new item given the Peptide type
   becomes a dose, since a peptide is logged by amount. */
export function tapItemType(draft: ItemSheetDraft, type: string): { draft: ItemSheetDraft; refused: '' | RoutinesSheetsKey } {
  if (draft.type === type && !draft.blockIds.length) return { draft, refused: 'keepType' };
  const next = { ...draft, type: draft.type === type ? '' : type };
  if (type === 'peptide' && next.type === 'peptide' && !draft.itemId) next.kind = 'dose';
  return { draft: next, refused: '' };
}

/* A tap on a routine chip. The last routine of an untyped item stays picked. */
export function tapItemRoutine(draft: ItemSheetDraft, blockId: string): { draft: ItemSheetDraft; refused: '' | RoutinesSheetsKey } {
  const has = draft.blockIds.includes(blockId);
  if (has && draft.blockIds.length === 1 && !draft.type) return { draft, refused: 'keepRoutine' };
  return { draft: { ...draft, blockIds: has ? draft.blockIds.filter((id) => id !== blockId) : draft.blockIds.concat(blockId) }, refused: '' };
}

/* Why Save will not save this draft, in the app's own words. Empty when it
   can. A dose needs an amount above zero and a unit: zero is not an amount
   to log. */
export function itemDraftProblem(draft: ItemSheetDraft, today: string): string {
  const supply = supplyDraftError({ kind: draft.kind, onHand: draft.onHand, mixedOn: draft.mixedOn }, today);
  if (supply) return supply;
  if (!draft.blockIds.length && !draft.type) return rs('errPick');
  const named = draft.name.trim() !== '';
  if (draft.kind === 'dose') {
    const amount = parseSheetAmount(draft.amount);
    if (named && amount != null && amount > 0 && !draft.unit) return rs('pickUnit');
    if (!named || !doseSet(amount, draft.unit)) return rs('errDose');
  } else if (!named) return rs('errName');
  return '';
}

/* What the routines rules save from the draft. A blank time means the routine's start. */
export function itemSaveDraft(draft: ItemSheetDraft): ItemDraft {
  return {
    itemId: draft.itemId, name: draft.name, kind: draft.kind, amount: draft.amount, unit: draft.unit, type: draft.type,
    time: clockMinutes(draft.time) != null ? draft.time : '', blockIds: draft.blockIds, onHand: draft.onHand, mixedOn: draft.mixedOn,
  };
}

/* ---------- Mixed on ---------- */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A day key moved by whole days. Anything that is not a day key comes back empty. */
export function shiftDay(day: string, delta: number): string {
  const match = DAY.exec(day);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta));
  return date.toISOString().slice(0, 10);
}

/** "Mon, Nov 23" for a day key, in the phone's language. */
export function dayLabel(day: string): string {
  const match = DAY.exec(day);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  try { return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return day; }
}

/* The Mixed on day after a step. From blank, a step earlier starts at
   yesterday. A step never goes past today: a vial is not mixed tomorrow. */
export function stepMixedDay(mixedOn: string, delta: number, today: string): string {
  const from = DAY.test(mixedOn) ? mixedOn : today;
  const next = shiftDay(from, delta);
  return !next || next > today ? today : next;
}
