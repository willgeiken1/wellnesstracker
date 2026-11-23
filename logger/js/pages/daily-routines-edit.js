import { app } from "../runtime.js";
import { canMutateRoutines, projectDailyRoutines } from "../shared/daily-routines-store.js";
import { routineSetupShows } from "../shared/routine-setup.js";
import { routineBlockWindow } from "../shared/routine-dose.js";
import { CUSTOM_TYPE_MAX, ROUTINE_TYPE_ORDER, routineShortName, routineTypeChoices } from "../shared/routine-types.js";
import {
  ROUTINE_BLOCK_COLORS,
  ROUTINE_DOSE_UNITS,
  deleteRoutineBlock,
  deleteRoutineItem,
  duplicateRoutineBlock,
  rememberRoutineBlock,
  renameRoutineBlock,
  renameRoutineItem,
  reorderRoutineBlocks,
  reorderRoutinePlacements,
  restoreRoutineBlock,
  restoreRoutineItem,
  routineClock,
  routineItemDraft,
  saveRoutineItem,
  setRoutineBlockColor,
} from "./daily-routines.js";
import { supplyDraftError } from "../shared/routine-supply.js";
import {
  ARC,
  amountDraftText,
  amountEditText,
  amountFieldText,
  amountMeterHTML,
  arcHolds,
  arcMinutesAt,
  arcPoint,
  arcReadout,
  arcSegmentPath,
  arcSegments,
  arcStepMinutes,
  clockMinutes,
  doseReadback,
  doseSet,
  parseSheetAmount,
  patchLive,
  plainAmount,
  stepAllowed,
  stepAmount,
  stepButtonsHTML,
  unitButtonsHTML,
} from "./daily-routines-sheet-parts.js";

/* Block and item editing. Logging stays a tap on the row.
   Drag follows home-drag.js: a handle starts the drag, the card uses
   translate3d, and the other cards slide with a FLIP. Reduce Motion
   drops the slide. The write is placement or block order only. */

const HOLD_MS = 500;
const HOLD_SLOP = 10;
const TOUCH_ARM_MS = 220;
const MOUSE_SLOP = 4;
const EDGE_TOP = 96;
const EDGE_BOTTOM = 150;
const MAX_SCROLL = 18;
const LIFT_MS = 120;
const SLIDE_MS = 180;
const ARC_TAP_SLOP = 8;
const BUMP_MS = 220;

let hold = null;
let pend = null;
let drag = null;
let busy = false;
let holdFiredAt = -10000;

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function motionMs() {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  } catch (e) { /* assume motion is fine */ }
  return SLIDE_MS;
}

