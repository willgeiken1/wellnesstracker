import { app } from "../runtime.js";
import { canMutateRoutines, projectDailyRoutines } from "../shared/daily-routines-store.js";
import {
  compoundDoseHistory,
  editRoutineLog,
  loggedAmountText,
  routineClock,
  routineLogDraft,
} from "./daily-routines.js";

/* Long-press details for one routine row. A tap still logs.
   The page stays open after the finger lifts. The X in the top right
   closes it. Amount and day reuse editRoutineLog. Time is editable only
   when the day is before today. A note is optional and lives on the log.
   How you felt opens the existing check-in and writes nothing here.
   Edit mode does not use this gesture. A rest log is never opened. */

export const ROUTINE_DETAILS_HOLD_MS = 500;
export const ROUTINE_DETAILS_MOTION_MS = 220;
const HOLD_SLOP = 10;
const PRESS_SKIP = ".dr-skip, .dr-undo, .dr-history, .dr-rename, .dr-minus, .dr-handle, .dr-log-all, .dr-edit-log, .dr-swatch, .dr-add, .dr-dup, .dr-rest-btn, .dr-reveal, .dr-block-toggle";
const QUARTERS = Object.freeze([
  Object.freeze({ value: "0.25", label: "¼" }),
  Object.freeze({ value: "0.5", label: "½" }),
  Object.freeze({ value: "0.75", label: "¾" }),
  Object.freeze({ value: "1", label: "1" }),
  Object.freeze({ value: "1.25", label: "1¼" }),
  Object.freeze({ value: "1.5", label: "1½" }),
  Object.freeze({ value: "1.75", label: "1¾" }),
  Object.freeze({ value: "2", label: "2" }),
]);
const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

let hold = null;
let holdFiredAt = 0;

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function prefersReducedMotion() {
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches === true;
  } catch (e) {
    return false;
  }
}

export function detailsMotionMs(reduce) {
  return reduce === true ? 0 : ROUTINE_DETAILS_MOTION_MS;
}

function ready() {
  return app.ROUTINES_ENABLED === true && canMutateRoutines();
}

function editing() {
  return !!(app.ui && app.ui.dailyRoutineEdit === true);
}

function formatHistoryDay(day) {
  if (typeof day !== "string" || day.length < 10) return "";
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  if (month < 1 || month > 12 || !date) return day;
  return `${MONTHS[month - 1]} ${date}, ${day.slice(0, 4)}`;
}

function historyStatus(log) {
  if (!log) return "";
  if (log.status === "skipped") return "Skipped";
  if (log.status === "partial") return "Partial";
  return "Logged";
}

function showTime(day, maxDay) {
  return typeof day === "string" && typeof maxDay === "string" && day < maxDay;
}

function field(id) {
  if (typeof app.$ !== "function") return null;
  return app.$(`#${id}`);
}

function readDetailsFields() {
  const sd = app.ui && app.ui.sd;
  if (!sd) return;
  const amount = field("dr-details-amount");
  const day = field("dr-details-day");
  const time = field("dr-details-time");
  const note = field("dr-details-note");
  if (amount && typeof amount.value === "string") sd.amount = amount.value;
  if (day && typeof day.value === "string") sd.day = day.value;
  if (time && typeof time.value === "string") sd.time = time.value;
  if (note && typeof note.value === "string") sd.note = note.value;
}

