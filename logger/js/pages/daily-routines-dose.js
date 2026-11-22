import { app } from "../runtime.js";
import { canMutateRoutines, projectDailyRoutines } from "../shared/daily-routines-store.js";
import { formatCalcNumber, reconstitutionNoteText, reconstitutionResult, reconstitutionResultHTML } from "./reconstitution.js";
import {
  compoundDoseHistory,
  doseCountdownText,
  editRoutineLog,
  loggedAmountText,
  parseRoutineAmount,
  routineClock,
  routineLogDraft,
  saveRoutineItemNote,
} from "./daily-routines.js";
import {
  amountDraftText,
  amountEditText,
  amountFieldText,
  parseSheetAmount,
  patchLive,
  plainAmount,
  stepAllowed,
  stepAmount,
  stepButtonsHTML,
  syringeHTML,
  unitButtonsHTML,
} from "./daily-routines-sheet-parts.js";

/* Log edits, per-compound history, and the reconstitution screen.
   Logging stays a tap. This screen changes one log's amount and day.
   The calculator only repeats the numbers on the screen. */

const CALC_UNITS = Object.freeze(["mcg", "mg", "IU", "units"]);
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

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function ready() {
  return app.ROUTINES_ENABLED === true && canMutateRoutines();
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

function knownUnit(unit) {
  return CALC_UNITS.includes(unit) ? unit : "mg";
}

export function openRoutineHistory(compoundId, itemId) {
  if (!ready() || !app.ui || typeof compoundId !== "string" || !compoundId) return false;
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  const compound = view && (view.compounds || []).find((row) => row.id === compoundId);
  if (!compound) return false;
  app.ui.sheet = "routines-history";
  app.ui.sd = { compoundId, itemId: typeof itemId === "string" ? itemId : "" };
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function openRoutineLogEditor(logId) {
  if (!ready() || !app.ui) return false;
  const draft = routineLogDraft(app.state, logId);
  if (!draft) return false;
  app.ui.sheet = "routines-log";
  app.ui.sd = draft;
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function commitRoutineLogSheet() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : null;
  if (!sd || !ready()) return false;
  if (typeof app.$ === "function") {
    const amountEl = app.$("#dr-log-amount");
    const dayEl = app.$("#dr-log-day");
    if (amountEl && typeof amountEl.value === "string") sd.amount = amountEl.value;
    if (dayEl && typeof dayEl.value === "string") sd.day = dayEl.value;
  }
  if (!editRoutineLog(app.state, sd.logId, { amount: sd.amount, day: sd.day })) {
    sd.error = "Enter an amount and a day up to today. A day that already has a log stays as it is.";
    if (typeof app.renderSheet === "function") app.renderSheet();
    const field = typeof app.$ === "function" ? app.$("#dr-log-amount") : null;
    if (field && typeof field.focus === "function") field.focus();
    return false;
  }
  app.ui.sheet = null;
  if (typeof app.save === "function") app.save();
  app.ui.routineAnnounce = "Log updated.";
  if (typeof app.render === "function") app.render();
  return true;
}

function savedDoseItemId(itemId) {
  if (typeof itemId !== "string" || !itemId) return "";
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  const item = view && (view.items || []).find((row) => row.id === itemId);
  return item && item.kind === "dose" ? item.id : "";
}

export function openReconstitution(itemId) {
  if (!ready() || !app.ui) return false;
  app.ui.sheet = "routines-calc";
  app.ui.sd = { vial: "", water: "", dose: "", vialUnit: "mg", doseUnit: "mcg", itemId: savedDoseItemId(itemId), error: "" };
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

/* From the dose card of the open item sheet. The amount and unit typed
   there carry into Desired amount when the unit is one the calculator
   takes. Every other field starts empty. The item draft is kept whole and
   comes back on Back and on Close. Save shows only for an item that is
   already saved as a dose. */
export function openReconstitutionFromItem() {
  if (!ready() || !app.ui || app.ui.sheet !== "routines-item" || !app.ui.sd) return false;
  if (typeof app.rememberRoutineItemFields === "function") app.rememberRoutineItemFields();
  const draft = app.ui.sd;
  const amount = parseSheetAmount(draft.amount);
  const carry = amount != null && CALC_UNITS.includes(draft.unit);
  const card = typeof app.$ === "function" ? app.$("#sheet .sheet-card") : null;
  app.ui.sheet = "routines-calc";
  app.ui.sd = {
    vial: "",
    water: "",
    dose: carry ? plainAmount(amount) : "",
    vialUnit: "mg",
    doseUnit: carry ? draft.unit : "mcg",
    itemId: savedDoseItemId(draft.itemId),
    error: "",
    from: draft,
    fromTop: card && typeof card.scrollTop === "number" ? card.scrollTop : 0,
  };
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

/* Back to the item sheet the calculator was opened from, with every typed
   field as it was. Returns false when there is no item sheet to go back to. */
export function closeReconstitution() {
  const sd = app.ui && app.ui.sheet === "routines-calc" ? app.ui.sd : null;
  if (!sd || !sd.from || typeof sd.from !== "object") return false;
  const top = typeof sd.fromTop === "number" ? sd.fromTop : 0;
  app.ui.sheet = "routines-item";
  app.ui.sd = sd.from;
  if (typeof app.renderSheet === "function") app.renderSheet();
  if (typeof app.$ === "function") {
    const card = app.$("#sheet .sheet-card");
    if (card && typeof card.scrollTop === "number" && top) card.scrollTop = top;
    const link = app.$('[data-action="routines-item-calc"]');
    if (link && link.hidden !== true && typeof link.focus === "function") link.focus({ preventScroll: true });
  }
  return true;
}

export function routineHistorySheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines) || { compounds: [], items: [], logs: [], blocks: [], placements: [] };
  const compound = (view.compounds || []).find((row) => row.id === sd.compoundId) || null;
  const name = compound && compound.name ? compound.name : "Item";
  const item = (view.items || []).find((row) => row.id === sd.itemId) || (view.items || []).find((row) => row.compoundId === sd.compoundId) || null;
  const clock = routineClock();
  const countdown = item ? doseCountdownText(view, item, clock.date, clock.day) : "";
  const rows = compoundDoseHistory(app.state && app.state.dailyRoutines, sd.compoundId);
  const list = rows.length
    ? `<ul class="dr-history-list">${rows.map((log) => {
      const amount = loggedAmountText(log);
      const amountHTML = amount ? `<span class="dr-dose">${esc(amount)}</span>` : "";
      return `<li data-log-id="${esc(log.id)}" data-log-day="${esc(log.day)}">
        <span class="dr-history-day">${esc(formatHistoryDay(log.day))}</span>
        ${amountHTML}
        <span class="dr-state">${esc(historyStatus(log))}</span>
        <button type="button" class="dr-edit-log" data-action="routines-details-open" data-item-id="${esc(typeof log.itemId === "string" && log.itemId ? log.itemId : (sd.itemId || ""))}" data-log-id="${esc(log.id)}">Edit <span class="dr-vh">${esc(formatHistoryDay(log.day))}</span></button>
      </li>`;
    }).join("")}</ul>`
    : `<p class="sub">Nothing logged for this item yet.</p>`;
  const next = countdown ? `<p class="dr-next-dose">${esc(countdown)}</p>` : "";
  return `<h3>${esc(name)}</h3>
    ${next}
    <p class="sub">These are logged amounts. Changing the item amount does not change them.</p>
    ${list}
    <button type="button" class="btn block" data-action="sheet-close">Close</button>`;
}

export function routineLogSheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const amount = parseRoutineAmount(sd.amount);
  const quarters = QUARTERS.map((chip) => `<button type="button" class="dr-quarter" data-action="routines-log-quarter" data-amount="${chip.value}" aria-pressed="${amount === Number(chip.value) ? "true" : "false"}" aria-label="${chip.value}">${chip.label}</button>`).join("");
  const invalid = sd.error ? "true" : "false";
  const error = sd.error ? `<p class="dr-log-error" id="dr-log-error" role="alert">${esc(sd.error)}</p>` : `<p class="dr-log-error" id="dr-log-error"></p>`;
  const unit = sd.unit ? `<p class="sub">Unit: ${esc(sd.unit)}. This is the unit already on the log.</p>` : "";
  const amountFields = sd.kind === "check" || sd.skipped === true ? "" : `<label class="field-label" for="dr-log-amount">Amount</label>
    <input class="text-in" id="dr-log-amount" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-invalid="${invalid}" aria-describedby="dr-log-error" value="${esc(sd.amount || "")}">
    <span class="field-label" id="dr-log-quarter-label">Quarter amounts</span>
    <div class="dr-quarters" role="group" aria-labelledby="dr-log-quarter-label">${quarters}</div>
    ${unit}`;
  const intro = sd.skipped === true
    ? "This saves the day you enter. The skip stays a skip."
    : sd.kind === "check"
      ? "This saves the day you enter. The check stays a check."
      : "This saves the amount and the day you enter. It does not suggest an amount.";
  return `<h3>Edit log</h3>
    <p class="sub">${esc(sd.itemName || "Item")}. ${intro}</p>
    ${amountFields}
    <label class="field-label" for="dr-log-day">Day</label>
    <input class="text-in" id="dr-log-day" type="date" autocomplete="off" max="${esc(sd.maxDay || "")}" value="${esc(sd.day || "")}" aria-invalid="${invalid}" aria-describedby="dr-log-error">
    ${error}
    <button type="button" class="btn primary block" data-action="routines-log-save">Save log</button>
    <button type="button" class="btn block" data-action="sheet-close">Cancel</button>`;
}

function calcResult(sd) {
  return reconstitutionResult({
    vialAmount: parseSheetAmount(sd.vial),
    waterMl: parseSheetAmount(sd.water),
    doseAmount: parseSheetAmount(sd.dose),
    vialUnit: sd.vialUnit,
    doseUnit: sd.doseUnit,
  });
}

export function reconstitutionLiveHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  return reconstitutionResultHTML(calcResult(sd));
}