function moveList(list, from, to) {
  const out = Array.isArray(list) ? list.slice() : [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return out;
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

function editingReady() {
  return app.ROUTINES_ENABLED === true && !!(app.ui && app.ui.dailyRoutineEdit === true && !app.ui.sheet && app.ui.tab === "daily-routines");
}

function persist(ok, message, undo) {
  if (!ok) return false;
  if (typeof app.save === "function") app.save();
  if (app.ui) app.ui.routineAnnounce = message;
  if (typeof app.render === "function") app.render();
  const wrapped = typeof undo === "function"
    ? () => {
      if (!undo()) return;
      if (typeof app.save === "function") app.save();
      if (app.ui) app.ui.routineAnnounce = "Restored.";
      if (typeof app.render === "function") app.render();
    }
    : null;
  if (message && typeof app.toast === "function") app.toast(message, wrapped);
  return true;
}

export function toggleRoutineLayoutEdit() {
  if (!app.ui || app.ROUTINES_ENABLED !== true) return false;
  app.ui.dailyRoutineEdit = app.ui.dailyRoutineEdit !== true;
  app.ui.routineAnnounce = app.ui.dailyRoutineEdit
    ? "Editing routines. Drag a handle to reorder. Long press a name to rename."
    : "Done editing.";
  if (typeof app.render === "function") app.render();
  return true;
}

/* From the Edit routines sheet: close it first, so the drag handles are
   not under it, and turn rearranging on. */
export function startRoutineRearrange() {
  if (!app.ui || app.ROUTINES_ENABLED !== true) return false;
  if (app.ui.sheet) {
    app.ui.sheet = null;
    if (typeof app.renderSheet === "function") app.renderSheet();
  }
  app.ui.routineView = "routines";
  if (app.ui.dailyRoutineEdit === true) {
    if (typeof app.render === "function") app.render();
    return true;
  }
  return toggleRoutineLayoutEdit();
}

export async function promptRoutineRename(kind, id) {
  if (app.ROUTINES_ENABLED !== true || !canMutateRoutines() || typeof app.ask !== "function") return false;
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  if (!view || (kind !== "block" && kind !== "item")) return false;
  const row = kind === "block"
    ? (view.blocks || []).find((block) => block.id === id)
    : (view.items || []).find((item) => item.id === id);
  if (!row) return false;
  const next = await app.ask({
    title: kind === "block" ? "Rename routine" : "Rename item",
    ok: "Save",
    cancel: "Cancel",
    input: row.name || "",
  });
  if (typeof next !== "string") return false;
  const saved = kind === "block" ? renameRoutineBlock(app.state, id, next) : renameRoutineItem(app.state, id, next);
  return persist(saved, kind === "block" ? "Routine renamed." : "Item renamed.");
}

export function openRoutineItemEditor(blockId, itemId, preset) {
  if (app.ROUTINES_ENABLED !== true || !canMutateRoutines() || !app.ui) return false;
  app.ui.sheet = "routines-item";
  const extra = preset && typeof preset === "object" ? preset : {};
  const draft = routineItemDraft(app.state, { blockId, itemId, type: extra.type, kind: extra.kind });
  /* Only a saved dose has a unit. Anything else starts with none picked, so
     the unit is always one the user chose. */
  if (!draft.itemId || draft.kind !== "dose") draft.unit = "";
  app.ui.sd = draft;
  if (typeof blockId === "string" && blockId && rememberRoutineBlock(app.state, blockId) && typeof app.save === "function") app.save();
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function removeRoutineBlock(blockId) {
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  const block = view && (view.blocks || []).find((row) => row.id === blockId);
  if (!block || !deleteRoutineBlock(app.state, blockId)) return false;
  return persist(true, `${block.name} deleted.`, () => restoreRoutineBlock(app.state, blockId));
}

export function removeRoutineItem(itemId) {
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  const item = view && (view.items || []).find((row) => row.id === itemId);
  if (!item || !deleteRoutineItem(app.state, itemId)) return false;
  if (app.ui && app.ui.sheet === "routines-item") app.ui.sheet = null;
  return persist(true, `${item.name} removed from all routines.`, () => restoreRoutineItem(app.state, itemId));
}

export function copyRoutineBlock(blockId) {
  if (!duplicateRoutineBlock(app.state, blockId)) return false;
  return persist(true, "Routine duplicated. Items are shared, so logs stay put.");
}

export function paintRoutineBlock(blockId, color) {
  if (!setRoutineBlockColor(app.state, blockId, color)) return false;
  if (typeof app.save === "function") app.save();
  if (typeof app.render === "function") app.render();
  return true;
}

/* Copy the open item fields into the draft. A unit, step, or routine tap
   redraws the sheet from the draft, so a typed count or mix date has to be
   stored before that. A missing field is left as it was. The amount is
   kept as plain digits, so ½ and 0,5 both save as 0.5. */
export function rememberRoutineItemFields() {
  const sd = app.ui && app.ui.sd;
  if (!sd || !app.ui || app.ui.sheet !== "routines-item" || typeof app.$ !== "function") return false;
  const read = (id) => {
    const el = app.$(`#${id}`);
    return el && typeof el.value === "string" ? el.value : null;
  };
  const name = read("dr-item-name");
  const amount = read("dr-item-amount");
  const onHand = read("dr-item-on-hand");
  const mixed = read("dr-item-mixed-on");
  const time = read("dr-item-time");
  if (name != null) sd.name = name;
  if (time != null) sd.time = time;
  if (amount != null) sd.amount = amountDraftText(amount);
  if (onHand != null) sd.onHand = onHand;
  if (mixed != null) sd.mixedOn = mixed;
  return true;
}

export function commitRoutineItemSheet() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : null;
  if (!sd) return false;
  rememberRoutineItemFields();
  const supplyProblem = supplyDraftError(sd, routineClock().day);
  if (supplyProblem) {
    if (typeof app.toast === "function") app.toast(supplyProblem);
    return false;
  }
  if (!saveRoutineItem(app.state, sd)) {
    const placed = Array.isArray(sd.blockIds) && sd.blockIds.length > 0;
    const message = !placed && !sd.type ? "Pick a type or a routine."
      : sd.kind === "dose" ? "Add a name, an amount, and a unit." : "Add a name.";
    if (typeof app.toast === "function") app.toast(message);
    return false;
  }
  app.ui.sheet = null;
  return persist(true, sd.itemId ? "Item saved." : "Item added.");
}

/* ---------- The Add item and Edit item sheet ---------- */

const ICON = Object.freeze({
  supplement: `<rect x="4" y="8.5" width="16" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9.7 8.8l4.6 6.4"/>`,
  peptide: `<rect x="8.5" y="3.5" width="7" height="17" rx="3"/><path d="M7 3.5h10M8.5 13h7"/>`,
  medication: `<circle cx="12" cy="12" r="7.5"/><path d="M7 12h10"/>`,
  enhancer: `<path d="M13 3L6 13.5h5.5L10.5 21 18 10.5h-5.5z"/>`,
  other: `<circle cx="6.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="17.5" cy="12" r="1.2"/>`,
  custom: `<path d="M4 12.6V5.5A1.5 1.5 0 0 1 5.5 4h7.1l7.4 7.4-8.6 8.6z"/><circle cx="8.6" cy="8.6" r="1.2"/>`,
  add: `<path d="M12 6v12M6 12h12"/>`,
  check: `<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.5 2.5 4.9-5"/>`,
  calc: `<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7.5h7M8.5 12h1M12 12h1M15.5 12h0M8.5 16h1M12 16h1M15.5 16h0"/>`,
});

function icon(name) {
  return `<svg class="dr-ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ICON.custom}</svg>`;
}

function clip(text, max) {
  const value = String(text == null ? "" : text);
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function n1(value) {
  return String(Math.round(value * 10) / 10);
}

function blockTone(color) {
  return ROUTINE_BLOCK_COLORS.includes(color) ? color : "citrus";
}

/* Built-in types in tab order, then the user's own. */
function sheetTypeChoices(prefs) {
  const rank = (choice) => {
    const at = ROUTINE_TYPE_ORDER.indexOf(choice.id);
    return at < 0 ? ROUTINE_TYPE_ORDER.length : at;
  };
  return routineTypeChoices(prefs)
    .map((choice, index) => ({ choice, index }))
    .sort((a, b) => (a.choice.custom ? 1 : 0) - (b.choice.custom ? 1 : 0) || rank(a.choice) - rank(b.choice) || a.index - b.index)
    .map((row) => row.choice);
}

/* The routines the sheet offers, in page order. A hidden routine is not
   offered. One with no window has no stroke on the path, only a legend row. */
function sheetRoutines(view) {
  return (view.blocks || [])
    .filter((block) => block && block.hidden !== true)
    .map((block) => ({
      id: block.id,
      full: block.name,
      name: clip(routineShortName(block) || block.name, 22),
      color: blockTone(block.color),
      window: routineBlockWindow(block),
    }));
}

function dosesOffered(sd, view, kind) {
  /* A setup with nothing to take hides the Dose type for new items. An item
     that is already a dose keeps it, so switching to Check can be undone. */
  const storedDose = !!sd.itemId && (view.items || []).some((item) => item.id === sd.itemId && item.kind === "dose");
  if (kind === "dose" || storedDose) return true;
  return typeof app.routineShows === "function"
    ? app.routineShows("doses")
    : routineSetupShows(app.state && app.state.dailyRoutines && app.state.dailyRoutines.prefs, "doses");
}

function sunPathHTML(sd, routines, selected) {
  const timeMin = clockMinutes(sd.time);
  const picked = routines.filter((routine) => selected.has(routine.id));
  const readout = arcReadout({ timeMin, routines, picked });
  const strokes = [];
  routines.forEach((routine, index) => {
    arcSegments(routine.window).forEach(([from, to], part) => {
      strokes.push(`<path class="dr-is-seg" data-live="seg-${index}-${part}" data-live-mode="attrs" data-color="${routine.color}" data-on="${selected.has(routine.id) ? "true" : "false"}" d="${arcSegmentPath(from, to)}"/>`);
    });
  });
  let pin = "";
  if (arcHolds(timeMin)) {
    const [x, y] = arcPoint(timeMin);
    pin = `<line x1="${n1(x)}" y1="${ARC.hy}" x2="${n1(x)}" y2="${n1(y)}" class="dr-is-pin"/><circle cx="${n1(x)}" cy="${n1(y)}" r="8" class="dr-is-pinh"/>`;
  }
  const labels = [5, 11, 14, 17, 23].map((hour) => `<text x="${n1(arcPoint(hour * 60)[0])}" y="116" class="dr-is-arc-lbl" text-anchor="middle">${String(hour).padStart(2, "0")}</text>`).join("");
  const now = timeMin == null ? ARC.startMin : Math.max(ARC.startMin, Math.min(ARC.endMin, timeMin));
  return `<svg class="dr-is-arc" id="dr-item-arc" data-live="arc" data-live-mode="attrs" data-arc="true" viewBox="0 0 ${ARC.width} ${ARC.height}" role="slider" tabindex="0" aria-label="Sun path. Tap or drag it to set a time. The Time field below does the same." aria-orientation="horizontal" aria-valuemin="${ARC.startMin}" aria-valuemax="${ARC.endMin}" aria-valuenow="${now}" aria-valuetext="${timeMin == null ? "No time set" : esc(sd.time)}">
        <path d="${arcSegmentPath(ARC.startMin, ARC.endMin)}" class="dr-is-arc-dash"/>
        <g>${strokes.join("")}</g>
        <g data-live="pin">${pin}</g>
        <line x1="10" y1="${ARC.hy}" x2="290" y2="${ARC.hy}" class="dr-is-arc-hz"/>
        ${labels}
        <text x="${ARC.cx}" y="66" class="dr-is-arc-big" text-anchor="middle" data-live="arc-big">${esc(clip(readout.big, 20))}</text>
        <text x="${ARC.cx}" y="84" class="dr-is-arc-sub" text-anchor="middle" data-live="arc-sub">${esc(readout.sub)}</text>
      </svg>`;
}

export function routineItemSheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const kind = sd.kind === "dose" ? "dose" : "check";
  const dose = kind === "dose";
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines) || { blocks: [] };
  const selected = new Set(Array.isArray(sd.blockIds) ? sd.blockIds : []);
  const editing = !!sd.itemId;
  const offered = dosesOffered(sd, view, kind);
  const amount = parseSheetAmount(sd.amount);
  const unit = ROUTINE_DOSE_UNITS.includes(sd.unit) ? sd.unit : "";
  const today = routineClock().day;
  const closed = !dose;
  const tab = closed ? ` tabindex="-1"` : "";

  const typeChoices = sheetTypeChoices(view.prefs);
  const types = typeChoices.map((choice, index) => `<button type="button" class="dr-is-type${choice.custom ? " dr-is-type-own" : ""}" data-live="type-${index}" data-live-mode="attrs" data-action="routines-item-type" data-type="${esc(choice.id)}" aria-pressed="${sd.type === choice.id ? "true" : "false"}"><i>${icon(choice.custom ? "custom" : choice.id)}</i><span>${esc(choice.name)}</span></button>`).join("")
    + (typeChoices.filter((choice) => choice.custom).length < CUSTOM_TYPE_MAX ? `<button type="button" class="dr-is-type dr-is-type-new" data-action="routines-item-type-new"><i>${icon("add")}</i><span>New type</span></button>` : "");

  const kindCard = (value, name, title, line) => `<button type="button" class="dr-is-kind" role="radio" data-live="kind-${value}" data-live-mode="attrs" data-action="routines-item-kind" data-kind="${value}" aria-checked="${kind === value ? "true" : "false"}" tabindex="${kind === value ? "0" : "-1"}">${icon(name)}<b>${title}</b><span>${line}</span></button>`;
  const kinds = kindCard("check", "check", "Check", "Tick it once when it's done.")
    + (offered ? kindCard("dose", "peptide", "Dose", "Log the amount and unit you type.") : "");

  const doseCard = offered ? `<div class="dr-is-reveal" id="dr-item-dose" data-live="dose" data-live-mode="attrs" data-open="${dose ? "true" : "false"}" aria-hidden="${dose ? "false" : "true"}"${closed ? " inert" : ""}><div><div class="dr-is-reveal-in">
      <div class="dr-is-dcard">
        <div class="dr-is-k"><label for="dr-item-amount">Amount</label><button type="button" class="dr-clr" data-live="amount-clear" data-live-mode="attrs" data-action="routines-item-amount-clear"${amount == null && !sd.amount ? " disabled" : ""}${tab}>Clear</button></div>
        <div class="dr-readout" id="dr-item-readout"><input class="dr-amt-in" id="dr-item-amount" data-live="amount" data-live-mode="value" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="0" aria-describedby="dr-item-sum"${tab} value="${esc(amountFieldText(sd.amount))}"><em class="dr-unit-out${unit ? "" : " dr-unit-none"}" data-live="unit-out">${unit ? esc(unit) : "unit"}</em></div>
        <div class="dr-useg" role="group" aria-label="Unit">${unitButtonsHTML(ROUTINE_DOSE_UNITS, unit, "routines-item-unit", { closed })}</div>
        <div class="dr-steps-cap" aria-hidden="true"><span>Take away</span><span>Add</span></div>
        <div class="dr-steps" role="group" aria-label="Change the amount" data-live="steps">${stepButtonsHTML(amount, "routines-item-step", { closed })}</div>
        <svg class="dr-gauge" data-live="gauge" viewBox="0 0 300 34" aria-hidden="true"${amountMeterHTML(amount) ? "" : " hidden"}>${amountMeterHTML(amount)}</svg>
        <p class="dr-is-sum${doseSet(amount, unit) ? "" : " dr-is-sum-wait"}" id="dr-item-sum" data-live="sum" aria-live="polite">${esc(doseReadback(amount, unit))}</p>
      </div>
      <p class="dr-is-help">The amount and unit are what you type. Nothing here suggests a dose.</p>
      <button type="button" class="dr-is-calc" data-live="calc" data-live-mode="attrs" data-action="routines-item-calc"${dose && sd.type === "peptide" ? "" : " hidden"}${tab}>${icon("calc")}<span class="dr-is-calc-t"><b>Reconstitution calculator</b><small>Works out mL from your vial and water</small></span><span class="dr-is-chev" aria-hidden="true">›</span></button>
    </div></div></div>` : "";

  const routines = sheetRoutines(view);
  const legend = routines.length
    ? `<div class="dr-is-legend" role="group" aria-label="Routines">${routines.map((routine, index) => `<button type="button" data-live="block-${index}" data-live-mode="attrs" data-action="routines-item-block" data-block-id="${esc(routine.id)}" data-color="${routine.color}" aria-pressed="${selected.has(routine.id) ? "true" : "false"}"><span class="dr-is-ck" aria-hidden="true"><span></span></span>${esc(routine.full)}</button>`).join("")}</div>`
    : "";
  const hasTime = typeof sd.time === "string" && sd.time.trim() !== "";

  const mixed = dose ? `<label class="dr-is-mini" for="dr-item-mixed-on"><span>Mixed on, optional</span><input id="dr-item-mixed-on" type="date" autocomplete="off" max="${esc(today)}" value="${esc(sd.mixedOn || "")}" aria-describedby="dr-item-mixed-help"></label>` : "";
  const remove = editing
    ? `<button type="button" class="btn block dr-is-remove" data-action="routines-delete-item" data-item-id="${esc(sd.itemId)}">Remove from all routines</button>`
    : "";

  return `<div class="dr-is" id="dr-item-sheet">
    <h3>${editing ? "Edit item" : "Add item"}</h3>
    <div class="dr-is-blk">
      <label class="dr-is-cap" for="dr-item-name">Name</label>
      <input class="dr-is-name" id="dr-item-name" autocomplete="off" maxlength="80" enterkeyhint="done" placeholder="What is it?" value="${esc(sd.name || "")}">
    </div>
    <div class="dr-is-blk">
      <span class="dr-is-cap" id="dr-type-label">Type <em>Optional</em></span>
      <div class="dr-is-types" role="group" aria-labelledby="dr-type-label">${types}</div>
    </div>
    <div class="dr-is-blk">
      <span class="dr-is-cap" id="dr-kind-label">Log as</span>
      <div class="dr-is-kinds" role="radiogroup" aria-labelledby="dr-kind-label" data-count="${offered ? "2" : "1"}">${kinds}</div>
    </div>
    ${doseCard}
    <div class="dr-is-blk">
      <span class="dr-is-cap" id="dr-arc-label">Routines and time</span>
      <div class="dr-is-arcwrap">
        ${sunPathHTML(sd, routines, selected)}
        ${legend}
        <div class="dr-is-trow" data-live="time-row" data-live-mode="attrs" data-empty="${hasTime ? "false" : "true"}">
          <label for="dr-item-time">Time</label>
          <span class="dr-is-tval"><input id="dr-item-time" data-live="time" data-live-mode="value" type="time" step="300" autocomplete="off" value="${esc(sd.time || "")}"><span class="dr-is-tph" aria-hidden="true">Routine start</span></span>
          <button type="button" class="dr-is-tclear" data-live="time-clear" data-live-mode="attrs" data-action="routines-item-time-clear"${hasTime ? "" : " hidden"}>Clear</button>
        </div>
      </div>
      <p class="dr-is-help" data-live="routine-help">${sd.type ? "Optional with a type. It shows on its tab either way." : "The same item can sit in more than one routine. Logging it once covers all of them."}</p>
    </div>
    <div class="dr-is-blk" data-live="supply">
      <div class="dr-is-twof" data-count="${dose ? "2" : "1"}">
        <label class="dr-is-mini" for="dr-item-on-hand"><span>On hand, optional</span><input id="dr-item-on-hand" inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="Hidden" value="${esc(sd.onHand || "")}" aria-describedby="dr-item-on-hand-help"></label>
        ${mixed}
      </div>
      <p class="dr-is-help" id="dr-item-on-hand-help">Leave this blank to hide it. Days left uses this count and the days you logged.</p>
      ${dose ? `<p class="dr-is-help" id="dr-item-mixed-help">Leave this blank unless a vial was mixed. It shows how many days ago.</p>` : ""}
    </div>
    <p class="dr-is-evi"><i aria-hidden="true">i</i><span class="dr-evidence">Custom item. No evidence is attached.</span></p>
    <button type="button" class="btn primary block dr-is-cta" data-action="routines-item-save">${editing ? "Save" : "Add item"}</button>
    ${remove}
  </div>`;
}

/* Redraw the open item sheet from its draft. In the app the parts that
   changed are updated in place. When that cannot be done the whole sheet
   is drawn again, unless the user is typing, where a redraw would drop the
   keyboard. */
export function refreshRoutineItemSheet(options) {
  if (!app.ui || app.ui.sheet !== "routines-item") return false;
  const root = typeof app.$ === "function" ? app.$("#dr-item-sheet") : null;
  let patched = false;
  try { patched = patchLive(root, routineItemSheetHTML()); } catch (e) { patched = false; }
  if (!patched && !(options && options.typing) && typeof app.renderSheet === "function") app.renderSheet();
  return patched;
}

/* A short scale on the number after a step. Reduce Motion skips it. */
function bumpReadout(selector) {
  if (!motionMs() || typeof app.$ !== "function") return;
  const el = app.$(selector);
  if (!el || !el.classList || typeof el.classList.add !== "function") return;
  el.classList.remove("dr-bump");
  void el.offsetWidth;
  el.classList.add("dr-bump");
  setTimeout(() => { if (el.classList) el.classList.remove("dr-bump"); }, BUMP_MS + 40);
}

function itemDraft() {
  return app.ui && app.ui.sheet === "routines-item" && app.ui.sd ? app.ui.sd : null;
}

/* After a tap changed the draft, put the new text in the field. A field
   that still has focus (a phone keeps the keyboard up through a tap) shows
   plain digits. A button that just went away hands focus to the field. */
function settleField(selector, text, editText) {
  const field = typeof app.$ === "function" ? app.$(selector) : null;
  if (!field || typeof field.value !== "string") return;
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const value = active === field && editText != null ? editText : text;
  if (field.value !== value) field.value = value;
  const lost = active && active !== field && (active.disabled === true || active.hidden === true) && typeof field.closest === "function" && field.closest(".sheet-card") && field.closest(".sheet-card").contains(active);
  if (lost && typeof field.focus === "function") field.focus({ preventScroll: true });
}

function settleAmount() {
  const sd = itemDraft();
  if (sd) settleField("#dr-item-amount", amountFieldText(sd.amount), amountEditText(sd.amount));
}

/* Add to or take away from the typed amount. The step has to be one the
   amount on screen offers, and a result of zero or less clears the field. */
export function stepRoutineItemAmount(delta) {
  const sd = itemDraft();
  if (!sd || sd.kind !== "dose") return false;
  rememberRoutineItemFields();
  const amount = parseSheetAmount(sd.amount);
  if (!stepAllowed(amount, delta)) return false;
  const next = stepAmount(amount, delta);
  sd.amount = next == null ? "" : plainAmount(next);
  refreshRoutineItemSheet();
  settleAmount();
  bumpReadout("#dr-item-readout");
  return true;
}

export function clearRoutineItemAmount() {
  const sd = itemDraft();
  if (!sd) return false;
  rememberRoutineItemFields();
  sd.amount = "";
  refreshRoutineItemSheet();
  settleAmount();
  bumpReadout("#dr-item-readout");
  return true;
}

export function clearRoutineItemTime() {
  const sd = itemDraft();
  if (!sd) return false;
  rememberRoutineItemFields();
  sd.time = "";
  refreshRoutineItemSheet();
  settleField("#dr-item-time", "", "");
  return true;
}

/* A typed character in the sheet. The amount and the time redraw what
   depends on them. The count takes digits only. */
export function noteRoutineItemField(el) {
  const sd = itemDraft();
  if (!sd || !el) return false;
  if (el.id === "dr-item-on-hand" && typeof el.value === "string") {
    const digits = el.value.replace(/\D/g, "");
    if (digits !== el.value) el.value = digits;
  }
  rememberRoutineItemFields();
  if (el.id === "dr-item-amount" || el.id === "dr-item-time") refreshRoutineItemSheet({ typing: true });
  return true;
}

/* ---------- Setting the time on the sun path ---------- */

let arcDrag = null;

function arcOf(target) {
  if (!itemDraft() || !target || typeof target.closest !== "function") return null;
  return target.closest("[data-arc]");
}

function setArcMinutes(minutes) {
  const sd = itemDraft();
  if (!sd || minutes == null) return false;
  const [hours, mins] = [Math.floor(minutes / 60), minutes % 60];
  const text = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  if (sd.time === text) return true;
  sd.time = text;
  refreshRoutineItemSheet();
  settleField("#dr-item-time", text, text);
  return true;
}

function setArcFromPointer(clientX) {
  const svg = typeof app.$ === "function" ? app.$("#dr-item-arc") : null;
  if (!svg || typeof svg.getBoundingClientRect !== "function") return false;
  const rect = svg.getBoundingClientRect();
  if (!rect.width) return false;
  return setArcMinutes(arcMinutesAt(((clientX - rect.left) / rect.width) * ARC.width));
}

function captureArc(svg, pointerId) {
  if (svg && typeof svg.setPointerCapture === "function" && pointerId != null) {
    try { svg.setPointerCapture(pointerId); } catch (e) { /* the document listeners still follow the pointer */ }
  }
}

/* A mouse sets the time on press and follows the drag. A finger sets it on
   a tap or a sideways drag, so a scroll that starts on the path stays a scroll. */
function onArcDown(ev) {
  if (!ev || ev.button > 0 || ev.isPrimary === false) return;
  const svg = arcOf(ev.target);
  if (!svg) return;
  rememberRoutineItemFields();
  arcDrag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, live: ev.pointerType === "mouse" };
  if (arcDrag.live) {
    captureArc(svg, ev.pointerId);
    setArcFromPointer(ev.clientX);
  }
}