function syncTimeVisibility() {
  const sd = app.ui && app.ui.sd;
  if (!sd || typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const wrap = document.getElementById("dr-details-time-wrap");
  if (wrap) wrap.hidden = !showTime(sd.day, sd.maxDay);
}

export function openRoutineDetails(itemId, logId) {
  if (!ready() || !app.ui || editing()) return false;
  if (typeof itemId !== "string" || !itemId) return false;
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  if (!view) return false;
  const item = (view.items || []).find((row) => row.id === itemId);
  if (!item) return false;
  let log = null;
  if (typeof logId === "string" && logId) {
    log = (view.logs || []).find((row) => row.id === logId && row.rest !== true) || null;
    if (!log || log.itemId !== item.id) return false;
  } else {
    const day = routineClock().day;
    log = (view.logs || []).find((row) => row.itemId === item.id && row.day === day && row.rest !== true) || null;
  }
  const draft = log ? routineLogDraft(app.state, log.id) : null;
  if (log && !draft) return false;
  const clock = routineClock();
  app.ui.sheet = "routines-details";
  app.ui.sd = {
    itemId: item.id,
    itemName: item.name,
    kind: draft && draft.kind ? draft.kind : item.kind,
    logId: draft ? draft.logId : "",
    compoundId: item.compoundId || (draft && draft.compoundId) || "",
    amount: draft ? draft.amount : "",
    unit: draft ? draft.unit : "",
    day: draft ? draft.day : clock.day,
    maxDay: clock.day,
    time: draft ? draft.time : "",
    note: draft ? draft.note : "",
    error: "",
    motion: prefersReducedMotion() ? "reduce" : "full",
  };
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function closeRoutineDetails(source) {
  if (!app.ui || app.ui.sheet !== "routines-details") return false;
  if (source !== "x") return false;
  app.ui.sheet = null;
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function commitRoutineDetails() {
  const sd = app.ui && app.ui.sd;
  if (!sd || !sd.logId || !app.ui || app.ui.sheet !== "routines-details" || !ready()) return false;
  readDetailsFields();
  const backdated = showTime(sd.day, sd.maxDay);
  const draft = { amount: sd.amount, day: sd.day, note: typeof sd.note === "string" ? sd.note : "" };
  if (backdated) draft.time = typeof sd.time === "string" ? sd.time : "";
  if (!editRoutineLog(app.state, sd.logId, draft)) {
    sd.error = "Enter an amount and a day up to today. A day that already has a log stays as it is. On an earlier day, leave the time blank or use hours and minutes.";
    if (typeof app.renderSheet === "function") app.renderSheet();
    const input = field("dr-details-amount");
    if (input && typeof input.focus === "function") input.focus();
    return false;
  }
  app.ui.sheet = null;
  if (typeof app.save === "function") app.save();
  app.ui.routineAnnounce = "Log updated.";
  if (typeof app.render === "function") app.render();
  return true;
}

/* The existing check-in. This does not write a feeling onto the dose. */
export function openRoutineCheckin() {
  if (app.ROUTINES_ENABLED !== true || typeof app.openCheckin !== "function") return false;
  app.openCheckin();
  return true;
}

export function setRoutineDetailsQuarter(amount) {
  if (!app.ui || !app.ui.sd || app.ui.sheet !== "routines-details" || !app.ui.sd.logId) return false;
  readDetailsFields();
  app.ui.sd.amount = typeof amount === "string" ? amount : "";
  app.ui.sd.error = "";
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

function historyHTML(compoundId) {
  const rows = compoundDoseHistory(app.state && app.state.dailyRoutines, compoundId);
  if (!rows.length) return `<p class="sub">Nothing logged for this item yet.</p>`;
  const list = rows.map((log) => {
    const amount = loggedAmountText(log);
    const amountHTML = amount ? `<span class="dr-dose">${esc(amount)}</span>` : "";
    return `<li data-log-id="${esc(log.id)}" data-log-day="${esc(log.day)}">
      <span class="dr-history-day">${esc(formatHistoryDay(log.day))}</span>
      ${amountHTML}
      <span class="dr-state">${esc(historyStatus(log))}</span>
    </li>`;
  }).join("");
  return `<ul class="dr-history-list">${list}</ul>`;
}

function editorHTML(sd) {
  const amount = Number(sd.amount);
  const quarters = QUARTERS.map((chip) => `<button type="button" class="dr-quarter" data-action="routines-details-quarter" data-amount="${chip.value}" aria-pressed="${amount === Number(chip.value) ? "true" : "false"}" aria-label="${chip.value}">${chip.label}</button>`).join("");
  const invalid = sd.error ? "true" : "false";
  const error = sd.error ? `<p class="dr-log-error" id="dr-details-error" role="alert">${esc(sd.error)}</p>` : `<p class="dr-log-error" id="dr-details-error"></p>`;
  const unit = sd.unit ? `<p class="sub">Unit: ${esc(sd.unit)}. This is the unit already on the log.</p>` : "";
  const timeOpen = showTime(sd.day, sd.maxDay);
  return `<label class="field-label" for="dr-details-amount">Amount</label>
    <input class="text-in" id="dr-details-amount" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-invalid="${invalid}" aria-describedby="dr-details-error" value="${esc(sd.amount || "")}">
    <span class="field-label" id="dr-details-quarter-label">Quarter amounts</span>
    <div class="dr-quarters" role="group" aria-labelledby="dr-details-quarter-label">${quarters}</div>
    ${unit}
    <label class="field-label" for="dr-details-day">Day</label>
    <input class="text-in" id="dr-details-day" type="date" autocomplete="off" max="${esc(sd.maxDay || "")}" value="${esc(sd.day || "")}" aria-invalid="${invalid}" aria-describedby="dr-details-error">
    <div id="dr-details-time-wrap"${timeOpen ? "" : " hidden"}>
      <label class="field-label" for="dr-details-time">Time</label>
      <input class="text-in" id="dr-details-time" type="time" step="60" autocomplete="off" value="${esc(sd.time || "")}" aria-describedby="dr-details-error">
      <p class="sub">Shown when the day is before today. Leave it blank to keep the logged time.</p>
    </div>
    <label class="field-label" for="dr-details-note">Note, optional</label>
    <textarea class="text-in dr-details-note" id="dr-details-note" maxlength="280" rows="3" autocomplete="off">${esc(sd.note || "")}</textarea>
    ${error}
    <button type="button" class="btn primary block" data-action="routines-details-save">Save</button>`;
}

export function routineDetailsSheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const name = sd.itemName || "Item";
  const motion = sd.motion === "reduce" ? "reduce" : "full";
  const loggedDose = !!sd.logId && sd.kind === "dose";
  const loggedCheck = !!sd.logId && sd.kind !== "dose";
  const body = loggedDose
    ? editorHTML(sd)
    : loggedCheck
      ? `<p class="sub">This check is logged. Edit changes its day.</p>`
      : sd.kind === "dose"
        ? `<p class="sub">Log this dose with a tap. Amount, day, time, and a note are edited here after it is logged.</p>`
        : `<p class="sub">This is a check. A tap logs it.</p>`;
  return `<h3 data-motion="${motion}">Details</h3>
    <p class="sub">${esc(name)}. This page stays open until you tap the X.</p>
    ${body}
    <h3 class="dr-details-history">History</h3>
    <p class="sub">Logged amounts. Changing the item amount does not change them.</p>
    ${historyHTML(sd.compoundId)}
    <button type="button" class="btn block dr-details-checkin" data-action="routines-checkin">How you felt</button>
    <p class="sub">Opens the check-in. It is not saved on this dose.</p>`;
}

function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold = null;
}

export function pressRoutineDetails(spec) {
  if (!spec || editing() || (app.ui && app.ui.sheet) || app.ROUTINES_ENABLED !== true) return false;
  if (typeof spec.itemId !== "string" || !spec.itemId) return false;
  cancelHold();
  hold = {
    id: spec.pointerId,
    x: typeof spec.x === "number" ? spec.x : 0,
    y: typeof spec.y === "number" ? spec.y : 0,
    itemId: spec.itemId,
    logId: typeof spec.logId === "string" ? spec.logId : "",
    timer: setTimeout(() => {
      const pending = hold;
      hold = null;
      if (!pending || editing() || (app.ui && app.ui.sheet) || app.ROUTINES_ENABLED !== true) return;
      holdFiredAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      app.eatClick = true;
      app.wEatClick = true;
      openRoutineDetails(pending.itemId, pending.logId);
      /* The release click is swallowed. If that click never arrives, drop the
         flag so the X still closes the page. */
      setTimeout(() => {
        if (app.eatClick) app.eatClick = false;
      }, 400);
    }, ROUTINE_DETAILS_HOLD_MS),
  };
  return true;
}

export function moveRoutineDetails(spec) {
  if (!hold || !spec || spec.pointerId !== hold.id) return false;
  const x = typeof spec.x === "number" ? spec.x : hold.x;
  const y = typeof spec.y === "number" ? spec.y : hold.y;
  if (Math.abs(x - hold.x) <= HOLD_SLOP && Math.abs(y - hold.y) <= HOLD_SLOP) return false;
  cancelHold();
  return true;
}

/* Lifting the finger cancels a press that has not opened the page.
   It does not close a page that is already open. */
export function releaseRoutineDetails(pointerId) {
  if (!hold || hold.id !== pointerId) return false;
  cancelHold();
  return true;
}

export function routineDetailsHeld() {
  return !!hold;
}

function pressTarget(node) {
  if (!node || typeof node.closest !== "function") return null;
  if (app.ROUTINES_ENABLED !== true || editing() || (app.ui && app.ui.sheet)) return null;
  if (node.closest(PRESS_SKIP)) return null;
  const row = node.closest(".dr-row[data-details]");
  if (!row || !row.closest(".dr-page")) return null;
  return row;
}

function onDown(ev) {
  if (!ev || ev.button > 0 || ev.isPrimary === false) return;
  const row = pressTarget(ev.target);
  if (!row) return;
  pressRoutineDetails({
    pointerId: ev.pointerId,
    x: ev.clientX,
    y: ev.clientY,
    itemId: row.dataset.itemId || "",
    logId: row.dataset.logId || "",
  });
}

function onMove(ev) {
  if (!ev) return;
  moveRoutineDetails({ pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY });
}

function onUp(ev) {
  if (!ev) return;
  releaseRoutineDetails(ev.pointerId);
}

function onDetailsInput(ev) {
  const el = ev && ev.target;
  if (!el || !app.ui || app.ui.sheet !== "routines-details" || !app.ui.sd) return;
  if (el.id === "dr-details-amount") app.ui.sd.amount = el.value;
  if (el.id === "dr-details-day") {
    app.ui.sd.day = el.value;
    syncTimeVisibility();
  }
  if (el.id === "dr-details-time") app.ui.sd.time = el.value;
  if (el.id === "dr-details-note") app.ui.sd.note = el.value;
}

function onContextMenu(ev) {
  const recent = (typeof performance !== "undefined" ? performance.now() : Date.now()) - holdFiredAt < 1200;
  const page = ev.target && ev.target.closest && ev.target.closest(".dr-page");
  if ((hold || recent) && page) ev.preventDefault();
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
  document.addEventListener("input", onDetailsInput);
  document.addEventListener("change", onDetailsInput);
  document.addEventListener("contextmenu", onContextMenu);
}

app.openRoutineDetails = openRoutineDetails;
app.closeRoutineDetails = closeRoutineDetails;
app.commitRoutineDetails = commitRoutineDetails;
app.openRoutineCheckin = openRoutineCheckin;
app.setRoutineDetailsQuarter = setRoutineDetailsQuarter;
app.routineDetailsSheetHTML = routineDetailsSheetHTML;
app.pressRoutineDetails = pressRoutineDetails;
app.releaseRoutineDetails = releaseRoutineDetails;
app.prefersReducedMotion = prefersReducedMotion;
app.detailsMotionMs = detailsMotionMs;
