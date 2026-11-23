/* The rules for changing routines. Each rule takes the stored shape and
   returns the next one, or null when the change is refused. Nothing is
   written here; features/routines/store.ts saves the difference as rows.

   A log copies the amount and unit the user saved on the item. No rule
   here works out, rounds toward, or proposes an amount.

   Ported from the web app's pages/daily-routines.js. The web checks for the
   flag, the sign-in and the first pull, and its merge stamps, are not here:
   the phone's rows are written by the repository, last write wins per row. */

import { MAX_DAY_ROLLOVER_HOUR } from "./dose";
import { compoundFor, coveringLog, loggedDose, parseRoutineAmount, routineBlockRows, routineItemType, routineRestLog, ROUTINE_DOSE_UNITS } from "./day";
import { routineLogId, routinePlacementId } from "./ids";
import {
  clipText, isLive, ITEM_NOTE_MAX, projectRoutineStore,
  type RoutineCompound, type RoutineItem, type RoutineLog, type RoutinePlacement, type RoutineStore,
} from "./shape";
import { supplyFromDraft, type SupplyDraft } from "./supply";
import { clean, cleanName, logStamp, put, rowStampOf, stampAfter, start, timeToMin, type RoutineClock } from "./write";

export type { RoutineClock } from "./write";

const DOSE_UNIT_SET = new Set<string>(ROUTINE_DOSE_UNITS);

function checkOff(input: unknown, itemId: unknown, clock: RoutineClock, skipped: boolean): RoutineStore | null {
  if (typeof itemId !== "string" || !itemId) return null;
  const store = start(input, clock);
  const view = store && projectRoutineStore(store);
  if (!store || !view) return null;
  const item = view.items.find((row) => row.id === itemId);
  if (!item || coveringLog(view.logs, item.id, clock.day)) return null;
  const dose = loggedDose(view, item);
  const id = routineLogId(item.id, clock.day);
  const log: RoutineLog = skipped
    ? { id, itemId: item.id, compoundId: item.kind === "dose" ? item.compoundId || null : null, day: clock.day, status: "skipped", amount: null, unit: "", at: clock.now, updatedAt: 0, deletedAt: null }
    : { id, itemId: item.id, compoundId: dose.compoundId, day: clock.day, status: "done", amount: dose.amount, unit: dose.unit, at: clock.now, updatedAt: 0, deletedAt: null };
  return clean(put(store, "logs", log, logStamp(store, clock, id)));
}

/* One done log for the item on the routine day. A second log the same day is refused. */
export function logItem(store: unknown, itemId: unknown, clock: RoutineClock): RoutineStore | null {
  return checkOff(store, itemId, clock, false);
}

/* A skip is handled and not taken. It keeps no amount. */
export function skipItem(store: unknown, itemId: unknown, clock: RoutineClock): RoutineStore | null {
  return checkOff(store, itemId, clock, true);
}

function sameCheckOff(a: RoutineLog, b: RoutineLog): boolean {
  if (a.day !== b.day) return false;
  if (a.rest === true || b.rest === true) return a.rest === true && b.rest === true;
  return !!a.itemId && a.itemId === b.itemId;
}

/* Removes a check-off, skip, or rest. The log keeps its amount, unit, and
   note, and is marked undone. Every live log for the same item (or rest)
   and day goes, so a second copy does not leave the row done. */
export function undoLog(input: unknown, logId: unknown, clock: RoutineClock): RoutineStore | null {
  if (typeof logId !== "string" || !logId) return null;
  const store = start(input, clock, false);
  const log = store && store.logs.find((row) => row.id === logId);
  if (!store || !log || !isLive(log)) return null;
  const ids = new Set(store.logs.filter((row) => isLive(row) && (row.id === logId || sameCheckOff(row, log))).map((row) => row.id));
  const at = stampAfter(clock.now, Math.max(...store.logs.filter((row) => ids.has(row.id)).map(rowStampOf)));
  return clean({ ...store, logs: store.logs.map((row) => (ids.has(row.id) ? { ...row, updatedAt: at, deletedAt: at, undone: true } : row)) });
}

/* Restore brings back the amount, unit, and note the undo kept. A rest
   comes back as a rest. A day another log already covers is refused. */