const CALC_FIELDS = Object.freeze([
  Object.freeze({ key: "vial", id: "dr-calc-vial", label: "Vial amount", tone: "lavender", unitKey: "vialUnit", unitAction: "routines-calc-vial-unit", unitLabel: "Vial unit", stepLabel: "Change the vial amount", enter: "next" }),
  Object.freeze({ key: "water", id: "dr-calc-water", label: "Water volume", tone: "pink", unitKey: "", unitAction: "", unitLabel: "", stepLabel: "Change the water volume", enter: "next" }),
  Object.freeze({ key: "dose", id: "dr-calc-dose", label: "Desired amount", tone: "citrus", unitKey: "doseUnit", unitAction: "routines-calc-dose-unit", unitLabel: "Desired amount unit", stepLabel: "Change the desired amount", enter: "done" }),
]);

function calcField(key) {
  return CALC_FIELDS.find((field) => field.key === key) || null;
}

function readCalcFields(sd) {
  if (typeof app.$ !== "function") return;
  for (const field of CALC_FIELDS) {
    const el = app.$(`#${field.id}`);
    if (el && typeof el.value === "string") sd[field.key] = amountDraftText(el.value);
  }
}

/* One input: a big typed number, its unit, Clear, and the step buttons. */
function calcCardHTML(field, sd) {
  const raw = typeof sd[field.key] === "string" ? sd[field.key] : "";
  const amount = parseSheetAmount(raw);
  const unit = field.unitKey ? knownUnit(sd[field.unitKey]) : "mL";
  const units = field.unitKey
    ? `<div class="dr-useg" role="group" aria-label="${field.unitLabel}">${unitButtonsHTML(CALC_UNITS, unit, field.unitAction, { live: `${field.key}-unit` })}</div>`
    : "";
  return `<div class="dr-rc-card" data-color="${field.tone}">
      <div class="dr-is-k"><label for="${field.id}">${field.label}</label><button type="button" class="dr-clr" data-live="${field.key}-clear" data-live-mode="attrs" data-action="routines-calc-clear" data-field="${field.key}"${raw ? "" : " disabled"}>Clear</button></div>
      <div class="dr-readout" id="${field.id}-readout"><input class="dr-amt-in" id="${field.id}" data-live="${field.key}" data-live-mode="value" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="${field.enter}" placeholder="0" value="${esc(amountFieldText(raw))}"><em class="dr-unit-out" data-live="${field.key}-unit-out">${esc(unit)}</em></div>
      ${units}
      <div class="dr-steps" role="group" aria-label="${field.stepLabel}" data-live="${field.key}-steps">${stepButtonsHTML(amount, "routines-calc-step", { field: field.key })}</div>
    </div>`;
}