function onArcMove(ev) {
  if (!arcDrag || ev.pointerId !== arcDrag.id) return;
  if (!itemDraft()) { arcDrag = null; return; }
  if (!arcDrag.live) {
    const dx = Math.abs(ev.clientX - arcDrag.x);
    const dy = Math.abs(ev.clientY - arcDrag.y);
    if (dx < ARC_TAP_SLOP || dx <= dy) return;
    arcDrag.live = true;
    captureArc(typeof app.$ === "function" ? app.$("#dr-item-arc") : null, ev.pointerId);
  }
  setArcFromPointer(ev.clientX);
  if (ev.cancelable) ev.preventDefault();
}

function onArcUp(ev) {
  if (!arcDrag || ev.pointerId !== arcDrag.id) return;
  const tap = !arcDrag.live && Math.abs(ev.clientX - arcDrag.x) < ARC_TAP_SLOP && Math.abs(ev.clientY - arcDrag.y) < ARC_TAP_SLOP;
  arcDrag = null;
  if (tap && itemDraft()) setArcFromPointer(ev.clientX);
}

function onArcCancel(ev) {
  if (arcDrag && ev.pointerId === arcDrag.id) arcDrag = null;
}

/* Arrow keys move the time by 5 minutes, Page keys by an hour, and Home and
   End go to the ends of the path. With no time yet, the first key starts
   from the routine's start, or noon. A time typed outside the path (02:00)
   moves from where it is, so an arrow gives 02:05 and not 05:00. */
