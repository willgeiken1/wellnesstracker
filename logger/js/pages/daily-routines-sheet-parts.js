import { formatCalcNumber } from "./reconstitution.js";
import { parseRoutineAmount } from "./daily-routines.js";
import { routineClock24 as clock24 } from "../shared/routine-types.js";

/* Pieces the Add item sheet and the reconstitution calculator share: the
   typed amount, the step buttons, the unit switch, the meter, the sun path
   math and the U-100 syringe. Nothing here picks or suggests an amount.
   A step only adds to or takes away from the number already typed. */

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function n1(value) {
  return String(Math.round(value * 10) / 10);
}

/* ---------- Amounts ---------- */

export const AMOUNT_STEP_SETS = Object.freeze([
  Object.freeze([0.25, 0.5, 1]),
  Object.freeze([1, 5, 10]),
  Object.freeze([10, 50, 100]),
]);

const GLYPHS = Object.freeze({ "¼": 0.25, "½": 0.5, "¾": 0.75 });
const GLYPH_BY_QUARTER = Object.freeze(["", "¼", "½", "¾"]);
const PLAIN = /^(?:\d+\.?\d*|\.\d+)$/;

function isAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/* The steps grow with the amount, so one tap moves it a sensible bit. */
export function amountSteps(amount) {
  if (!isAmount(amount) || amount < 10) return AMOUNT_STEP_SETS[0];
  return amount < 100 ? AMOUNT_STEP_SETS[1] : AMOUNT_STEP_SETS[2];
}

/* What the field holds as a number. On top of what a routine amount takes
   (0.25, 0,25, 1/4, ¼), a whole number may carry a quarter glyph: 2½.
   A blank, a negative and a thousands comma (1,000) are refused. */
export function parseSheetAmount(raw) {
  if (typeof raw === "number") return parseRoutineAmount(raw);
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  const mixed = /^(\d*)\s*([¼½¾])$/.exec(text);
  if (mixed) return (mixed[1] ? Number(mixed[1]) : 0) + GLYPHS[mixed[2]];
  return parseRoutineAmount(text);
}

/* A number as plain digits, to 6 decimals. */
export function plainAmount(amount) {
  return isAmount(amount) ? formatCalcNumber(amount) : "";
}

/* Quarters read as ¼ ½ ¾. Anything else keeps its digits. */
export function prettyAmount(amount) {
  if (!isAmount(amount)) return "";
  const quarters = Math.round(amount * 4);
  if (Math.abs(amount * 4 - quarters) < 1e-9 && amount < 1000) {
    const whole = Math.floor(quarters / 4);
    const part = GLYPH_BY_QUARTER[quarters % 4];
    return whole ? `${whole}${part}` : (part || "0");
  }
  return plainAmount(amount);
}

/* The text kept in the draft for a typed field. A number becomes plain
   digits the save can read. Text that is not an amount is kept as typed,
   so the save refuses it instead of guessing. */
export function amountDraftText(raw) {
  if (typeof raw !== "string") return "";
  const text = raw.trim();
  if (!text) return "";
  const amount = parseSheetAmount(text);
  if (amount == null) return text;
  return PLAIN.test(text) && Number(text) === amount ? text : plainAmount(amount);
}

/* What the field shows when it is not being typed in. */
export function amountFieldText(raw) {
  const amount = parseSheetAmount(raw);
  if (amount == null) return typeof raw === "string" ? raw.trim() : "";
  const pretty = prettyAmount(amount);
  if (/[¼½¾]/.test(pretty)) return pretty;
  const text = typeof raw === "string" ? raw.trim() : "";
  return PLAIN.test(text) && Number(text) === amount ? text : pretty;
}

/* What the field shows while it has focus: digits the keypad can edit. */
export function amountEditText(raw) {
  const amount = parseSheetAmount(raw);
  if (amount == null) return typeof raw === "string" ? raw.trim() : "";
  const text = typeof raw === "string" ? raw.trim() : "";
  return PLAIN.test(text) && Number(text) === amount ? text : plainAmount(amount);
}