export function restoreLog(input: unknown, logId: unknown, clock: RoutineClock): RoutineStore | null {
  if (typeof logId !== "string" || !logId) return null;
  const store = start(input, clock, false);
  const view = store && projectRoutineStore(store);
  const log = store && store.logs.find((row) => row.id === logId);
  if (!store || !view || !log || isLive(log) || log.undone !== true) return null;
  const at = stampAfter(clock.now, rowStampOf(log));
  if (log.rest === true) {
    if (routineRestLog(view.logs, log.day)) return null;
    return clean(put(store, "logs", { id: logId, itemId: null, compoundId: null, day: log.day, status: "done", amount: null, unit: "", at: clock.now, rest: true, updatedAt: 0, deletedAt: null }, at));
  }
  const item = view.items.find((row) => row.id === log.itemId);
  if (!item || coveringLog(view.logs, item.id, log.day)) return null;
  const dose = loggedDose(view, item);
  const skipped = log.status === "skipped";
  const restored: RoutineLog = {
    id: logId,
    itemId: item.id,
    compoundId: skipped ? null : dose.compoundId,
    day: log.day,
    status: skipped ? "skipped" : "done",
    amount: skipped ? null : log.amount != null ? log.amount : dose.amount,
    unit: skipped ? "" : log.unit || dose.unit,
    at: log.at > 0 ? log.at : clock.now,
    updatedAt: 0,
    deletedAt: null,
  };
  if (log.note) restored.note = log.note;
  if (!skipped && log.site) restored.site = log.site;
  return clean(put(store, "logs", restored, at));
}

/* One done log per open item in the routine. Skipped and already logged
   items are not open. A rest day covers every routine, so nothing is written. */
export function logAllInBlock(input: unknown, blockId: unknown, clock: RoutineClock): { store: RoutineStore; logIds: string[] } | null {
  if (typeof blockId !== "string" || !blockId) return null;
  const current = start(input, clock);
  const view = current && projectRoutineStore(current);
  if (!current || !view || !view.blocks.some((block) => block.id === blockId)) return null;
  if (routineRestLog(view.logs, clock.day)) return null;
  const seen = new Set<string>();
  let next = current;
  const logIds: string[] = [];
  for (const row of routineBlockRows(view, blockId, clock.day)) {
    const itemId = row.item.id;
    if (!row.open || !itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    const dose = loggedDose(view, row.item);
    const id = routineLogId(itemId, clock.day);
    logIds.push(id);
    next = put(next, "logs", { id, itemId, compoundId: dose.compoundId, day: clock.day, status: "done", amount: dose.amount, unit: dose.unit, at: clock.now, updatedAt: 0, deletedAt: null }, logStamp(next, clock, id));
  }
  const store = logIds.length ? clean(next) : null;
  return store ? { store, logIds } : null;
}

/* One rest covers the whole routine day. It is not an item log. */
export function logRest(input: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock);
  const view = store && projectRoutineStore(store);
  if (!store || !view || routineRestLog(view.logs, clock.day)) return null;
  const id = routineLogId(null, clock.day);
  return clean(put(store, "logs", { id, itemId: null, compoundId: null, day: clock.day, status: "done", amount: null, unit: "", at: clock.now, rest: true, updatedAt: 0, deletedAt: null }, logStamp(store, clock, id)));
}

/* Changes which local clock hour starts the routine day. Logs keep the day they were stored with. */
export function setDayRollover(input: unknown, hour: unknown, clock: RoutineClock): RoutineStore | null {
  if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > MAX_DAY_ROLLOVER_HOUR) return null;
  const store = start(input, clock, false);
  if (!store) return null;
  return { ...store, settings: { dayRolloverHour: hour, updatedAt: stampAfter(clock.now, store.settings.updatedAt) } };
}

export interface CalcInputs { vialAmount?: unknown; waterMl?: unknown; vialUnit?: unknown }

/* A note on a dose item. A blank clears it. The calculator's vial and water
   are kept beside a note it wrote, and cleared by any other note. Logs are not touched. */
export function saveItemNote(input: unknown, itemId: unknown, note: unknown, clock: RoutineClock, calc?: CalcInputs | null): RoutineStore | null {
  if (typeof itemId !== "string" || !itemId || typeof note !== "string") return null;
  const store = start(input, clock, false);
  const item = store && store.items.find((row) => row.id === itemId && isLive(row));
  if (!store || !item || item.kind !== "dose") return null;
  const next: RoutineItem = { ...item };
  const text = clipText(note, ITEM_NOTE_MAX);
  if (text) next.note = text;
  else delete next.note;
  delete next.calcVial;
  delete next.calcWater;
  delete next.calcVialUnit;
  if (calc && typeof calc.vialAmount === "number" && typeof calc.waterMl === "number") {
    next.calcVial = calc.vialAmount;
    next.calcWater = calc.waterMl;
    if (typeof calc.vialUnit === "string") next.calcVialUnit = calc.vialUnit;
  }
  return clean(put(store, "items", next, stampAfter(clock.now, rowStampOf(item))));
}