function onArcKey(ev) {
  const svg = arcOf(ev.target);
  if (!svg || ev.target !== svg) return false;
  const step = ev.key === "ArrowLeft" || ev.key === "ArrowDown" ? -5
    : ev.key === "ArrowRight" || ev.key === "ArrowUp" ? 5
      : ev.key === "PageDown" ? -60 : ev.key === "PageUp" ? 60 : 0;
  if (!step && ev.key !== "Home" && ev.key !== "End") return false;
  ev.preventDefault();
  const sd = itemDraft();
  rememberRoutineItemFields();
  const clamp = (minutes) => Math.max(ARC.startMin, Math.min(ARC.endMin, minutes));
  const current = clockMinutes(sd.time);
  let next;
  if (ev.key === "Home") next = ARC.startMin;
  else if (ev.key === "End") next = ARC.endMin;
  else if (current != null) next = arcStepMinutes(current, step);
  else {
    const view = projectDailyRoutines(app.state && app.state.dailyRoutines) || { blocks: [] };
    const picked = new Set(Array.isArray(sd.blockIds) ? sd.blockIds : []);
    const first = sheetRoutines(view).find((routine) => picked.has(routine.id) && routine.window);
    next = clamp(first ? first.window.startMin : 12 * 60);
  }
  setArcMinutes(next);
  const again = typeof app.$ === "function" ? app.$("#dr-item-arc") : null;
  if (again && again !== svg && typeof again.focus === "function") again.focus({ preventScroll: true });
  return true;
}

