/* History for one month: a calendar, small day cards, and one graph.
   The graph counts logs. It never adds amounts, so 250 mcg and 5 mg
   stay two logs rather than one total.
   Missed is an empty ring, skipped is a dash, rest is a moon.
   A rest log marks that day.

   Ported from the web app's shared/routine-history.js. */

import { routineItemType } from "./day";
import { routineBlockRunsOn } from "./dose";
import { isLive, validDay, type BlockLike, type CompoundLike, type ItemLike, type LogLike, type PrefsLike, type RoutineStore, type ViewLike } from "./shape";
import { clean, prefStamp, start, type RoutineClock } from "./write";

const MONTH = /^\d{4}-\d{2}$/;
const MONTHS = Object.freeze(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
const MONTHS_SHORT = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

export type RoutineGraphTab = "logged" | "skipped";
export type RoutineItemMark = "missed" | "skipped" | "partial" | "logged" | "open";
export type RoutineDayMark = RoutineItemMark | "rest";
type Mark = RoutineItemMark | "none";
const MARK_ORDER: readonly RoutineDayMark[] = Object.freeze(["rest", "missed", "skipped", "partial", "logged"]);

export const ROUTINE_GRAPH_TABS = Object.freeze([
  Object.freeze({ id: "logged", label: "Logged" }),
  Object.freeze({ id: "skipped", label: "Skipped" }),
] as const);

interface ParsedMonth { year: number; mon: number; month: string }

function parseMonth(month: unknown): ParsedMonth | null {
  if (typeof month !== "string" || !MONTH.test(month)) return null;
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  if (mon < 1 || mon > 12) return null;
  const probe = new Date(Date.UTC(year, mon - 1, 1));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== mon - 1) return null;
  return { year, mon, month };
}

function daysInMonth(parsed: ParsedMonth): number {
  return new Date(Date.UTC(parsed.year, parsed.mon, 0)).getUTCDate();
}

function monthEnd(month: string): string {
  const parsed = parseMonth(month);
  if (!parsed) return "";
  return `${month}-${String(daysInMonth(parsed)).padStart(2, "0")}`;
}