/* The answer, large, over the U-100 syringe and the app's own lines. */
function calcAnswerHTML(sd) {
  const result = calcResult(sd);
  const ok = result.ok === true;
  const volume = ok ? `${esc(formatCalcNumber(result.volumeMl))}<small>mL</small>` : "–";
  const units = ok ? esc(formatCalcNumber(result.syringeUnits)) : "–";
  return `<div class="dr-rc-res" data-live="answer" data-live-mode="attrs" data-calc="${ok ? "ready" : "empty"}" aria-live="polite">
      <div class="dr-rc-two">
        <div><span>Volume to draw</span><b data-live="volume">${volume}</b></div>
        <div><span>U-100 units</span><b data-live="units">${units}</b></div>
      </div>
      ${syringeHTML(ok ? result.syringeUnits : null)}
      <div id="dr-calc-result" data-live="math">${reconstitutionLiveHTML()}</div>
    </div>`;
}

export function reconstitutionSheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const error = sd.error ? `<p class="dr-log-error" id="dr-calc-error" role="alert">${esc(sd.error)}</p>` : "";
  const save = sd.itemId
    ? `<button type="button" class="btn primary block dr-is-cta" data-action="routines-calc-save">Save as note on this item</button>
    <p class="dr-is-help dr-rc-save-note">Saves the volume and U-100 units on this item. It does not log a dose, and it does not suggest an amount.</p>`
    : "";
  const from = sd.from && typeof sd.from === "object" ? sd.from : null;
  const back = from
    ? `<button type="button" class="dr-rc-back" data-action="routines-calc-back"><span aria-hidden="true">‹</span> ${from.itemId ? "Edit item" : "Add item"}</button>`
    : "";
  return `<div class="dr-is dr-rc" id="dr-calc-sheet">
    ${back}
    <h3 id="dr-calc-title">Reconstitution calculator</h3>
    <p class="dr-is-help">Enter a vial amount, a water volume, and a desired amount. The lines below are the arithmetic of what you entered, including U-100 units (mL × 100). What you type stays on this screen.</p>
    ${CALC_FIELDS.map((field) => calcCardHTML(field, sd)).join("")}
    ${calcAnswerHTML(sd)}
    <div data-live="error">${error}</div>
    ${save}
    <button type="button" class="btn block dr-rc-close" data-action="sheet-close">Close</button>
  </div>`;
}