/* Log as is a radio group: the arrow keys move between Check and Dose. */
function onKindKey(ev) {
  const radio = ev.target && typeof ev.target.closest === "function" ? ev.target.closest('[role="radio"][data-action="routines-item-kind"]') : null;
  if (!radio || !itemDraft()) return false;
  const step = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 0;
  if (!step) return false;
  const group = radio.closest('[role="radiogroup"]');
  const radios = group ? Array.from(group.querySelectorAll('[role="radio"]')) : [];
  if (radios.length < 2) return false;
  ev.preventDefault();
  const next = radios[(radios.indexOf(radio) + step + radios.length) % radios.length];
  const kind = next.dataset.kind === "dose" ? "dose" : "check";
  rememberRoutineItemFields();
  app.ui.sd.kind = kind;
  refreshRoutineItemSheet();
  const again = typeof app.$ === "function" ? app.$(`[role="radio"][data-kind="${kind}"]`) : null;
  if (again && typeof again.focus === "function") again.focus({ preventScroll: true });
  return true;
}

function onSheetKey(ev) {
  if (!ev || !itemDraft()) return;
  if (onArcKey(ev)) return;
  onKindKey(ev);
}

/* The amount shows ¼ ½ ¾ at rest and plain digits while it is edited. */
function onAmountFocus(ev) {
  const el = ev && ev.target;
  if (!el || el.id !== "dr-item-amount" || !itemDraft()) return;
  const text = amountEditText(app.ui.sd.amount);
  if (typeof el.value === "string" && el.value !== text) el.value = text;
}