/* Whether a step button may be pressed. A step comes from the set for the
   amount before the tap, and taking away never goes below zero. */
export function stepAllowed(amount, delta) {
  if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) return false;
  if (!amountSteps(amount).includes(Math.abs(delta))) return false;
  const current = isAmount(amount) ? amount : 0;
  return !(delta < 0 && current + delta < -1e-9);
}

/* The amount after a step, rounded to 6 decimals. Zero or less clears it. */
export function stepAmount(amount, delta) {
  if (!stepAllowed(amount, delta)) return isAmount(amount) ? amount : null;
  const current = isAmount(amount) ? amount : 0;
  const next = Math.round((current + delta) * 1e6) / 1e6;
  return next <= 0 ? null : next;
}

/* Take-away buttons on the left, add buttons on the right. */
export function stepButtonsHTML(amount, action, options) {
  const opts = options || {};
  const field = opts.field ? ` data-field="${esc(opts.field)}"` : "";
  const tab = opts.closed ? ` tabindex="-1"` : "";
  const steps = amountSteps(amount);
  const button = (delta) => {
    const label = prettyAmount(Math.abs(delta));
    const add = delta > 0;
    return `<button type="button" class="dr-step${add ? " dr-step-add" : ""}" data-action="${esc(action)}"${field} data-delta="${delta}" aria-label="${add ? "Add" : "Take away"} ${label}"${stepAllowed(amount, delta) ? "" : " disabled"}${tab}>${add ? "+" : "−"}${label}</button>`;
  };
  return `${steps.slice().reverse().map((step) => button(-step)).join("")}<span aria-hidden="true"></span>${steps.map((step) => button(step)).join("")}`;
}

export function unitButtonsHTML(units, current, action, options) {
  const opts = options || {};
  const tab = opts.closed ? ` tabindex="-1"` : "";
  const key = opts.live || "unit";
  return units.map((unit, index) => `<button type="button" data-live="${esc(key)}-${index}" data-live-mode="attrs" data-action="${esc(action)}" data-unit="${esc(unit)}" aria-pressed="${current === unit ? "true" : "false"}"${tab}>${esc(unit)}</button>`).join("");
}

/* The meter for small amounts: 0 to 2, or 0 to 4 once the amount passes 2.
   It is empty above 4 and whenever the steps are not the quarter set. */
export function amountMeterMax(amount) {
  const value = isAmount(amount) ? amount : 0;
  if (amountSteps(amount) !== AMOUNT_STEP_SETS[0]) return null;
  if (value <= 2) return 2;
  return value <= 4 ? 4 : null;
}

export function amountMeterHTML(amount) {
  const max = amountMeterMax(amount);
  if (max == null) return "";
  const value = isAmount(amount) ? amount : 0;
  const x = (at) => 12 + (at / max) * 276;
  const parts = [
    `<rect x="12" y="8" width="276" height="6" rx="3" class="dr-gauge-trk"/>`,
    `<rect x="12" y="8" width="${n1(x(value) - 12)}" height="6" rx="3" class="dr-gauge-fill"/>`,
  ];
  for (let quarter = 0; quarter <= max * 4; quarter += 1) {
    const at = quarter / 4;
    const whole = quarter % 4 === 0;
    parts.push(`<line x1="${n1(x(at))}" y1="${whole ? 3 : 5}" x2="${n1(x(at))}" y2="8" class="dr-gauge-tk${whole ? " dr-gauge-tk-w" : ""}"/>`);
    if (whole || (max === 2 && quarter % 2 === 0)) parts.push(`<text x="${n1(x(at))}" y="29" text-anchor="middle">${prettyAmount(at)}</text>`);
  }
  if (value > 0) parts.push(`<circle cx="${n1(x(value))}" cy="11" r="6" class="dr-gauge-mk"/>`);
  return parts.join("");
}

/* What each log will record, read back from the two fields. */
export function doseReadback(amount, unit) {
  /* Zero is not an amount to log, and Save refuses it. */
  const set = isAmount(amount) && amount > 0;
  if (set && unit) return `Logs ${prettyAmount(amount)} ${unit} each time.`;
  if (set) return "Pick a unit.";
  return "Type an amount or use the steps.";
}

