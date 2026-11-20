import { isLive } from "./daily-routines-store.js";

/* History for one month: a calendar, small day cards, and one graph.
   The graph counts logs. It never adds amounts, so 250 mcg and 5 mg
   stay two logs rather than one total.
   Missed is an empty ring, skipped is a dash, rest is a moon.
   A rest log (rest: true, or status "rest" when the store keeps it)
   marks that day. Decision 41 keeps this view to those three pieces. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const MONTHS = Object.freeze(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
const MONTHS_SHORT = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
const MARK_ORDER = Object.freeze(["rest", "missed", "skipped", "partial", "logged"]);

export const ROUTINE_GRAPH_TABS = Object.freeze([
  Object.freeze({ id: "logged", label: "Logged" }),
  Object.freeze({ id: "skipped", label: "Skipped" }),
]);

function validDay(value) {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function parseMonth(month) {
  if (typeof month !== "string" || !MONTH.test(month)) return null;
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  if (mon < 1 || mon > 12) return null;
  const probe = new Date(Date.UTC(year, mon - 1, 1));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== mon - 1) return null;
  return { year, mon, month };
}

function daysInMonth(parsed) {
  return new Date(Date.UTC(parsed.year, parsed.mon, 0)).getUTCDate();
}

function monthEnd(month) {
  const parsed = parseMonth(month);
  if (!parsed) return "";
  return `${month}-${String(daysInMonth(parsed)).padStart(2, "0")}`;
}

export function shiftRoutineMonth(month, delta) {
  const parsed = parseMonth(month);
  if (!parsed || typeof delta !== "number" || !Number.isFinite(delta)) return "";
  const utc = new Date(Date.UTC(parsed.year, parsed.mon - 1 + delta, 1));
  const year = utc.getUTCFullYear();
  const mon = String(utc.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${mon}`;
}

export function routineGraphTab(prefs) {
  const tab = prefs && prefs.historyGraph;
  return tab === "skipped" ? "skipped" : "logged";
}

export function routineMarkIcon(mark) {
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
    default: {
      const unexpected = mark;
      return { mark: "open", label: "", icon: "none", unexpected };
    }
  }
}

function isRestLog(log) {
  return !!(log && (log.rest === true || log.status === "rest"));
}

function byOrder(a, b) {
  const order = (a.order || 0) - (b.order || 0);
  if (order) return order;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function placedItems(view) {
  const items = new Map((view.items || []).filter(isLive).map((item) => [item.id, item]));
  const compounds = new Map((view.compounds || []).filter(isLive).map((row) => [row.id, row]));
  const blocks = (view.blocks || []).filter(isLive).slice().sort(byOrder);
  const seen = new Set();
  const rows = [];
  for (const block of blocks) {
    const places = (view.placements || [])
      .filter((row) => isLive(row) && row.blockId === block.id && items.has(row.itemId))
      .slice()
      .sort(byOrder);
    for (const place of places) {
      if (seen.has(place.itemId)) continue;
      seen.add(place.itemId);
      const item = items.get(place.itemId);
      rows.push({ item, compound: item.compoundId ? compounds.get(item.compoundId) || null : null });
    }
  }
  return rows;
}

function dueStart(entry, logs) {
  let start = entry.compound && validDay(entry.compound.startDate) ? entry.compound.startDate : null;
  if (entry.item && validDay(entry.item.startDate)) {
    start = start && start < entry.item.startDate ? start : entry.item.startDate;
  }
  for (const log of logs) {
    if (!isLive(log) || log.itemId !== entry.item.id || isRestLog(log) || !validDay(log.day)) continue;
    if (!start || log.day < start) start = log.day;
  }
  return start;
}

function coveringLog(logs, itemId) {
  const rows = logs.filter((log) => isLive(log) && log.itemId === itemId && !isRestLog(log));
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows[0] || null;
}

function itemMark(log, day, today, rest, start) {
  if (log && log.status === "skipped") return "skipped";
  if (log && log.status === "partial") return "partial";
  if (log && log.status === "done") return "logged";
  if (rest) return "none";
  if (!validDay(day) || !validDay(today) || day > today) return "none";
  if (start && day < start) return "none";
  if (day === today) return "open";
  if (start && day >= start) return "missed";
  return "none";
}

function logSnapshot(log) {
  if (!log) return null;
  return {
    id: log.id,
    status: log.status,
    amount: typeof log.amount === "number" ? log.amount : null,
    unit: typeof log.unit === "string" ? log.unit : "",
    rest: false,
  };
}

function dayMarks(rest, items) {
  if (rest) return ["rest"];
  const found = new Set(items.map((row) => row.mark));
  return MARK_ORDER.filter((mark) => mark !== "rest" && found.has(mark));
}

function daySummary(rest, items) {
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

function countLogs(logs, day, tab) {
  let logged = 0;
  let skipped = 0;
  for (const log of logs) {
    if (!isLive(log) || log.day !== day || isRestLog(log)) continue;
    if (log.status === "skipped") skipped += 1;
    else if (log.status === "done" || log.status === "partial") logged += 1;
  }
  switch (tab) {
    case "logged":
      return logged;
    case "skipped":
      return skipped;
    default: {
      const unexpected = tab;
      void unexpected;
      return logged;
    }
  }
}

export function shortRoutineDay(day) {
  if (!validDay(day)) return "";
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return `${MONTHS_SHORT[month - 1]} ${date}`;
}

export function longRoutineDay(day) {
  if (!validDay(day)) return "";
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return `${MONTHS[month - 1]} ${date}`;
}

function countLabel(tab, count) {
  if (tab === "skipped") return count === 1 ? "1 skip" : `${count} skips`;
  return count === 1 ? "1 log" : `${count} logs`;
}

export function routineHistoryCursor(current, today, patch) {
  if (!validDay(today)) return { month: "", day: "" };
  const limit = today.slice(0, 7);
  let month = current && typeof current.month === "string" ? current.month : limit;
  if (patch && typeof patch.month === "string") month = patch.month;
  if (patch && typeof patch.monthDelta === "number" && Number.isFinite(patch.monthDelta) && patch.monthDelta !== 0) {
    month = shiftRoutineMonth(month, patch.monthDelta) || month;
  }
  if (!parseMonth(month) || month > limit) month = limit;
  const requested = patch && typeof patch.day === "string" ? patch.day : "";
  let day = validDay(requested) ? requested : (current && validDay(current.day) ? current.day : today);
  if (!validDay(day) || day.slice(0, 7) !== month || day > today) {
    const end = monthEnd(month);
    day = end > today ? today : end;
    if (day.slice(0, 7) !== month) day = `${month}-01`;
  }
  return { month, day };
}

function emptyGraph(tab) {
  return { tab, unit: "count", points: [], selectedCount: 0, selectedLabel: "" };
}

export function routineHistoryView(view, options) {
  const today = options && options.today;
  const tab = options && options.tab === "skipped" ? "skipped" : "logged";
  const cursor = routineHistoryCursor(options, today, options || {});
  if (!cursor.month) {
    return {
      month: "",
      monthLabel: "",
      day: "",
      today: typeof today === "string" ? today : "",
      tab,
      nextMonth: false,
      cells: [],
      days: [],
      cards: [],
      graph: emptyGraph(tab),
    };
  }
  const source = view && typeof view === "object" ? view : {};
  const logs = Array.isArray(source.logs) ? source.logs : [];
  const items = placedItems(source).map((entry) => ({ ...entry, start: dueStart(entry, logs) }));
  const parsed = parseMonth(cursor.month);
  const lead = (new Date(Date.UTC(parsed.year, parsed.mon - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [];
  for (let pad = 0; pad < lead; pad += 1) cells.push({ kind: "pad" });
  const days = [];
  const total = daysInMonth(parsed);
  for (let date = 1; date <= total; date += 1) {
    const day = `${cursor.month}-${String(date).padStart(2, "0")}`;
    if (day > today) {
      cells.push({ kind: "day", day, future: true, marks: [], selected: false, today: false });
      continue;
    }
    const dayLogs = logs.filter((log) => isLive(log) && log.day === day);
    const rest = dayLogs.some(isRestLog);
    const rows = [];
    for (const entry of items) {
      const log = coveringLog(dayLogs, entry.item.id);
      const mark = itemMark(log, day, today, rest, entry.start);
      if (mark === "none") continue;
      rows.push({
        itemId: entry.item.id,
        name: entry.item.name || "Item",
        mark,
        log: logSnapshot(log),
      });
    }
    const record = {
      day,
      rest,
      mark: daySummary(rest, rows),
      marks: dayMarks(rest, rows),
      items: rows,
    };
    days.push(record);
    cells.push({
      kind: "day",
      day,
      future: false,
      marks: record.marks,
      selected: day === cursor.day,
      today: day === today,
    });
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
