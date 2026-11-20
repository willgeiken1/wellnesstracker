import { app } from "../runtime.js";
import {
  canMutateRoutines,
  isLive,
  normalizeDailyRoutines,
  projectDailyRoutines,
  putDailyRoutines,
  routineId,
  routineLogId,
  seedDefaultBlocks,
  tombstoneLog,
  upsertEntity,
} from "../shared/daily-routines-store.js";

/* Routines tab. The flag stays off in source. This module paints only when
   app.ROUTINES_ENABLED is true. A signed-out session gets a sign-in prompt
   and no dailyRoutines write.

   Check-off writes one log per item and day (routineLogId). Undo calls
   tombstoneLog, which keeps only id, day, status, and the stamps, on every
   live log for that item (or rest) and day. Restore writes a fresh log for
   that item and day.

   The day key is app.today(). The clock face is app.routineNow(). Do not
   derive the day from the clock's UTC instant. */

const TILE_COLORS = new Set(["citrus", "lavender", "pink"]);
const DEFAULT_START = new Map([
  ["Morning routine", 5],
  ["Supplement & enhancer stack", 12],
  ["Night routine", 17],
]);
const SLOT_LABEL = ["Morning", "Afternoon", "Night"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EXAMPLE_ITEMS = [
  { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" },
  { name: "Example Compound B", kind: "check" },
  { name: "Example Compound C", kind: "check" },
  { name: "Example Compound D", kind: "check" },
];

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function shellDate() {
  if (typeof app.routineNow === "function") {
    const value = app.routineNow();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  }
  return new Date();
}

function todayKey(date) {
  if (typeof app.today === "function") {
    const day = app.today();
    if (typeof day === "string" && day) return day;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function routineClock() {
  const date = shellDate();
  const stamp = date.getTime();
  const day = todayKey(date);
  return {
    date,
    day: typeof day === "string" ? day : "",
    now: Number.isFinite(stamp) ? stamp : 0,
  };
}

function stampAfter(now, previous) {
  const at = typeof now === "number" && Number.isFinite(now) ? now : 0;
  const prev = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
  const next = at > prev ? at : prev + 1;
  return next > 0 ? next : 1;
}

function maxStamp(...values) {
  let best = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > best) best = value;
  }
  return best;
}

function existingLogStamp(store, id) {
  const log = (store.logs || []).find((row) => row && row.id === id);
  if (!log) return 0;
  return maxStamp(log.updatedAt, log.deletedAt);
}

/* A replacement has to beat the row it replaces, including a tombstone,
   and the store clock. A preference edit must not rewind that clock. */
function writeStamp(store, clock, id) {
  return stampAfter(clock.now, maxStamp(store.updatedAt, existingLogStamp(store, id)));
}

function prefStamp(store, clock) {
  return stampAfter(clock.now, maxStamp(store.updatedAt, store.prefs && store.prefs.updatedAt));
}

export function routineSlotIndex(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
}

export function formatRoutineClock(date) {
  let hour = date.getHours();
  const min = String(date.getMinutes()).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${min} ${suffix}`;
}

export function formatRoutineWait(waitMin) {
  if (typeof waitMin !== "number" || !Number.isFinite(waitMin) || waitMin < 0) return "";
  if (waitMin < 1) return "now";
  const hours = Math.floor(waitMin / 60);
  const mins = waitMin % 60;
  if (hours && mins) return `in ${hours} hr ${mins} min`;
  if (hours) return hours === 1 ? "in 1 hr" : `in ${hours} hr`;
  return mins === 1 ? "in 1 min" : `in ${mins} min`;
}

/* Which block is current follows block order and the time of day.
   Slot 0 is morning (05:00), slot 1 afternoon (12:00), slot 2 night (17:00).
   The countdown uses the default block name. A renamed block has no countdown. */
export function routineNowNext(blocks, date) {
  const live = (Array.isArray(blocks) ? blocks : []).filter((block) => isLive(block));
  const sorted = live.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!sorted.length) return { nowBlock: null, nextBlock: null, waitMin: null, slot: routineSlotIndex(date) };
  const slot = routineSlotIndex(date);
  const index = Math.min(slot, sorted.length - 1);
  const nowBlock = sorted[index];
  const nextBlock = sorted[(index + 1) % sorted.length];
  const same = nextBlock.id === nowBlock.id;
  const start = same ? null : DEFAULT_START.get(nextBlock.name);
  let waitMin = null;
  if (typeof start === "number") {
    const nowMin = date.getHours() * 60 + date.getMinutes();
    let target = start * 60;
    if (target <= nowMin) target += 24 * 60;
    waitMin = target - nowMin;
  }
  return { nowBlock, nextBlock: same ? null : nextBlock, waitMin, slot };
}

/* Count of doses logged today. One item counts once. Skips and rest are not doses. Amounts are not summed. */
export function loggedTodayCount(logs, day) {
  if (!Array.isArray(logs) || typeof day !== "string") return 0;
  const seen = new Set();
  for (const log of logs) {
    if (!isLive(log) || log.day !== day || log.status === "skipped" || log.rest === true) continue;
    seen.add(log.itemId || log.id);
  }
  return seen.size;
}

function parseRoutineLogId(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith("rest_")) {
    const day = id.slice(5);
    return DAY.test(day) ? { rest: true, day } : null;
  }
  if (id.startsWith("log_") && id.length > 15 && id.charAt(id.length - 11) === "_" && DAY.test(id.slice(-10))) {
    const itemId = id.slice(4, -11);
    return itemId ? { itemId, day: id.slice(-10) } : null;
  }
  return null;
}

/* Calendar steps stay on the year-month-day fields. The UTC date is only
   the calculator, so a US evening that is already the next UTC day does
   not skip a local day. */
export function shiftRoutineDay(day, delta) {
  if (typeof day !== "string" || !DAY.test(day) || typeof delta !== "number" || !Number.isFinite(delta)) return "";
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, date + delta));
  return utc.toISOString().slice(0, 10);
}

function logTouchesDay(log) {
  if (!isLive(log) || typeof log.day !== "string" || !DAY.test(log.day)) return false;
  if (log.rest === true) return true;
  return log.status === "done" || log.status === "partial" || log.status === "skipped";
}

/* Consecutive days touched by a done, partial, skip, or rest log.
   Today counts only once something is logged. A day with no log, after
   the first touched day, is a full miss and stops the run. A skip touches
   the day, so it does not stop the run. */
export function routineStreak(logs, day) {
  if (typeof day !== "string" || !DAY.test(day)) return 0;
  const touched = new Set();
  for (const log of Array.isArray(logs) ? logs : []) {
    if (logTouchesDay(log)) touched.add(log.day);
  }
  let earliest = "";
  for (const key of touched) if (!earliest || key < earliest) earliest = key;
  if (!earliest) return 0;
  let streak = touched.has(day) ? 1 : 0;
  let cursor = shiftRoutineDay(day, -1);
  let guard = 0;
  while (cursor && cursor >= earliest && guard < 4000) {
    if (!touched.has(cursor)) break;
    streak += 1;
    cursor = shiftRoutineDay(cursor, -1);
    guard += 1;
  }
  return streak;
}

function tileColor(color) {
  return TILE_COLORS.has(color) ? color : "citrus";
}

function formatAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  return String(Math.round(amount * 1000) / 1000);
}

function compoundFor(projected, item) {
  if (!item || !item.compoundId) return null;
  return (projected.compounds || []).find((row) => row.id === item.compoundId) || null;
}

function blockItems(projected, blockId) {
  const items = new Map((projected.items || []).map((item) => [item.id, item]));
  return (projected.placements || [])
    .filter((row) => row.blockId === blockId && items.has(row.itemId))
    .slice()
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((placement) => {
      const item = items.get(placement.itemId);
      return { placement, item, compound: compoundFor(projected, item) };
    });
}

function coveringLog(logs, itemId, day) {
  const rows = (Array.isArray(logs) ? logs : []).filter((log) => isLive(log) && log.itemId === itemId && log.day === day && log.rest !== true);
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows[0] || null;
}

export function routineBlockRows(projected, blockId, day) {
  return blockItems(projected, blockId).map((row) => {
    const log = coveringLog(projected && projected.logs, row.item.id, day);
    return { ...row, log, open: !log };
  });
}

function doseText(row) {
  const amount = row.compound ? formatAmount(row.compound.amount) : "";
  const unit = row.compound && row.compound.unit ? row.compound.unit : "";
  if (!amount) return "";
  return unit ? `${amount} ${unit}` : amount;
}

/* A completed row shows what was logged. The compound amount is only the
   amount a new tap will write. */
function loggedDoseText(log) {
  if (!log || log.status === "skipped") return "";
  const amount = formatAmount(log.amount);
  if (!amount) return "";
  return log.unit ? `${amount} ${log.unit}` : amount;
}

function rowState(log) {
  if (!log) return "open";
  if (log.status === "skipped") return "skipped";
  if (log.status === "partial") return "partial";
  return "done";
}

/* A signed-in client that has not finished its account pull must not write.
   save() would schedule a push, and that push can replace the cloud blob
   before the phone has seen it. */
function accountPullPending() {
  return !!(app.sb && app.cloudPullOk !== true);
}

function refuseWrite() {
  return !canMutateRoutines() || accountPullPending();
}

function withStore(state, mutate) {
  if (refuseWrite() || !state || typeof state !== "object") return false;
  const clock = routineClock();
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current) return false;
  const next = mutate(current, clock);
  if (!next) return false;
  return putDailyRoutines(state, next);
}

function wrote(next, collection, id, at) {
  const row = (next[collection] || []).find((item) => item && item.id === id);
  return row && row.updatedAt === at ? next : null;
}

export function logRoutineItem(state, itemId) {
  if (typeof itemId !== "string" || !itemId) return false;
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    const item = (view.items || []).find((row) => row.id === itemId);
    if (!item || coveringLog(view.logs, item.id, clock.day)) return null;
    const compound = compoundFor(view, item);
    const id = routineLogId(item.id, clock.day);
    const at = writeStamp(store, clock, id);
    const next = upsertEntity(store, "logs", {
      id,
      itemId: item.id,
      compoundId: item.compoundId || null,
      day: clock.day,
      status: "done",
      amount: compound && typeof compound.amount === "number" ? compound.amount : null,
      unit: compound && compound.unit ? compound.unit : "",
      at: clock.now,
      deletedAt: null,
    }, at);
    return wrote(next, "logs", id, at);
  });
}

export function skipRoutineItem(state, itemId) {
  if (typeof itemId !== "string" || !itemId) return false;
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    const item = (view.items || []).find((row) => row.id === itemId);
    if (!item || coveringLog(view.logs, item.id, clock.day)) return null;
    const id = routineLogId(item.id, clock.day);
    const at = writeStamp(store, clock, id);
    const next = upsertEntity(store, "logs", {
      id,
      itemId: item.id,
      compoundId: item.compoundId || null,
      day: clock.day,
      status: "skipped",
      amount: null,
      unit: "",
      at: clock.now,
      deletedAt: null,
    }, at);
    return wrote(next, "logs", id, at);
  });
}

function sameCheckOff(a, b) {
  if (!a || !b || a.day !== b.day) return false;
  if (a.rest === true || b.rest === true) return a.rest === true && b.rest === true;
  return !!a.itemId && a.itemId === b.itemId;
}

/* Removes a check-off, skip, or rest from today. tombstoneLog keeps only
   id, day, status, updatedAt, and deletedAt, newer than the live copy.
   Every live log for the same item (or rest) and day goes, so an older
   random-id copy from the other phone does not leave the row done. */
export function undoRoutineLog(state, logId) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    const log = (store.logs || []).find((row) => row && row.id === logId);
    if (!log || !isLive(log)) return null;
    const ids = (store.logs || []).filter((row) => isLive(row) && (row.id === logId || sameCheckOff(row, log))).map((row) => row.id);
    const latest = Math.max(store.updatedAt || 0, ...store.logs.filter((row) => ids.includes(row.id)).map((row) => row.updatedAt || 0));
    const at = stampAfter(clock.now, latest);
    let next = store;
    for (const id of ids) next = next && tombstoneLog(next, id, at);
    const rows = (next && next.logs || []).filter((item) => ids.includes(item.id));
    if (rows.length !== ids.length || rows.some((row) => !(row.deletedAt > 0))) return null;
    const row = rows.find((item) => item.id === logId);
    if (!row || row.updatedAt !== at) return null;
    return next;
  });
}

/* The tombstone no longer carries the item or the amount. A restore writes a
   fresh log for that item and day, or a fresh rest, at a newer stamp. */
export function restoreRoutineLog(state, logId) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    const log = (store.logs || []).find((row) => row && row.id === logId);
    const parsed = parseRoutineLogId(logId);
    if (!log || isLive(log) || !parsed) return null;
    const at = stampAfter(clock.now, Math.max(log.updatedAt || 0, log.deletedAt || 0, store.updatedAt || 0));
    if (parsed.rest) {
      const next = upsertEntity(store, "logs", {
        id: logId, itemId: null, compoundId: null, day: parsed.day, status: "done",
        amount: null, unit: "", at: clock.now, rest: true, deletedAt: null,
      }, at);
      const row = (next.logs || []).find((item) => item.id === logId);
      if (!row || !isLive(row) || row.rest !== true) return null;
      return next;
    }
    const view = projectDailyRoutines(store);
    const item = (view.items || []).find((row) => row.id === parsed.itemId);
    if (!item) return null;
    const compound = compoundFor(view, item);
    const skipped = log.status === "skipped";
    const next = upsertEntity(store, "logs", {
      id: logId,
      itemId: item.id,
      compoundId: item.compoundId || null,
      day: parsed.day,
      status: skipped ? "skipped" : "done",
      amount: skipped ? null : (compound && typeof compound.amount === "number" ? compound.amount : null),
      unit: skipped ? "" : (compound && compound.unit ? compound.unit : ""),
      at: clock.now,
      deletedAt: null,
    }, at);
    const row = (next.logs || []).find((itemRow) => itemRow.id === logId);
    if (!row || !isLive(row) || row.itemId !== item.id) return null;
    return next;
  });
}

export function logRoutineRest(state) {
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    if ((view.logs || []).some((log) => log.rest === true && log.day === clock.day)) return null;
    const id = routineLogId(null, clock.day);
    const at = writeStamp(store, clock, id);
    const next = upsertEntity(store, "logs", {
      id,
      itemId: null,
      compoundId: null,
      day: clock.day,
      status: "done",
      amount: null,
      unit: "",
      at: clock.now,
      rest: true,
      deletedAt: null,
    }, at);
    return wrote(next, "logs", id, at);
  });
}

export function toggleRoutineFocus(state) {
  return withStore(state, (store, clock) => {
    const at = prefStamp(store, clock);
    store.prefs = { ...store.prefs, focusMode: !(store.prefs && store.prefs.focusMode === true), updatedAt: at };
    store.updatedAt = at;
    return store;
  });
}

export function toggleRoutineReveal(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    if (!(store.blocks || []).some((block) => block.id === blockId && isLive(block))) return null;
    const current = Array.isArray(store.prefs && store.prefs.revealBlocks)
      ? store.prefs.revealBlocks.filter((id) => typeof id === "string" && id)
      : [];
    const revealBlocks = current.includes(blockId) ? current.filter((id) => id !== blockId) : current.concat(blockId);
    const at = prefStamp(store, clock);
    store.prefs = { ...store.prefs, revealBlocks, updatedAt: at };
    store.updatedAt = at;
    return store;
  });
}

/* Minimal stand-in until block and item editing ships. Four synthetic names,
   then the button stops. The first is the example dose row. */
export function addExampleRoutineItem(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    const view = projectDailyRoutines(store);
    if (!(view.blocks || []).some((block) => block.id === blockId)) return null;
    const used = new Set((view.items || []).map((item) => item.name));
    const example = EXAMPLE_ITEMS.find((row) => !used.has(row.name));
    if (!example || !DAY.test(clock.day)) return null;
    const at = stampAfter(clock.now, store.updatedAt);
    const itemId = routineId("item");
    let next = store;
    let compoundId = null;
    if (example.kind === "dose") {
      compoundId = routineId("compound");
      next = upsertEntity(next, "compounds", {
        id: compoundId,
        name: example.name,
        amount: example.amount,
        unit: example.unit,
        startDate: clock.day,
        archivedAt: null,
        deletedAt: null,
      }, at);
      if (!wrote(next, "compounds", compoundId, at)) return null;
    }
    next = upsertEntity(next, "items", {
      id: itemId,
      name: example.name,
      kind: example.kind,
      compoundId,
      deletedAt: null,
    }, at);
    if (!wrote(next, "items", itemId, at)) return null;
    const order = (projectDailyRoutines(next).placements || [])
      .filter((row) => row.blockId === blockId)
      .reduce((max, row) => Math.max(max, row.order || 0), -1) + 1;
    const placementId = routineId("place");
    next = upsertEntity(next, "placements", {
      id: placementId,
      blockId,
      itemId,
      order,
      deletedAt: null,
    }, at);
    return wrote(next, "placements", placementId, at);
  });
}

/* Writes the three default blocks once, only for a signed-in flag-on session.
   A store that already has a live block is left alone, including its logs. */
export function ensureRoutineShell(state, now = Date.now()) {
  if (!canMutateRoutines() || !state || typeof state !== "object" || accountPullPending()) return null;
  const before = state.dailyRoutines;
  const hadLive = !!(before && Array.isArray(before.blocks) && before.blocks.some((block) => isLive(block)));
  if (!hadLive) {
    const prior = normalizeDailyRoutines(before);
    const seeded = seedDefaultBlocks(before, now);
    /* Every default already has a row (a deleted one keeps its tombstone):
       nothing to write, so no save and no push on each paint. */
    if (!prior || seeded.blocks.length > prior.blocks.length) {
      if (!putDailyRoutines(state, seeded)) return null;
      if (typeof app.save === "function") app.save();
    }
  }
  return projectDailyRoutines(state.dailyRoutines);
}

function pageHeader(title, sub, gear) {
  if (typeof app.pageHead === "function") return app.pageHead(title, sub, gear ? { left: gear } : {});
  return `<div class="page-head"><div class="ph-text"><h1 class="page-title">${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ""}</div>${gear || ""}</div>`;
}

const GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"/></svg>`;
const CHECK = `<svg class="dr-streak-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 16.7 19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function gearButton() {
  return `<button type="button" class="icon-btn dr-gear" data-action="routines-settings" aria-label="Routines settings">${GEAR}</button>`;
}

function signInHTML() {
  return `<div class="dr-page" data-routines-shell="signed-out">
    ${pageHeader("Routines", "Sign in required")}
    <section class="dr-signin">
      <h2>Sign in to use Routines</h2>
      <p>Routines stay on your Insight account. Nothing is saved on this phone until you sign in.</p>
      <button type="button" class="btn primary block" data-action="auth-open">Sign in</button>
    </section>
  </div>`;
}

function streakHTML(streak) {
  const mark = streak > 0 ? CHECK : "";
  const unit = streak === 1 ? "day" : "days";
  return `<p class="dr-streak" data-streak="${streak}"><span class="dr-vh">Streak </span>${mark}<b>${streak}</b><span class="dr-vh"> ${unit}</span></p>`;
}

function focusSwitch(on) {
  return `<div class="dr-focus">
    <span id="dr-focus-label">Focus mode</span>
    <button type="button" class="switch" role="switch" aria-checked="${on ? "true" : "false"}" aria-labelledby="dr-focus-label" data-action="routines-focus"><i></i></button>
  </div>`;
}

function restHTML(log) {
  if (!log) {
    return `<div class="dr-rest"><button type="button" class="dr-rest-btn" data-action="routines-rest">Log rest</button></div>`;
  }
  return `<div class="dr-rest"><span>Rest logged</span><button type="button" class="dr-undo" data-action="routines-undo" data-log-id="${esc(log.id)}">Undo <span class="dr-vh">rest</span></button></div>`;
}

function nowFooter(projected, date) {
  const day = todayKey(date);
  const count = loggedTodayCount(projected.logs, day);
  const streak = routineStreak(projected.logs, day);
  const focusOn = !!(projected.prefs && projected.prefs.focusMode === true);
  const rest = (projected.logs || []).find((log) => log.rest === true && log.day === day) || null;
  return `<div class="dr-pills">
      <p class="dr-count" data-logged="${count}"><b>${count}</b> logged today</p>
      ${streakHTML(streak)}
    </div>
    ${focusSwitch(focusOn)}
    ${restHTML(rest)}`;
}

export function routineNowHTML(projected, date) {
  const moment = routineNowNext(projected.blocks, date);
  const clock = formatRoutineClock(date);
  const slot = SLOT_LABEL[moment.slot] || "Today";
  const day = todayKey(date);
  const footer = nowFooter(projected, date);
  if (!moment.nowBlock) {
    return `<section class="dr-now" data-color="lavender" aria-labelledby="dr-now-title">
      <p class="dr-k">Now · ${esc(clock)}</p>
      <h2 class="dr-now-title" id="dr-now-title">Nothing scheduled</h2>
      <p class="dr-next">${esc(slot)}. Add a routine to see what comes next.</p>
      ${footer}
    </section>`;
  }
  const wait = formatRoutineWait(moment.waitMin);
  const next = moment.nextBlock
    ? `Next · ${esc(moment.nextBlock.name)}${wait ? `<span class="dr-wait">${esc(wait)}</span>` : ""}`
    : "Nothing else today";
  const rows = routineBlockRows(projected, moment.nowBlock.id, day);
  const open = rows.filter((row) => row.open).length;
  const logged = rows.filter((row) => !row.open && rowState(row.log) !== "skipped").length;
  const skipped = rows.filter((row) => !row.open && rowState(row.log) === "skipped").length;
  const statusText = rows.length && !open ? tileMeta(open, logged, skipped) : "";
  const status = statusText ? `<p class="dr-status">${esc(statusText)}</p>` : "";
  const color = tileColor(moment.nowBlock.color);
  return `<section class="dr-now" data-color="${color}" aria-labelledby="dr-now-title">
    <p class="dr-k">Now · ${esc(slot)} · ${esc(clock)}</p>
    <h2 class="dr-now-title" id="dr-now-title">${esc(moment.nowBlock.name)}</h2>
    <p class="dr-next">${next}</p>
    ${status}
    ${footer}
  </section>`;
}

function tileKicker(block) {
  if (block.name === "Night routine") return "Night";
  if (block.name === "Supplement & enhancer stack") return "Stack";
  if (block.name === "Morning routine") return "Morning";
  return "Routine";
}

function tileMeta(open, logged, skipped) {
  const total = open + logged + skipped;
  if (!total) return "No items yet";
  if (!open && skipped && !logged) return "All skipped";
  if (!open) return "All done";
  if (!logged && !skipped) return open === 1 ? "1 item" : `${open} items`;
  return open === 1 ? "1 to log" : `${open} to log`;
}

function openRowHTML(row) {
  const dose = doseText(row);
  const doseHTML = dose ? `<span class="dr-dose"> · ${esc(dose)}</span>` : "";
  return `<li class="dr-row" data-item-id="${esc(row.item.id)}" data-state="open">
    <button type="button" class="dr-log" data-action="routines-log" data-item-id="${esc(row.item.id)}">
      <span class="dr-mark" aria-hidden="true"></span>
      <span class="dr-copy"><span class="dr-vh">Log </span><span class="dr-name">${esc(row.item.name)}</span>${doseHTML}</span>
    </button>
    <button type="button" class="dr-skip" data-action="routines-skip" data-item-id="${esc(row.item.id)}">Skip <span class="dr-vh">${esc(row.item.name)}</span></button>
  </li>`;
}

function doneRowHTML(row) {
  const state = rowState(row.log);
  const label = state === "skipped" ? "Skipped" : "Logged";
  const markClass = state === "skipped" ? "dr-mark dr-mark-skip" : "dr-mark dr-mark-on";
  const mark = state === "skipped" ? "–" : "✓";
  const dose = loggedDoseText(row.log);
  const doseHTML = dose ? `<span class="dr-dose"> · ${esc(dose)}</span>` : "";
  return `<li class="dr-row dr-row-done" data-item-id="${esc(row.item.id)}" data-state="${state}">
    <span class="${markClass}" aria-hidden="true">${mark}</span>
    <span class="dr-copy"><span class="dr-name">${esc(row.item.name)}</span>${doseHTML}<span class="dr-state">${label}</span></span>
    <button type="button" class="dr-undo" data-action="routines-undo" data-log-id="${esc(row.log.id)}">Undo <span class="dr-vh">${esc(row.item.name)}</span></button>
  </li>`;
}

export function routineBlockTileHTML(block, projected, view) {
  const day = view && view.day ? view.day : routineClock().day;
  const rows = routineBlockRows(projected, block.id, day);
  const open = rows.filter((row) => row.open);
  const done = rows.filter((row) => !row.open);
  const logged = done.filter((row) => rowState(row.log) !== "skipped").length;
  const skipped = done.length - logged;
  const revealed = !!(view && view.revealed);
  const current = !!(view && view.current);
  const dim = !!(view && view.focus && !current);
  const color = tileColor(block.color);
  const reveal = done.length
    ? `<button type="button" class="dr-reveal" data-action="routines-reveal" data-block-id="${esc(block.id)}" aria-expanded="${revealed ? "true" : "false"}">${revealed ? "Hide" : "Show"} ${done.length === 1 ? "1 completed" : `${done.length} completed`}</button>`
    : "";
  const doneList = revealed && done.length ? `<ul class="dr-done">${done.map(doneRowHTML).join("")}</ul>` : "";
  const namesLeft = EXAMPLE_ITEMS.some((example) => !(projected.items || []).some((item) => item.name === example.name));
  const add = namesLeft
    ? `<button type="button" class="dr-add" data-action="routines-add-item" data-block-id="${esc(block.id)}">Add item <span class="dr-vh">to ${esc(block.name)}</span></button>`
    : "";
  return `<article class="dr-tile${dim ? " dr-dim" : ""}" data-color="${color}" data-block-id="${esc(block.id)}" data-current="${current ? "true" : "false"}">
    <p class="dr-k">${esc(tileKicker(block))}</p>
    <h3>${esc(block.name)}</h3>
    <p class="dr-tile-meta">${esc(tileMeta(open.length, logged, skipped))}</p>
    ${open.length ? `<ul class="dr-rows">${open.map(openRowHTML).join("")}</ul>` : ""}
    ${reveal}
    ${doneList}
    ${add}
  </article>`;
}

export function routineBlockTilesHTML(projected, date) {
  const clock = date instanceof Date && !Number.isNaN(date.getTime()) ? date : routineClock().date;
  const day = todayKey(clock);
  const moment = routineNowNext(projected.blocks, clock);
  const focus = !!(projected.prefs && projected.prefs.focusMode === true);
  const revealed = new Set(Array.isArray(projected.prefs && projected.prefs.revealBlocks) ? projected.prefs.revealBlocks.filter((id) => typeof id === "string") : []);
  const currentId = moment.nowBlock ? moment.nowBlock.id : "";
  const tiles = (projected.blocks || []).map((block) => routineBlockTileHTML(block, projected, {
    day,
    current: block.id === currentId,
    focus,
    revealed: revealed.has(block.id),
  })).join("");
  return `<div class="dr-tiles" data-focus="${focus ? "on" : "off"}">${tiles}</div>`;
}

function emptyDiscoverHTML() {
  return `<section class="dr-empty">
    <h2>Add the first item</h2>
    <p>Discover will list entries from real studies. Nothing is added until you choose it.</p>
    <button type="button" class="btn primary block" data-action="routines-discover">Discover</button>
  </section>`;
}

function waitingHTML(date) {
  const sub = typeof app.fmtDate === "function"
    ? app.fmtDate(todayKey(date), { weekday: "long", month: "long", day: "numeric" })
    : todayKey(date);
  return `<div class="dr-page" data-routines-shell="syncing">
    ${pageHeader("Routines", sub, gearButton())}
    <section class="dr-signin" aria-labelledby="dr-sync-title">
      <h2 id="dr-sync-title">Syncing your account</h2>
      <p>Routines show up when that finishes. Nothing is saved until then.</p>
    </section>
  </div>`;
}

function paintShell(view, date) {
  const sub = typeof app.fmtDate === "function"
    ? app.fmtDate(todayKey(date), { weekday: "long", month: "long", day: "numeric" })
    : todayKey(date);
  const hasItems = (view.items || []).length > 0;
  return `<div class="dr-page" data-routines-shell="signed-in">
    ${pageHeader("Routines", sub, gearButton())}
    ${routineNowHTML(view, date)}
    ${routineBlockTilesHTML(view, date)}
    ${hasItems ? "" : emptyDiscoverHTML()}
  </div>`;
}

function shellHTML(date) {
  if (accountPullPending()) {
    const existing = projectDailyRoutines(app.state && app.state.dailyRoutines);
    if (!existing || !existing.blocks.length) return waitingHTML(date);
    return paintShell(existing, date);
  }
  const projected = ensureRoutineShell(app.state, date.getTime());
  const view = projected || { blocks: [], items: [], placements: [], logs: [], compounds: [], prefs: {} };
  return paintShell(view, date);
}

export function dailyRoutinesHTML() {
  if (app.ROUTINES_ENABLED !== true) return "";
  if (!canMutateRoutines()) return signInHTML();
  return shellHTML(shellDate());
}

export function routinesSettingsSheetHTML() {
  const prefs = app.state && app.state.dailyRoutines && app.state.dailyRoutines.prefs;
  const on = !!(prefs && prefs.focusMode === true);
  return `<h3>Routines settings</h3>
    <div class="dr-set-row">
      <span id="dr-set-focus">Focus mode</span>
      <button type="button" class="switch" role="switch" aria-checked="${on ? "true" : "false"}" aria-labelledby="dr-set-focus" data-action="routines-focus"><i></i></button>
    </div>
    <p class="sub">Focus mode dims every block except the current one. Reminders and the FAQ come later. Notifications stay off.</p>
    <button type="button" class="btn block" data-action="sheet-close">Done</button>`;
}

export function routinesDiscoverSheetHTML() {
  return `<h3>Discover</h3>
    <p class="sub">Study-backed entries are not in the app yet. This does not add an item, and it does not suggest a dose.</p>
    <button type="button" class="btn primary block" data-action="sheet-close">Close</button>`;
}

app.ensureRoutineShell = ensureRoutineShell;
app.routineNowNext = routineNowNext;
app.routineClock = routineClock;
app.loggedTodayCount = loggedTodayCount;
app.routineStreak = routineStreak;
app.shiftRoutineDay = shiftRoutineDay;
app.logRoutineItem = logRoutineItem;
app.skipRoutineItem = skipRoutineItem;
app.undoRoutineLog = undoRoutineLog;
app.restoreRoutineLog = restoreRoutineLog;
app.logRoutineRest = logRoutineRest;
app.toggleRoutineFocus = toggleRoutineFocus;
app.toggleRoutineReveal = toggleRoutineReveal;
app.addExampleRoutineItem = addExampleRoutineItem;
app.routineBlockRows = routineBlockRows;
app.dailyRoutinesHTML = dailyRoutinesHTML;
app.routineNowHTML = routineNowHTML;
app.routineBlockTileHTML = routineBlockTileHTML;
app.routineBlockTilesHTML = routineBlockTilesHTML;
app.routinesSettingsSheetHTML = routinesSettingsSheetHTML;
app.routinesDiscoverSheetHTML = routinesDiscoverSheetHTML;
