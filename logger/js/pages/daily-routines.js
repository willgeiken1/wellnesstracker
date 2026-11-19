import { app } from "../runtime.js";
import {
  canMutateRoutines,
  isLive,
  projectDailyRoutines,
  putDailyRoutines,
  seedDefaultBlocks,
} from "../shared/daily-routines-store.js";

/* Routines tab shell. The flag stays off in source. This module paints only
   when app.ROUTINES_ENABLED is true. A signed-out session gets a sign-in
   prompt and no dailyRoutines write. Item rows, check-off, undo, streaks,
   and the dose editor come later. */

const TILE_COLORS = new Set(["citrus", "lavender", "pink"]);
const DEFAULT_START = new Map([
  ["Morning routine", 5],
  ["Supplement & enhancer stack", 12],
  ["Night routine", 17],
]);
const SLOT_LABEL = ["Morning", "Afternoon", "Night"];

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
  if (typeof app.today === "function") return app.today();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

/* Count of logs for the day. Skips are not logs. Amounts are not summed. */
export function loggedTodayCount(logs, day) {
  if (!Array.isArray(logs) || typeof day !== "string") return 0;
  return logs.filter((log) => isLive(log) && log.day === day && log.status !== "skipped").length;
}

function tileColor(color) {
  return TILE_COLORS.has(color) ? color : "citrus";
}

function itemCount(projected, blockId) {
  const items = new Set((projected.items || []).map((item) => item.id));
  return (projected.placements || []).filter((row) => row.blockId === blockId && items.has(row.itemId)).length;
}

function itemLabel(count) {
  if (!count) return "No items yet";
  return count === 1 ? "1 item" : `${count} items`;
}

/* A signed-in client that has not finished its account pull must not write.
   save() would schedule a push, and that push can replace the cloud blob
   before the phone has seen it. */
function accountPullPending() {
  return !!(app.sb && app.cloudPullOk !== true);
}

/* Writes the three default blocks once, only for a signed-in flag-on session.
   A store that already has a live block is left alone, including its logs. */
export function ensureRoutineShell(state, now = Date.now()) {
  if (!canMutateRoutines() || !state || typeof state !== "object" || accountPullPending()) return null;
  const before = state.dailyRoutines;
  const hadLive = !!(before && Array.isArray(before.blocks) && before.blocks.some((block) => isLive(block)));
  if (!hadLive) {
    const seeded = seedDefaultBlocks(before, now);
    if (!putDailyRoutines(state, seeded)) return null;
    if (typeof app.save === "function") app.save();
  }
  return projectDailyRoutines(state.dailyRoutines);
}

function pageHeader(title, sub, gear) {
  if (typeof app.pageHead === "function") return app.pageHead(title, sub, gear ? { left: gear } : {});
  return `<div class="page-head"><div class="ph-text"><h1 class="page-title">${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ""}</div>${gear || ""}</div>`;
}

const GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"/></svg>`;

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

export function routineNowHTML(projected, date) {
  const moment = routineNowNext(projected.blocks, date);
  const clock = formatRoutineClock(date);
  const count = loggedTodayCount(projected.logs, todayKey(date));
  const slot = SLOT_LABEL[moment.slot] || "Today";
  if (!moment.nowBlock) {
    return `<section class="dr-now" data-color="lavender" aria-labelledby="dr-now-title">
      <p class="dr-k">Now · ${esc(clock)}</p>
      <h2 class="dr-now-title" id="dr-now-title">Nothing scheduled</h2>
      <p class="dr-next">${esc(slot)}. Add a routine to see what comes next.</p>
      <p class="dr-count"><b>${count}</b> logged today</p>
    </section>`;
  }
  const wait = formatRoutineWait(moment.waitMin);
  const next = moment.nextBlock
    ? `Next · ${esc(moment.nextBlock.name)}${wait ? `<span class="dr-wait">${esc(wait)}</span>` : ""}`
    : "Nothing else today";
  const color = tileColor(moment.nowBlock.color);
  return `<section class="dr-now" data-color="${color}" aria-labelledby="dr-now-title">
    <p class="dr-k">Now · ${esc(slot)} · ${esc(clock)}</p>
    <h2 class="dr-now-title" id="dr-now-title">${esc(moment.nowBlock.name)}</h2>
    <p class="dr-next">${next}</p>
    <p class="dr-count"><b>${count}</b> logged today</p>
  </section>`;
}

/* Block tiles only. Item rows are not painted here yet. */
function tileKicker(block) {
  if (block.name === "Night routine") return "Night";
  if (block.name === "Supplement & enhancer stack") return "Stack";
  if (block.name === "Morning routine") return "Morning";
  return "Routine";
}

export function routineBlockTileHTML(block, count) {
  const color = tileColor(block.color);
  return `<article class="dr-tile" data-color="${color}" data-block-id="${esc(block.id)}">
    <p class="dr-k">${esc(tileKicker(block))}</p>
    <h3>${esc(block.name)}</h3>
    <p class="dr-tile-meta">${esc(itemLabel(count))}</p>
  </article>`;
}

export function routineBlockTilesHTML(projected) {
  const tiles = (projected.blocks || []).map((block) => routineBlockTileHTML(block, itemCount(projected, block.id))).join("");
  return `<div class="dr-tiles">${tiles}</div>`;
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
    ${routineBlockTilesHTML(view)}
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
  const view = projected || { blocks: [], items: [], placements: [], logs: [], compounds: [] };
  return paintShell(view, date);
}

export function dailyRoutinesHTML() {
  if (app.ROUTINES_ENABLED !== true) return "";
  if (!canMutateRoutines()) return signInHTML();
  return shellHTML(shellDate());
}

export function routinesSettingsSheetHTML() {
  return `<h3>Routines settings</h3>
    <p class="sub">Reminders, the FAQ, and focus mode are not in this version. Notifications stay off.</p>
    <button type="button" class="btn block" data-action="sheet-close">Done</button>`;
}

export function routinesDiscoverSheetHTML() {
  return `<h3>Discover</h3>
    <p class="sub">Study-backed entries are not in the app yet. This does not add an item, and it does not suggest a dose.</p>
    <button type="button" class="btn primary block" data-action="sheet-close">Close</button>`;
}

app.ensureRoutineShell = ensureRoutineShell;
app.routineNowNext = routineNowNext;
app.loggedTodayCount = loggedTodayCount;
app.dailyRoutinesHTML = dailyRoutinesHTML;
app.routineNowHTML = routineNowHTML;
app.routineBlockTileHTML = routineBlockTileHTML;
app.routineBlockTilesHTML = routineBlockTilesHTML;
app.routinesSettingsSheetHTML = routinesSettingsSheetHTML;
app.routinesDiscoverSheetHTML = routinesDiscoverSheetHTML;