function onAmountBlur(ev) {
  const el = ev && ev.target;
  if (!el || el.id !== "dr-item-amount" || !itemDraft()) return;
  rememberRoutineItemFields();
  el.value = amountFieldText(app.ui.sd.amount);
  refreshRoutineItemSheet({ typing: true });
}

function cancelHold() {
  if (hold) { clearTimeout(hold.timer); hold = null; }
}

function cancelPend() {
  if (pend) { clearTimeout(pend.timer); pend = null; }
}

function onDown(ev) {
  if (!ev || ev.button > 0 || ev.isPrimary === false) return;
  if (editingReady()) downInEdit(ev);
  if (app.ui && app.ui.sheet) return;
  const target = ev.target && ev.target.closest && ev.target.closest("[data-rename]");
  if (!target || !target.closest(".dr-page")) return;
  if (ev.target.closest(".dr-handle, .dr-minus, .dr-dup, .dr-skip, .dr-add, .dr-swatch, .dr-undo, .dr-rename")) return;
  /* Item long-press outside edit mode opens the details page.
     A block name still renames. Edit mode still renames the item. */
  if (target.dataset.rename === "item" && !(app.ui && app.ui.dailyRoutineEdit === true)) return;
  cancelHold();
  hold = {
    id: ev.pointerId,
    x: ev.clientX,
    y: ev.clientY,
    kind: target.dataset.rename,
    itemId: target.dataset.itemId || "",
    blockId: target.dataset.blockId || "",
    timer: setTimeout(() => {
      const pending = hold;
      hold = null;
      if (!pending) return;
      holdFiredAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      app.wEatClick = true;
      app.eatClick = true;
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* no haptics here */ }
      const id = pending.kind === "block" ? pending.blockId : pending.itemId;
      promptRoutineRename(pending.kind, id);
    }, HOLD_MS),
  };
}