/* ---------- Sun path ---------- */

export const ARC = Object.freeze({ startMin: 5 * 60, endMin: 23 * 60, cx: 150, rx: 130, hy: 100, ry: 80, width: 300, height: 122 });
const ARC_SPAN = ARC.endMin - ARC.startMin;
const DAY_MIN = 1440;

export function arcPoint(minutes) {
  const angle = Math.PI * (1 - (minutes - ARC.startMin) / ARC_SPAN);
  return [ARC.cx + ARC.rx * Math.cos(angle), ARC.hy - ARC.ry * Math.sin(angle)];
}

/* The time under an x on the 300-wide view, in 5 minute steps. */
export function arcMinutesAt(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  const cos = Math.max(-1, Math.min(1, (x - ARC.cx) / ARC.rx));
  const minutes = ARC.startMin + ARC_SPAN * (1 - Math.acos(cos) / Math.PI);
  return Math.max(ARC.startMin, Math.min(ARC.endMin, Math.round(minutes / 5) * 5));
}

export function arcHolds(minutes) {
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes >= ARC.startMin && minutes <= ARC.endMin;
}

/* The parts of a routine's window that sit on the path. A window that runs
   past midnight can show twice: late at night and early the next morning. */
export function arcSegments(window) {
  if (!window || typeof window.startMin !== "number" || typeof window.endMin !== "number") return [];
  const out = [];
  for (const shift of [0, -DAY_MIN]) {
    const from = Math.max(ARC.startMin, window.startMin + shift);
    const to = Math.min(ARC.endMin, window.endMin + shift);
    if (to > from) out.push([from, to]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function arcSegmentPath(from, to) {
  const [x1, y1] = arcPoint(from);
  const [x2, y2] = arcPoint(to);
  return `M${n1(x1)} ${n1(y1)} A${ARC.rx} ${ARC.ry} 0 0 1 ${n1(x2)} ${n1(y2)}`;
}

export function windowHolds(window, minutes) {
  if (!window || typeof minutes !== "number") return false;
  return (minutes >= window.startMin && minutes <= window.endMin)
    || (minutes + DAY_MIN >= window.startMin && minutes + DAY_MIN <= window.endMin);
}

export function clockMinutes(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(typeof text === "string" ? text.trim() : "");
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
}

/* The two lines over the path. Each routine is { name, window }, in page
   order. `picked` are the ones the item sits in. */
export function arcReadout({ timeMin, routines, picked }) {
  const all = Array.isArray(routines) ? routines : [];
  const mine = Array.isArray(picked) ? picked : [];
  if (typeof timeMin === "number") {
    const inside = all.find((routine) => windowHolds(routine.window, timeMin));
    return { big: clock24(timeMin), sub: inside ? `in ${inside.name} · tap to move` : "your own time · tap to move" };
  }
  if (mine.length === 1) {
    const start = mine[0].window ? mine[0].window.startMin : null;
    return { big: mine[0].name, sub: start != null ? `at the routine's start, ${clock24(start)}` : "no start time · tap for a time" };
  }
  if (mine.length > 1) return { big: `${mine.length} routines`, sub: "each at its own start" };
  return { big: "No routine", sub: all.length ? "pick one below, or tap for a time" : "tap for a time" };
}

/* ---------- U-100 syringe ---------- */

const SYRINGE = Object.freeze({ x0: 34, perUnit: 2.4 });

export function syringeFillWidth(units) {
  if (typeof units !== "number" || !Number.isFinite(units) || units <= 0) return 0;
  return Math.round(Math.min(units, 100) * SYRINGE.perUnit * 10) / 10;
}

export function syringeHTML(units) {
  const x = (at) => n1(SYRINGE.x0 + at * SYRINGE.perUnit);
  const over = typeof units === "number" && units > 100;
  const parts = [
    `<line x1="6" y1="26" x2="34" y2="26" class="dr-syr-ndl"/>`,
    `<rect x="34" y="17" width="${syringeFillWidth(units)}" height="18" rx="2" class="dr-syr-liq" data-live="liq" data-live-mode="attrs"/>`,
    `<rect x="34" y="16" width="240" height="20" rx="4" class="dr-syr-barrel"/>`,
    `<line x1="274" y1="10" x2="274" y2="42" class="dr-syr-ndl"/>`,
  ];
  for (let at = 0; at <= 100; at += 2) {
    const wide = at % 10 === 0;
    parts.push(`<line x1="${x(at)}" y1="${wide ? 16 : 30}" x2="${x(at)}" y2="36" class="dr-syr-tk${wide ? " dr-syr-tk-w" : ""}"/>`);
    if (wide) parts.push(`<text x="${x(at)}" y="50" text-anchor="middle">${at}</text>`);
  }
  parts.push(`<text x="34" y="62" class="dr-syr-cap">U-100 SYRINGE</text>`);
  parts.push(`<g data-live="over">${over ? `<text x="274" y="62" class="dr-syr-cap" text-anchor="end">OVER 100 UNITS</text>` : ""}</g>`);
  return `<svg class="dr-syr" viewBox="0 0 300 64" aria-hidden="true">${parts.join("")}</svg>`;
}

/* ---------- Updating an open sheet in place ----------

   A sheet is drawn from its draft by one HTML function. A tap or a typed
   character draws it again off screen and copies over only the parts that
   changed, so the field being typed in keeps its caret, the pressed button
   keeps focus, and the transitions run. Each part that can change carries
   data-live with a name. data-live-mode="attrs" copies attributes only,
   "value" is an input (left alone while it has focus), and anything else
   has its contents replaced. Returns false when the two do not line up, and
   the caller then draws the whole sheet. */

function copyAttributes(from, to, skip) {
  for (const attr of Array.from(to.attributes)) {
    if (skip && skip(attr.name)) continue;
    if (!from.hasAttribute(attr.name)) to.removeAttribute(attr.name);
  }
  for (const attr of Array.from(from.attributes)) {
    if (skip && skip(attr.name)) continue;
    if (to.getAttribute(attr.name) !== attr.value) to.setAttribute(attr.name, attr.value);
  }
}

const FOCUSABLE = "button, input, select, textarea, [tabindex]";

export function patchLive(root, html) {
  if (!root || typeof document === "undefined" || typeof document.createElement !== "function") return false;
  const template = document.createElement("template");
  template.innerHTML = html;
  const fresh = template.content && typeof template.content.querySelectorAll === "function"
    ? Array.from(template.content.querySelectorAll("[data-live]"))
    : null;
  if (!fresh || !fresh.length || typeof root.querySelectorAll !== "function") return false;
  const live = new Map();
  for (const node of Array.from(root.querySelectorAll("[data-live]"))) live.set(node.getAttribute("data-live"), node);
  if (live.size !== fresh.length) return false;
  for (const next of fresh) if (!live.has(next.getAttribute("data-live"))) return false;
  const active = document.activeElement;
  for (const next of fresh) {
    const current = live.get(next.getAttribute("data-live"));
    if (!current.isConnected) continue;
    const mode = next.getAttribute("data-live-mode");
    if (mode === "attrs") {
      copyAttributes(next, current);
      continue;
    }
    if (mode === "value") {
      copyAttributes(next, current, (name) => name === "value");
      const value = next.getAttribute("value") || "";
      if (current !== active && current.value !== value) current.value = value;
      continue;
    }
    copyAttributes(next, current);
    if (current.innerHTML === next.innerHTML) continue;
    const held = active && current.contains(active) ? Array.from(current.querySelectorAll(FOCUSABLE)).indexOf(active) : -1;
    current.innerHTML = next.innerHTML;
    if (held >= 0) {
      const again = Array.from(current.querySelectorAll(FOCUSABLE));
      const target = again[held] && !again[held].disabled ? again[held] : again.find((el) => !el.disabled);
      if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
    }
  }
  return true;
}
