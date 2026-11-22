import { app } from "../runtime.js";
import { canMutateRoutines, projectDailyRoutines } from "../shared/daily-routines-store.js";
import { reconstitutionNoteText, reconstitutionResult, reconstitutionResultHTML } from "./reconstitution.js";
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

export function openReconstitution(itemId) {
  if (!ready() || !app.ui) return false;
  let linked = "";
  if (typeof itemId === "string" && itemId) {
    const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
    const item = view && (view.items || []).find((row) => row.id === itemId);
    if (item && item.kind === "dose") linked = item.id;
  }
  app.ui.sheet = "routines-calc";
  app.ui.sd = { vial: "", water: "", dose: "", vialUnit: "mg", doseUnit: "mcg", itemId: linked, error: "" };
  if (typeof app.renderSheet === "function") app.renderSheet();
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

export function reconstitutionLiveHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  return reconstitutionResultHTML(reconstitutionResult({
    vialAmount: parseRoutineAmount(sd.vial),
    waterMl: parseRoutineAmount(sd.water),
    doseAmount: parseRoutineAmount(sd.dose),
    vialUnit: sd.vialUnit,
    doseUnit: sd.doseUnit,
  }));
}

function unitButtons(current, action) {
  return CALC_UNITS.map((unit) => `<button type="button" class="dr-unit" data-action="${action}" data-unit="${esc(unit)}" aria-pressed="${current === unit ? "true" : "false"}">${esc(unit)}</button>`).join("");
}

function readCalcFields(sd) {
  if (typeof app.$ !== "function") return;
  const vial = app.$("#dr-calc-vial");
  const water = app.$("#dr-calc-water");
  const dose = app.$("#dr-calc-dose");
  if (vial && typeof vial.value === "string") sd.vial = vial.value;
  if (water && typeof water.value === "string") sd.water = water.value;
  if (dose && typeof dose.value === "string") sd.dose = dose.value;
}

export function reconstitutionSheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const vialUnit = knownUnit(sd.vialUnit);
  const doseUnit = knownUnit(sd.doseUnit);
  const error = sd.error ? `<p class="dr-log-error" id="dr-calc-error" role="alert">${esc(sd.error)}</p>` : "";
  const save = sd.itemId
    ? `<button type="button" class="btn primary block" data-action="routines-calc-save">Save as note on this item</button>
    <p class="sub">Saves the volume and U-100 units on this item. It does not log a dose, and it does not suggest an amount.</p>`
    : "";
  return `<h3 id="dr-calc-title">Reconstitution calculator</h3>
    <p class="sub">Enter a vial amount, a water volume, and a desired amount. The lines below are the arithmetic of what you entered, including U-100 units (mL × 100). What you type stays on this screen.</p>
    <label class="field-label" for="dr-calc-vial">Vial amount</label>
    <input class="text-in" id="dr-calc-vial" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" value="${esc(sd.vial || "")}">
    <span class="field-label" id="dr-calc-vial-unit">Vial unit</span>
    <div class="dr-units" role="group" aria-labelledby="dr-calc-vial-unit">${unitButtons(vialUnit, "routines-calc-vial-unit")}</div>
    <label class="field-label" for="dr-calc-water">Water volume (mL)</label>
    <input class="text-in" id="dr-calc-water" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" value="${esc(sd.water || "")}">
    <label class="field-label" for="dr-calc-dose">Desired amount</label>
    <input class="text-in" id="dr-calc-dose" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(sd.dose || "")}">
    <span class="field-label" id="dr-calc-dose-unit">Desired amount unit</span>
    <div class="dr-units" role="group" aria-labelledby="dr-calc-dose-unit">${unitButtons(doseUnit, "routines-calc-dose-unit")}</div>
    <div id="dr-calc-result">${reconstitutionLiveHTML()}</div>
    ${error}
    ${save}
    <button type="button" class="btn block" data-action="sheet-close">Close</button>`;
}

export function saveReconstitutionNote() {
  const sd = app.ui && app.ui.sd;
  if (!sd || !app.ui || app.ui.sheet !== "routines-calc" || !ready()) return false;
  readCalcFields(sd);
  const itemId = typeof sd.itemId === "string" ? sd.itemId : "";
  if (!itemId) return false;
  const result = reconstitutionResult({
    vialAmount: parseRoutineAmount(sd.vial),
    waterMl: parseRoutineAmount(sd.water),
    doseAmount: parseRoutineAmount(sd.dose),
    vialUnit: sd.vialUnit,
    doseUnit: sd.doseUnit,
  });
  const note = reconstitutionNoteText(result);
  if (!note) {
    sd.error = "Enter a vial amount, a water volume, and a desired amount.";
    if (typeof app.renderSheet === "function") app.renderSheet();
    return false;
  }
  if (!saveRoutineItemNote(app.state, itemId, note, {
    vialAmount: parseRoutineAmount(sd.vial),
    waterMl: parseRoutineAmount(sd.water),
    doseAmount: parseRoutineAmount(sd.dose),
    vialUnit: sd.vialUnit,
    doseUnit: sd.doseUnit,
  })) {
    sd.error = "The note was not saved.";
    if (typeof app.renderSheet === "function") app.renderSheet();
    return false;
  }
  app.ui.sheet = null;
  if (typeof app.save === "function") app.save();
  app.ui.routineAnnounce = "Note saved.";
  if (typeof app.render === "function") app.render();
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
  if (which === "vial") app.ui.sd.vialUnit = unit;
  else if (which === "dose") app.ui.sd.doseUnit = unit;
  else return false;
  app.ui.sd.error = "";
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function noteReconstitutionField(id, value) {
  if (!app.ui || !app.ui.sd || app.ui.sheet !== "routines-calc") return false;
  const key = id === "dr-calc-vial" ? "vial" : id === "dr-calc-water" ? "water" : id === "dr-calc-dose" ? "dose" : "";
  if (!key) return false;
  app.ui.sd[key] = typeof value === "string" ? value : "";
  app.ui.sd.error = "";
  const slot = typeof app.$ === "function" ? app.$("#dr-calc-result") : null;
  if (slot) slot.innerHTML = reconstitutionLiveHTML();
  return true;
}

app.openRoutineHistory = openRoutineHistory;
app.openRoutineLogEditor = openRoutineLogEditor;
app.commitRoutineLogSheet = commitRoutineLogSheet;
app.openReconstitution = openReconstitution;
app.saveReconstitutionNote = saveReconstitutionNote;
app.routineHistorySheetHTML = routineHistorySheetHTML;
app.routineLogSheetHTML = routineLogSheetHTML;
app.reconstitutionSheetHTML = reconstitutionSheetHTML;
app.reconstitutionLiveHTML = reconstitutionLiveHTML;
app.setRoutineLogQuarter = setRoutineLogQuarter;
app.setReconstitutionUnit = setReconstitutionUnit;
app.noteReconstitutionField = noteReconstitutionField;