export function renameItem(input: unknown, itemId: unknown, name: unknown, clock: RoutineClock): RoutineStore | null {
  const trimmed = cleanName(name);
  if (!trimmed || typeof itemId !== "string" || !itemId) return null;
  const store = start(input, clock, false);
  const item = store && store.items.find((row) => row.id === itemId && isLive(row));
  if (!store || !item) return null;
  const at = stampAfter(clock.now, rowStampOf(item));
  let next = put(store, "items", { ...item, name: trimmed }, at);
  const compound = compoundFor(store, item);
  if (compound && isLive(compound)) next = put(next, "compounds", { ...compound, name: trimmed }, stampAfter(clock.now, rowStampOf(compound)));
  return clean(next);
}

/* The item and its placements go together. Its logs stay. The returned
   shape still holds the removed rows, marked deleted, so the same screen
   can put them back; once saved, a deleted row keeps no values on the phone. */
export function deleteItem(input: unknown, itemId: unknown, clock: RoutineClock): RoutineStore | null {
  if (typeof itemId !== "string" || !itemId) return null;
  const store = start(input, clock, false);
  const item = store && store.items.find((row) => row.id === itemId && isLive(row));
  if (!store || !item) return null;
  const at = stampAfter(clock.now, Math.max(rowStampOf(item), ...store.placements.filter((row) => row.itemId === itemId).map(rowStampOf)));
  return clean({
    ...store,
    items: store.items.map((row) => (row.id === itemId ? { ...row, updatedAt: at, deletedAt: at } : row)),
    placements: store.placements.map((row) => (isLive(row) && row.itemId === itemId ? { ...row, updatedAt: at, deletedAt: at } : row)),
  });
}

/* Puts back an item deleteItem removed, with the placements that went with it.
   It needs the shape deleteItem returned: the values are not kept anywhere else. */
export function restoreItem(input: unknown, itemId: unknown, clock: RoutineClock): RoutineStore | null {
  if (typeof itemId !== "string" || !itemId) return null;
  const store = start(input, clock, false);
  const item = store && store.items.find((row) => row.id === itemId);
  if (!store || !item || isLive(item) || !item.name) return null;
  const gone = item.deletedAt || 0;
  const at = stampAfter(clock.now, rowStampOf(item));
  const liveBlocks = new Set(store.blocks.filter(isLive).map((block) => block.id));
  return clean({
    ...store,
    items: store.items.map((row) => (row.id === itemId ? { ...row, updatedAt: at, deletedAt: null } : row)),
    placements: store.placements.map((row) => (row.itemId === itemId && row.deletedAt === gone && liveBlocks.has(row.blockId) ? { ...row, updatedAt: at, deletedAt: null } : row)),
  });
}

export interface ItemDraft extends SupplyDraft {
  itemId?: string | null; name?: unknown; amount?: unknown; unit?: unknown; type?: unknown; time?: unknown; blockIds?: readonly string[];
}

function doseDraft(kind: string, draft: ItemDraft): { amount: number | null; unit: string } | null {
  if (kind === "check") return { amount: null, unit: "" };
  if (kind !== "dose") return null;
  const amount = parseRoutineAmount(draft.amount);
  const unit = typeof draft.unit === "string" ? draft.unit : "";
  if (amount == null || !DOSE_UNIT_SET.has(unit)) return null;
  return { amount, unit };
}

/* An item turned from a dose into a check drops its compoundId. Its logs
   keep theirs, so turning it back into a dose reuses the newest live
   compound those logs name, and the dose history stays whole. */
function loggedCompoundId(store: RoutineStore, itemId: string): string {
  const logs = store.logs.filter((log) => log.itemId === itemId && !!log.compoundId).sort((a, b) => b.at - a.at || b.updatedAt - a.updatedAt);
  for (const log of logs) {
    const compound = store.compounds.find((row) => row.id === log.compoundId);
    if (compound && isLive(compound)) return compound.id;
  }
  return "";
}

/* Adds an item, or saves an edit of one. The name, amount and unit are what
   the user typed. A dose keeps its amount and unit on its compound. An
   untyped item needs at least one routine, or it would show nowhere.
   newId gives a fresh row id. Logs are not rewritten. */