/* Redraw the open calculator from its draft, in place when it can be. */
function refreshCalc(options) {
  if (!app.ui || app.ui.sheet !== "routines-calc") return false;
  const root = typeof app.$ === "function" ? app.$("#dr-calc-sheet") : null;
  let patched = false;
  try { patched = patchLive(root, reconstitutionSheetHTML()); } catch (e) { patched = false; }
  if (!patched && !(options && options.typing) && typeof app.renderSheet === "function") app.renderSheet();
  return patched;
}

function calcMotion() {
  try {
    return !(typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return true;
  }
}

/* After a tap changed a number: the field shows it, as plain digits while
   it still has focus, and the number gets a short scale. A Clear button
   that just went dim hands focus to its field. */
function settleCalcField(field, bump) {
  if (typeof app.$ !== "function" || !app.ui || !app.ui.sd) return;
  const el = app.$(`#${field.id}`);
  if (el && typeof el.value === "string") {
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const text = active === el ? amountEditText(app.ui.sd[field.key]) : amountFieldText(app.ui.sd[field.key]);
    if (el.value !== text) el.value = text;
    if (active && active !== el && active.disabled === true && typeof el.focus === "function") el.focus({ preventScroll: true });
  }
  const readout = bump && calcMotion() ? app.$(`#${field.id}-readout`) : null;
  if (!readout || !readout.classList || typeof readout.classList.add !== "function") return;
  readout.classList.remove("dr-bump");
  void readout.offsetWidth;
  readout.classList.add("dr-bump");
  setTimeout(() => { if (readout.classList) readout.classList.remove("dr-bump"); }, 260);
}

/* Add to or take away from one of the three numbers. */
export function stepReconstitutionField(key, delta) {
  const field = calcField(key);
  const sd = app.ui && app.ui.sheet === "routines-calc" ? app.ui.sd : null;
  if (!field || !sd) return false;
  readCalcFields(sd);
  const amount = parseSheetAmount(sd[field.key]);
  if (!stepAllowed(amount, delta)) return false;
  const next = stepAmount(amount, delta);
  sd[field.key] = next == null ? "" : plainAmount(next);
  sd.error = "";
  refreshCalc();
  settleCalcField(field, true);
  return true;
}

export function clearReconstitutionField(key) {
  const field = calcField(key);
  const sd = app.ui && app.ui.sheet === "routines-calc" ? app.ui.sd : null;
  if (!field || !sd) return false;
  readCalcFields(sd);
  sd[field.key] = "";
  sd.error = "";
  refreshCalc();
  settleCalcField(field, true);
  return true;
}

export function saveReconstitutionNote() {
  const sd = app.ui && app.ui.sd;
  if (!sd || !app.ui || app.ui.sheet !== "routines-calc" || !ready()) return false;
  readCalcFields(sd);
  const itemId = typeof sd.itemId === "string" ? sd.itemId : "";
  if (!itemId) return false;
  const note = reconstitutionNoteText(calcResult(sd));
  if (!note) {
    sd.error = "Enter a vial amount, a water volume, and a desired amount.";
    refreshCalc();
    return false;
  }
  if (!saveRoutineItemNote(app.state, itemId, note, {
    vialAmount: parseSheetAmount(sd.vial),
    waterMl: parseSheetAmount(sd.water),
    doseAmount: parseSheetAmount(sd.dose),
    vialUnit: sd.vialUnit,
    doseUnit: sd.doseUnit,
  })) {
    sd.error = "The note was not saved.";
    refreshCalc();
    return false;
  }
  /* Opened from the item sheet: go back to it, so the fields typed there
     are not lost with the calculator. */
  const from = sd.from && typeof sd.from === "object" ? sd.from : null;
  if (!from || !closeReconstitution()) app.ui.sheet = null;
  if (typeof app.save === "function") app.save();
  app.ui.routineAnnounce = "Note saved.";
  if (typeof app.render === "function") app.render();
  if (from && typeof app.toast === "function") app.toast("Note saved.");
  return true;
}

export function setRoutineLogQuarter(amount) {
  if (!app.ui || !app.ui.sd || app.ui.sheet !== "routines-log") return false;
  app.ui.sd.amount = typeof amount === "string" ? amount : "";
  app.ui.sd.error = "";
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function setReconstitutionUnit(which, unit) {
  if (!app.ui || !app.ui.sd || app.ui.sheet !== "routines-calc" || !CALC_UNITS.includes(unit)) return false;
  if (which !== "vial" && which !== "dose") return false;
  readCalcFields(app.ui.sd);
  if (which === "vial") app.ui.sd.vialUnit = unit;
  else app.ui.sd.doseUnit = unit;
  app.ui.sd.error = "";
  refreshCalc();
  return true;
}

export function noteReconstitutionField(id, value) {
  if (!app.ui || !app.ui.sd || app.ui.sheet !== "routines-calc") return false;
  const field = CALC_FIELDS.find((row) => row.id === id);
  if (!field) return false;
  app.ui.sd[field.key] = amountDraftText(typeof value === "string" ? value : "");
  app.ui.sd.error = "";
  if (refreshCalc({ typing: true })) return true;
  const slot = typeof app.$ === "function" ? app.$("#dr-calc-result") : null;
  if (slot) slot.innerHTML = reconstitutionLiveHTML();
  return true;
}

/* A number shows ¼ ½ ¾ at rest and plain digits while it is edited. */
function onCalcFocus(ev) {
  const el = ev && ev.target;
  const field = el && CALC_FIELDS.find((row) => row.id === el.id);
  if (!field || !app.ui || app.ui.sheet !== "routines-calc" || !app.ui.sd) return;
  const text = amountEditText(app.ui.sd[field.key]);
  if (typeof el.value === "string" && el.value !== text) el.value = text;
}

function onCalcBlur(ev) {
  const el = ev && ev.target;
  const field = el && CALC_FIELDS.find((row) => row.id === el.id);
  if (!field || !app.ui || app.ui.sheet !== "routines-calc" || !app.ui.sd) return;
  if (typeof el.value === "string") el.value = amountFieldText(app.ui.sd[field.key]);
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("focusin", onCalcFocus);
  document.addEventListener("focusout", onCalcBlur);
}

app.openRoutineHistory = openRoutineHistory;
app.openRoutineLogEditor = openRoutineLogEditor;
app.commitRoutineLogSheet = commitRoutineLogSheet;
app.openReconstitution = openReconstitution;
app.openReconstitutionFromItem = openReconstitutionFromItem;
app.closeReconstitution = closeReconstitution;
app.stepReconstitutionField = stepReconstitutionField;
app.clearReconstitutionField = clearReconstitutionField;
app.saveReconstitutionNote = saveReconstitutionNote;
app.routineHistorySheetHTML = routineHistorySheetHTML;
app.routineLogSheetHTML = routineLogSheetHTML;
app.reconstitutionSheetHTML = reconstitutionSheetHTML;
app.reconstitutionLiveHTML = reconstitutionLiveHTML;
app.setRoutineLogQuarter = setRoutineLogQuarter;
app.setReconstitutionUnit = setReconstitutionUnit;
app.noteReconstitutionField = noteReconstitutionField;