function downInEdit(ev) {
  if (busy || drag) return;
  const handle = ev.target && ev.target.closest && ev.target.closest(".dr-handle");
  if (!handle || !handle.closest(".dr-page")) return;
  const item = handle.closest(".dr-row") || handle.closest(".dr-tile");
  const list = item && item.parentElement;
  if (!item || !list || !list.hasAttribute("data-routine-list") || !item.dataset.id) return;
  cancelPend();
  pend = {
    item,
    id: ev.pointerId,
    type: ev.pointerType,
    x: ev.clientX,
    y: ev.clientY,
    lx: ev.clientX,
    ly: ev.clientY,
    timer: 0,
  };
  if (ev.pointerType !== "mouse") pend.timer = setTimeout(() => { if (pend) startDrag(); }, TOUCH_ARM_MS);
}

function onMove(ev) {
  if (hold && ev.pointerId === hold.id && (Math.abs(ev.clientX - hold.x) > HOLD_SLOP || Math.abs(ev.clientY - hold.y) > HOLD_SLOP)) cancelHold();
  if (pend && ev.pointerId === pend.id) {
    pend.lx = ev.clientX;
    pend.ly = ev.clientY;
    const dist = Math.max(Math.abs(ev.clientX - pend.x), Math.abs(ev.clientY - pend.y));
    if (pend.type === "mouse") { if (dist > MOUSE_SLOP) startDrag(); }
    else if (dist > HOLD_SLOP) cancelPend();
  }
  if (drag && ev.pointerId === drag.pointerId) {
    drag.px = ev.clientX;
    drag.py = ev.clientY;
    if (ev.cancelable) ev.preventDefault();
    schedule();
  }
}

function onUp(ev) {
  cancelHold();
  if (pend && ev.pointerId === pend.id) cancelPend();
  if (drag && ev.pointerId === drag.pointerId) endDrag();
}

function measure(d) {
  const top = d.scroller.scrollTop;
  d.slots.forEach((el) => {
    const rect = el.getBoundingClientRect();
    d.rects.set(el.dataset.id, { l: rect.left, t: rect.top + top, w: rect.width, h: rect.height, rect });
  });
}

function startDrag() {
  const pending = pend;
  cancelPend();
  if (!pending || !pending.item.isConnected || !editingReady()) return;
  const el = pending.item;
  const list = el.parentElement;
  const slots = [...list.querySelectorAll(list.dataset.routineList === "blocks" ? ":scope > .dr-tile" : ":scope > .dr-row")];
  const scroller = el.closest(".pane") || document.scrollingElement || document.documentElement;
  const d = {
    el,
    list,
    slots,
    scroller,
    kind: list.dataset.routineList === "blocks" ? "block" : "item",
    blockId: el.dataset.blockId || list.dataset.blockId || "",
    id: el.dataset.id,
    pointerId: pending.id,
    px: pending.lx,
    py: pending.ly,
    gx: 0,
    gy: 0,
    rects: new Map(),
    order: slots.map((slot) => slot.dataset.id),
    cool: 0,
    raf: 0,
  };
  measure(d);
  const origin = d.rects.get(d.id);
  if (!origin) return;
  d.gx = d.px - origin.l;
  d.gy = d.py + scroller.scrollTop - origin.t;
  d.byId = new Map(slots.map((slot) => [slot.dataset.id, slot]));
  drag = d;
  try { el.setPointerCapture(pending.id); } catch (e) { /* document listeners still follow the pointer */ }
  el.classList.add("dragging");
  list.classList.add("dragging-any");
  el.style.transition = `transform ${motionMs() ? LIFT_MS : 0}ms ease-out`;
  setTimeout(() => { if (drag === d) el.style.transition = ""; }, LIFT_MS);
  schedule();
}

function schedule() {
  if (drag && !drag.raf && typeof requestAnimationFrame === "function") drag.raf = requestAnimationFrame(tick);
}

function tick() {
  const d = drag;
  if (!d) return;
  d.raf = 0;
  if (!d.el.isConnected) { drag = null; return; }
  const scroller = d.scroller;
  const before = scroller.scrollTop;
  if (d.py < EDGE_TOP) scroller.scrollTop -= Math.ceil(MAX_SCROLL * Math.min(1, (EDGE_TOP - d.py) / EDGE_TOP + 0.3));
  else if (d.py > window.innerHeight - EDGE_BOTTOM) scroller.scrollTop += Math.ceil(MAX_SCROLL * Math.min(1, (d.py - (window.innerHeight - EDGE_BOTTOM)) / EDGE_BOTTOM + 0.3));
  const scrolled = scroller.scrollTop !== before;
  const cy = d.py + scroller.scrollTop;
  const origin = d.rects.get(d.id);
  d.el.style.transform = `translate3d(${d.px - d.gx - origin.l}px, ${cy - d.gy - origin.t}px, 0) scale(1.02)`;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now >= d.cool) {
    const hit = d.slots.find((el) => {
      if (el === d.el) return false;
      const other = d.rects.get(el.dataset.id);
      const mx = other.w * 0.15;
      const my = other.h * 0.15;
      return d.px > other.l + mx && d.px < other.l + other.w - mx && cy > other.t + my && cy < other.t + other.h - my;
    });
    if (hit) reorder(d, hit.dataset.id);
  }
  if (scrolled) schedule();
}

function reorder(d, targetId) {
  const to = d.order.indexOf(targetId);
  const from = d.order.indexOf(d.id);
  if (to < 0 || from < 0 || to === from) return;
  d.order = moveList(d.order, from, to);
  const others = d.slots.filter((el) => el !== d.el);
  const first = new Map(others.map((el) => [el, el.getBoundingClientRect()]));
  d.order.forEach((id, index) => { d.byId.get(id).style.order = String(index); });
  const held = d.el.style.transform;
  d.el.style.transform = "none";
  others.forEach((el) => { el.style.transition = "none"; el.style.transform = ""; });
  measure(d);
  d.el.style.transform = held;
  const ms = motionMs();
  others.forEach((el) => {
    const before = first.get(el);
    const rect = d.rects.get(el.dataset.id).rect;
    const dx = before.left - rect.left;
    const dy = before.top - rect.top;
    if (ms && (dx || dy)) el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  });
  if (ms) {
    void d.list.offsetWidth;
    others.forEach((el) => { el.style.transition = `transform ${ms}ms ease`; el.style.transform = ""; });
  }
  d.cool = (typeof performance !== "undefined" ? performance.now() : Date.now()) + ms + 60;
  schedule();
}