export function shiftRoutineMonth(month: unknown, delta: unknown): string {
  const parsed = parseMonth(month);
  if (!parsed || typeof delta !== "number" || !Number.isFinite(delta)) return "";
  const utc = new Date(Date.UTC(parsed.year, parsed.mon - 1 + delta, 1));
  const year = utc.getUTCFullYear();
  const mon = String(utc.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${mon}`;
}

export function routineGraphTab(prefs: PrefsLike | null | undefined): RoutineGraphTab {
  const tab = prefs && prefs.historyGraph;
  return tab === "skipped" ? "skipped" : "logged";
}

export interface RoutineMarkIcon { mark: string; label: string; icon: "ring" | "dash" | "moon" | "filled" | "none"; unexpected?: unknown }

export function routineMarkIcon(mark: unknown): RoutineMarkIcon {
  switch (mark) {
    case "missed":
      return { mark, label: "Missed", icon: "ring" };
    case "skipped":
      return { mark, label: "Skipped", icon: "dash" };
    case "rest":
      return { mark, label: "Rest", icon: "moon" };
    case "logged":
      return { mark, label: "Logged", icon: "filled" };
    case "partial":
      return { mark, label: "Partial", icon: "filled" };
    case "open":
      return { mark, label: "Open", icon: "none" };
    default:
      return { mark: "open", label: "", icon: "none", unexpected: mark };
  }
}

function isRestLog(log: LogLike | null | undefined): boolean {
  return !!(log && (log.rest === true || log.status === "rest"));
}

function byOrder(a: { order?: number; id?: string }, b: { order?: number; id?: string }): number {
  const order = (a.order || 0) - (b.order || 0);
  if (order) return order;
  const left = a.id || "";
  const right = b.id || "";
  return left < right ? -1 : left > right ? 1 : 0;
}

interface Entry { item: ItemLike; compound: CompoundLike | null; blocks: BlockLike[]; start: string | null }

function placedItems(view: ViewLike): Entry[] {
  const items = new Map((view.items || []).filter(isLive).map((item) => [item.id, item]));
  const compounds = new Map((view.compounds || []).filter(isLive).map((row) => [row.id, row]));
  /* A hidden routine is off the schedule, as on Routines and Home, so it
     makes nothing due. Its logs still show through rememberedLogs. */
  const blocks = (view.blocks || []).filter((block) => isLive(block) && block.hidden !== true).slice().sort(byOrder);
  const seen = new Map<string | undefined, Entry>();
  const rows: Entry[] = [];
  const entry = (item: ItemLike, placed: BlockLike[]): Entry => ({ item, compound: item.compoundId ? compounds.get(item.compoundId) || null : null, blocks: placed, start: null });
  for (const block of blocks) {
    const places = (view.placements || [])
      .filter((row) => isLive(row) && row.blockId === block.id && items.has(row.itemId))
      .slice()
      .sort(byOrder);
    for (const place of places) {
      const known = seen.get(place.itemId);
      if (known) {
        known.blocks.push(block);
        continue;
      }
      const row = entry(items.get(place.itemId) as ItemLike, [block]);
      seen.set(place.itemId, row);
      rows.push(row);
    }
  }
  /* An item made on a type tab can sit in no routine. It is due every day
     from its start, the same as on its tab. */
  const name = (item: ItemLike) => item.name || "";
  const loose = [...items.values()]
    .filter((item) => !seen.has(item.id) && routineItemType(item, view.prefs))
    .sort((a, b) => (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : (a.id || "") < (b.id || "") ? -1 : (a.id || "") > (b.id || "") ? 1 : 0));
  for (const item of loose) rows.push(entry(item, []));
  return rows;
}

function dueStart(entry: Entry, logs: readonly LogLike[]): string | null {
  let first: string | null = entry.compound && validDay(entry.compound.startDate) ? entry.compound.startDate : null;
  if (validDay(entry.item.startDate)) {
    first = first && first < entry.item.startDate ? first : entry.item.startDate;
  }
  for (const log of logs) {
    if (!isLive(log) || log.itemId !== entry.item.id || isRestLog(log) || !validDay(log.day)) continue;
    if (!first || log.day < first) first = log.day;
  }
  return first;
}

function coveringLog(logs: readonly LogLike[], itemId: string | undefined): LogLike | null {
  const rows = logs.filter((log) => isLive(log) && log.itemId === itemId && !isRestLog(log));
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || ((a.id || "") < (b.id || "") ? -1 : (a.id || "") > (b.id || "") ? 1 : 0));
  return rows[0] || null;
}

function itemMark(log: LogLike | null, day: string, today: string, rest: boolean, first: string | null): Mark {
  if (log && log.status === "skipped") return "skipped";
  if (log && log.status === "partial") return "partial";
  if (log && log.status === "done") return "logged";
  if (rest) return "none";
  if (!validDay(day) || !validDay(today) || day > today) return "none";
  if (first && day < first) return "none";
  if (day === today) return "open";
  if (first && day >= first) return "missed";
  return "none";
}

function markFromStatus(status: unknown): Mark {
  switch (status) {
    case "skipped":
      return "skipped";
    case "partial":
      return "partial";
    case "done":
      return "logged";
    default:
      return "none";
  }
}

/* On the phone a removed item keeps no name. Its dose logs still name their
   compound, so a removed dose is shown under that name. A removed check has
   only "Item". */
function rememberedName(view: ViewLike, log: LogLike & { itemId: string }): string {
  const item = (view.items || []).find((row) => row && row.id === log.itemId);
  if (item && typeof item.name === "string" && item.name) return item.name;
  const named = (id: unknown) => {
    const compound = typeof id === "string" && id ? (view.compounds || []).find((row) => row && row.id === id) : null;
    return compound && typeof compound.name === "string" ? compound.name : "";
  };
  return named(item && item.compoundId) || named(log.compoundId) || "Item";
}

/* A removed routine or item keeps its logs. Those logs still belong on the
   day they were written, even though the plan row is no longer placed. */
function rememberedLogs(dayLogs: readonly LogLike[], seen: Set<string>): (LogLike & { itemId: string })[] {
  const byItem = new Map<string, LogLike & { itemId: string }>();
  for (const log of dayLogs) {
    if (!isLive(log) || isRestLog(log) || typeof log.itemId !== "string" || !log.itemId || seen.has(log.itemId)) continue;
    const current = byItem.get(log.itemId);
    if (!current || (log.updatedAt || 0) >= (current.updatedAt || 0)) byItem.set(log.itemId, log as LogLike & { itemId: string });
  }
  return [...byItem.values()];
}

export interface HistoryLog { id: string; status: string; amount: number | null; unit: string; rest: false }

function logSnapshot(log: LogLike | null): HistoryLog | null {
  if (!log) return null;
  return {
    id: log.id || "",
    status: log.status || "",
    amount: typeof log.amount === "number" ? log.amount : null,
    unit: typeof log.unit === "string" ? log.unit : "",
    rest: false,
  };
}

export interface HistoryItem { itemId: string; name: string; mark: RoutineItemMark; log: HistoryLog | null }
export interface HistoryDay { day: string; rest: boolean; mark: RoutineDayMark | "none"; marks: RoutineDayMark[]; items: HistoryItem[] }
export type HistoryCell =
  | { kind: "pad" }
  | { kind: "day"; day: string; future: boolean; marks: RoutineDayMark[]; selected: boolean; today: boolean };
export interface HistoryGraph { tab: RoutineGraphTab; unit: "count"; points: { day: string; count: number }[]; selectedCount: number; selectedLabel: string }
export interface HistoryView {
  month: string; monthLabel: string; day: string; today: string; tab: RoutineGraphTab; nextMonth: boolean;
  cells: HistoryCell[]; days: HistoryDay[]; cards: HistoryDay[]; graph: HistoryGraph;
}

function dayMarks(rest: boolean, items: readonly HistoryItem[]): RoutineDayMark[] {
  if (rest) return ["rest"];
  const found = new Set<string>(items.map((row) => row.mark));
  return MARK_ORDER.filter((mark) => mark !== "rest" && found.has(mark));
}

function daySummary(rest: boolean, items: readonly HistoryItem[]): RoutineDayMark | "none" {
  if (rest) return "rest";
  if (items.some((row) => row.mark === "missed")) return "missed";
  const logged = items.some((row) => row.mark === "logged" || row.mark === "partial");
  const skipped = items.some((row) => row.mark === "skipped");
  if (skipped && !logged) return "skipped";
  if (items.some((row) => row.mark === "partial") && !items.some((row) => row.mark === "logged")) return "partial";
  if (logged) return "logged";
  if (skipped) return "skipped";
  if (items.some((row) => row.mark === "open")) return "open";
  return "none";
}

/* How many items were logged, or skipped, on a day. An item both skipped and
   logged that day counts as logged. */
function countLogs(logs: readonly LogLike[], day: string, tab: RoutineGraphTab): number {
  const logged = new Set<string>();
  const skipped = new Set<string>();
  for (const log of logs) {
    if (!isLive(log) || log.day !== day || isRestLog(log)) continue;
    const key = typeof log.itemId === "string" && log.itemId ? log.itemId : log.id || "";
    if (log.status === "skipped") skipped.add(key);
    else if (log.status === "done" || log.status === "partial") logged.add(key);
  }
  for (const key of logged) skipped.delete(key);
  return tab === "skipped" ? skipped.size : logged.size;
}

export function shortRoutineDay(day: unknown): string {
  if (!validDay(day)) return "";
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return `${MONTHS_SHORT[month - 1]} ${date}`;
}

export function longRoutineDay(day: unknown): string {
  if (!validDay(day)) return "";
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return `${MONTHS[month - 1]} ${date}`;
}

function countLabel(tab: RoutineGraphTab, count: number): string {
  if (tab === "skipped") return count === 1 ? "1 skip" : `${count} skips`;
  return count === 1 ? "1 log" : `${count} logs`;
}

export interface HistoryCursor { month: string; day: string }
export interface HistoryCursorPatch { month?: unknown; monthDelta?: unknown; day?: unknown }

/* The month and the day in view. Neither can pass today. A day outside the
   month in view becomes that month's last day, or today in this month. */
export function routineHistoryCursor(current: Partial<HistoryCursor> | null | undefined, today: unknown, patch?: HistoryCursorPatch | null): HistoryCursor {
  if (!validDay(today)) return { month: "", day: "" };
  const limit = today.slice(0, 7);
  let month = current && typeof current.month === "string" ? current.month : limit;
  if (patch && typeof patch.month === "string") month = patch.month;
  if (patch && typeof patch.monthDelta === "number" && Number.isFinite(patch.monthDelta) && patch.monthDelta !== 0) {
    month = shiftRoutineMonth(month, patch.monthDelta) || month;
  }
  if (!parseMonth(month) || month > limit) month = limit;
  const requested = patch && typeof patch.day === "string" ? patch.day : "";
  let day: string = validDay(requested) ? requested : current && validDay(current.day) ? current.day : today;
  if (!validDay(day) || day.slice(0, 7) !== month || day > today) {
    const end = monthEnd(month);
    day = end > today ? today : end;
    if (day.slice(0, 7) !== month) day = `${month}-01`;
  }
  return { month, day };
}

export interface HistoryOptions extends HistoryCursorPatch { today?: unknown; tab?: unknown }

export function routineHistoryView(view: ViewLike | null | undefined, options: HistoryOptions | null | undefined): HistoryView {
  const today = options && options.today;
  const tab: RoutineGraphTab = options && options.tab === "skipped" ? "skipped" : "logged";
  const seed = options || {};
  const cursor = routineHistoryCursor({ month: typeof seed.month === "string" ? seed.month : undefined, day: typeof seed.day === "string" ? seed.day : undefined }, today, seed);
  const parsed = parseMonth(cursor.month);
  if (!parsed || !validDay(today)) {
    return {
      month: "", monthLabel: "", day: "", today: typeof today === "string" ? today : "", tab, nextMonth: false,
      cells: [], days: [], cards: [], graph: { tab, unit: "count", points: [], selectedCount: 0, selectedLabel: "" },
    };
  }
  const source: ViewLike = view && typeof view === "object" ? view : {};
  const logs: readonly LogLike[] = Array.isArray(source.logs) ? source.logs : [];
  const items = placedItems(source).map((entry) => ({ ...entry, start: dueStart(entry, logs) }));
  const lead = (new Date(Date.UTC(parsed.year, parsed.mon - 1, 1)).getUTCDay() + 6) % 7;
  const cells: HistoryCell[] = [];
  for (let pad = 0; pad < lead; pad += 1) cells.push({ kind: "pad" });
  const days: HistoryDay[] = [];
  const total = daysInMonth(parsed);
  for (let date = 1; date <= total; date += 1) {
    const day = `${cursor.month}-${String(date).padStart(2, "0")}`;
    if (day > today) {
      cells.push({ kind: "day", day, future: true, marks: [], selected: false, today: false });
      continue;
    }
    const dayLogs = logs.filter((log) => isLive(log) && log.day === day);
    const rest = dayLogs.some(isRestLog);
    const rows: HistoryItem[] = [];
    for (const entry of items) {
      const log = coveringLog(dayLogs, entry.item.id);
      /* An item is due on a day one of its routines runs, or every day when
         it sits in none. A log on any other day still shows. */
      const due = !entry.blocks.length || entry.blocks.some((block) => routineBlockRunsOn(block, day));
      const mark = log || due ? itemMark(log, day, today, rest, entry.start) : "none";
      if (mark === "none") continue;
      rows.push({ itemId: entry.item.id || "", name: entry.item.name || "Item", mark, log: logSnapshot(log) });
    }
    const seen = new Set(rows.map((row) => row.itemId));
    for (const log of rememberedLogs(dayLogs, seen)) {
      const mark = markFromStatus(log.status);
      if (mark === "none") continue;
      rows.push({ itemId: log.itemId, name: rememberedName(source, log), mark, log: logSnapshot(log) });
    }
    const record: HistoryDay = { day, rest, mark: daySummary(rest, rows), marks: dayMarks(rest, rows), items: rows };
    days.push(record);
    cells.push({ kind: "day", day, future: false, marks: record.marks, selected: day === cursor.day, today: day === today });
  }
  const points = days.map((record) => ({ day: record.day, count: countLogs(logs, record.day, tab) }));
  const selected = days.find((record) => record.day === cursor.day) || null;
  const selectedCount = selected ? countLogs(logs, selected.day, tab) : 0;
  const cards = days.filter((record) => record.day === cursor.day || record.marks.length > 0).reverse();
  return {
    month: cursor.month,
    monthLabel: `${MONTHS[parsed.mon - 1]} ${parsed.year}`,
    day: cursor.day,
    today,
    tab,
    nextMonth: cursor.month < today.slice(0, 7),
    cells,
    days,
    cards,
    graph: {
      tab,
      unit: "count",
      points,
      selectedCount,
      selectedLabel: selected ? `${shortRoutineDay(selected.day)} · ${countLabel(tab, selectedCount)}` : "",
    },
  };
}

/* The last graph tab is remembered. Picking the tab already shown is refused, so nothing is written. */
export function rememberGraphTab(input: unknown, tab: unknown, clock: RoutineClock): RoutineStore | null {
  if (tab !== "logged" && tab !== "skipped") return null;
  const store = start(input, clock, false);
  if (!store || store.prefs.historyGraph === tab) return null;
  return clean({ ...store, prefs: { ...store.prefs, historyGraph: tab, updatedAt: prefStamp(store, clock) } });
}