export function saveItem(input: unknown, draft: ItemDraft | null | undefined, clock: RoutineClock, newId: () => string): { store: RoutineStore; itemId: string } | null {
  const name = cleanName(draft && draft.name);
  const kind = draft && (draft.kind === "dose" || draft.kind === "check") ? draft.kind : "";
  const dose = draft ? doseDraft(kind, draft) : null;
  const store = start(input, clock);
  if (!draft || !name || !dose || !store) return null;
  const shown = new Set(store.blocks.filter((block) => isLive(block) && block.hidden !== true).map((block) => block.id));
  const hidden = new Set(store.blocks.filter((block) => isLive(block) && block.hidden === true).map((block) => block.id));
  const blockIds = [...new Set((draft.blockIds || []).filter((id) => shown.has(id)))];
  const type = routineItemType({ type: typeof draft.type === "string" ? draft.type : undefined }, store.prefs);
  const existing = draft.itemId ? store.items.find((row) => row.id === draft.itemId) : undefined;
  if (draft.itemId && (!existing || !isLive(existing))) return null;
  const keptHidden = existing ? store.placements.filter((row) => isLive(row) && row.itemId === existing.id && hidden.has(row.blockId)) : [];
  if (!blockIds.length && !type) {
    const wasTyped = !!(existing && routineItemType(existing, store.prefs));
    if (wasTyped || !keptHidden.length) return null;
  }
  const typedTime = typeof draft.time === "string" && draft.time.trim() ? draft.time : "";
  const timeMin = typedTime ? timeToMin(typedTime) : null;
  if (typedTime && timeMin == null) return null;
  const supply = supplyFromDraft(draft, kind, clock.day, existing);
  if (!supply) return null;
  const itemId = existing ? existing.id : newId();
  const at = stampAfter(clock.now, rowStampOf(existing));
  let next = store;
  let compoundId = existing && existing.compoundId ? existing.compoundId : null;
  if (kind === "dose") {
    const previousId = compoundId || (existing ? loggedCompoundId(store, existing.id) : "");
    const previous = previousId ? store.compounds.find((row) => row.id === previousId) : undefined;
    const compound: RoutineCompound = {
      id: previous ? previous.id : newId(), name, amount: dose.amount, unit: dose.unit, startDate: previous && previous.startDate ? previous.startDate : clock.day,
      chartLine: !!(previous && previous.chartLine), archivedAt: null, updatedAt: 0, deletedAt: null,
    };
    next = put(next, "compounds", compound, stampAfter(clock.now, rowStampOf(previous)));
    compoundId = compound.id;
  }
  const item: RoutineItem = { ...(existing || { id: itemId, updatedAt: 0, deletedAt: null, startDate: clock.day }), name, kind, compoundId: kind === "dose" ? compoundId : null, deletedAt: null };
  if (type) item.type = type;
  else delete item.type;
  if (timeMin != null) item.timeMin = timeMin;
  else delete item.timeMin;
  for (const key of ["onHand", "onHandDay", "mixedOn"] as const) {
    if (!Object.prototype.hasOwnProperty.call(supply, key)) continue;
    const value = supply[key];
    if (value == null) delete item[key];
    else if (key === "onHand") item.onHand = value as number;
    else item[key] = value as string;
  }
  /* When the count was typed, so a dose logged later that day still counts against it. */
  if (Object.prototype.hasOwnProperty.call(supply, "onHandDay")) {
    if (supply.onHandDay) item.onHandAt = clock.now;
    else delete item.onHandAt;
  }
  next = put(next, "items", item, at);
  const chosen = new Set<string>([...blockIds, ...keptHidden.map((place) => place.blockId)]);
  for (const blockId of blockIds) {
    const id = routinePlacementId(blockId, itemId);
    const rows = next.placements.filter((row) => row.blockId === blockId && row.itemId === itemId);
    if (rows.some(isLive)) continue;
    const order = next.placements.filter((row) => isLive(row) && row.blockId === blockId).reduce((max, row) => Math.max(max, row.order + 1), 0);
    const placement: RoutinePlacement = { id, blockId, itemId, order, updatedAt: 0, deletedAt: null };
    next = put(next, "placements", placement, stampAfter(clock.now, rowStampOf(rows.find((row) => row.id === id))));
  }
  next = { ...next, placements: next.placements.map((row) => (isLive(row) && row.itemId === itemId && !chosen.has(row.blockId) ? { ...row, updatedAt: at, deletedAt: at } : row)) };
  const saved = clean(next);
  return saved ? { store: saved, itemId } : null;
}