function commitDrag(d) {
  const changed = d.order.join("\0") !== d.slots.map((slot) => slot.dataset.id).join("\0");
  if (!changed) return true;
  const ok = d.kind === "block"
    ? reorderRoutineBlocks(app.state, d.order, d.id)
    : reorderRoutinePlacements(app.state, d.blockId, d.order);
  if (!ok) return false;
  if (typeof app.save === "function") app.save();
  const label = d.kind === "block" ? "Routine order saved." : "Item order saved.";
  if (app.ui) app.ui.routineAnnounce = label;
  const live = document.querySelector && document.querySelector(".dr-live");
  if (live) live.textContent = label;
  return true;
}

function endDrag() {
  const d = drag;
  if (!d) return;
  drag = null;
  busy = true;
  if (d.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(d.raf);
  const saved = commitDrag(d);
  if (!saved) {
    busy = false;
    if (typeof app.render === "function") app.render();
    return;
  }
  const ms = motionMs();
  d.el.classList.remove("dragging");
  d.el.classList.add("settling");
  d.el.style.transition = ms ? `transform ${ms}ms ease-out` : "none";
  d.el.style.transform = "";
  const done = () => {
    busy = false;
    if (!d.el.isConnected) return;
    d.list.classList.remove("dragging-any");
    d.el.classList.remove("settling");
    d.order.forEach((id) => { const el = d.byId.get(id); if (el) d.list.appendChild(el); });
    d.slots.forEach((el) => { el.style.order = ""; el.style.transform = ""; el.style.transition = ""; });
    try { d.el.releasePointerCapture(d.pointerId); } catch (e) { /* already released */ }
  };
  if (ms) setTimeout(done, ms + 20);
  else done();
}

function onKey(ev) {
  if (!ev || !editingReady()) return;
  const dialog = typeof document.getElementById === "function" ? document.getElementById("dialog") : null;
  if (dialog && dialog.hidden === false) return;
  const handle = ev.target && ev.target.closest && ev.target.closest(".dr-handle");
  if (!handle) {
    if (ev.key === "Escape") {
      app.ui.dailyRoutineEdit = false;
      app.ui.routineAnnounce = "Done editing.";
      if (typeof app.render === "function") app.render();
    }
    return;
  }
  const step = ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : 0;
  if (!step) return;
  ev.preventDefault();
  const kind = handle.dataset.reorder;
  const id = handle.dataset.id;
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  if (!view) return;
  const itemIds = new Set((view.items || []).map((item) => item.id));
  const ids = kind === "block"
    ? (view.blocks || []).map((block) => block.id)
    : (view.placements || []).filter((row) => row.blockId === handle.dataset.blockId && itemIds.has(row.itemId)).slice().sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((row) => row.id);
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return;
  const order = moveList(ids, from, to);
  const ok = kind === "block"
    ? reorderRoutineBlocks(app.state, order, id)
    : reorderRoutinePlacements(app.state, handle.dataset.blockId, order);
  if (!ok) return;
  if (typeof app.save === "function") app.save();
  const name = kind === "block"
    ? ((view.blocks || []).find((block) => block.id === id) || {}).name
    : ((view.items || []).find((item) => item.id === handle.closest(".dr-row").dataset.itemId) || {}).name;
  app.ui.routineAnnounce = `${name || "Row"} moved to position ${to + 1} of ${ids.length}.`;
  if (typeof app.render === "function") app.render();
  const again = document.querySelector(`.dr-handle[data-reorder="${kind}"][data-id="${id}"]`);
  if (again && typeof again.focus === "function") again.focus();
}

function onContextMenu(ev) {
  const recent = (typeof performance !== "undefined" ? performance.now() : Date.now()) - holdFiredAt < 1200;
  const tile = ev.target && ev.target.closest && ev.target.closest(".dr-page");
  if ((editingReady() && tile) || (recent && tile)) ev.preventDefault();
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
  document.addEventListener("touchmove", (ev) => { if (drag && ev.cancelable) ev.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", onKey);
  document.addEventListener("keydown", onSheetKey);
  document.addEventListener("pointerdown", onArcDown);
  document.addEventListener("pointermove", onArcMove, { passive: false });
  document.addEventListener("pointerup", onArcUp);
  document.addEventListener("pointercancel", onArcCancel);
  document.addEventListener("focusin", onAmountFocus);
  document.addEventListener("focusout", onAmountBlur);
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("selectstart", (ev) => {
    if (!hold && (typeof performance !== "undefined" ? performance.now() : Date.now()) - holdFiredAt >= 1200) return;
    if (ev.target && ev.target.closest && ev.target.closest("input, textarea, [contenteditable]")) return;
    ev.preventDefault();
  });
}

app.toggleRoutineLayoutEdit = toggleRoutineLayoutEdit;
app.startRoutineRearrange = startRoutineRearrange;
app.promptRoutineRename = promptRoutineRename;
app.openRoutineItemEditor = openRoutineItemEditor;
app.removeRoutineBlock = removeRoutineBlock;
app.removeRoutineItem = removeRoutineItem;
app.copyRoutineBlock = copyRoutineBlock;
app.paintRoutineBlock = paintRoutineBlock;
app.rememberRoutineItemFields = rememberRoutineItemFields;
app.commitRoutineItemSheet = commitRoutineItemSheet;
app.routineItemSheetHTML = routineItemSheetHTML;
app.refreshRoutineItemSheet = refreshRoutineItemSheet;
app.stepRoutineItemAmount = stepRoutineItemAmount;
app.clearRoutineItemAmount = clearRoutineItemAmount;
app.clearRoutineItemTime = clearRoutineItemTime;
app.noteRoutineItemField = noteRoutineItemField;
