/* The typed amount, the step buttons and the read-back line that the Add item
   sheet and the concentration converter share. Nothing here picks or suggests
   an amount. A step only adds to or takes away from the number already typed.

   Ported from the web app's pages/daily-routines-sheet-parts.js. */

import { rs } from '@/i18n/en';
import { formatCalcNumber } from '@/features/routines/model/calculator';
import { parseRoutineAmount } from '@/features/routines/model/day';

export const AMOUNT_STEP_SETS: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([0.25, 0.5, 1]),
  Object.freeze([1, 5, 10]),
  Object.freeze([10, 50, 100]),
]);

const GLYPHS: Readonly<Record<string, number>> = Object.freeze({ '¼': 0.25, '½': 0.5, '¾': 0.75 });
const GLYPH_BY_QUARTER = Object.freeze(['', '¼', '½', '¾']);
const PLAIN = /^(?:\d+\.?\d*|\.\d+)$/;

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/* The steps grow with the amount, so one tap moves it a sensible bit. */
export function amountSteps(amount: unknown): readonly number[] {
  if (!isAmount(amount) || amount < 10) return AMOUNT_STEP_SETS[0];
  return amount < 100 ? AMOUNT_STEP_SETS[1] : AMOUNT_STEP_SETS[2];
}

/* What the field holds as a number. On top of what a routine amount takes
   (0.25, 0,25, 1/4, ¼), a whole number may carry a quarter glyph: 2½.
   A blank, a negative and a thousands comma (1,000) are refused. */
export function parseSheetAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return parseRoutineAmount(raw);
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  const mixed = /^(\d*)\s*([¼½¾])$/.exec(text);
  if (mixed) return (mixed[1] ? Number(mixed[1]) : 0) + GLYPHS[mixed[2]];
  return parseRoutineAmount(text);
}

/* A number as plain digits, to 6 decimals. */
export function plainAmount(amount: unknown): string {
  return isAmount(amount) ? formatCalcNumber(amount) : '';
}

/* Quarters read as ¼ ½ ¾. Anything else keeps its digits. */
export function prettyAmount(amount: unknown): string {
  if (!isAmount(amount)) return '';
  const quarters = Math.round(amount * 4);
  if (Math.abs(amount * 4 - quarters) < 1e-9 && amount < 1000) {
    const whole = Math.floor(quarters / 4);
    const part = GLYPH_BY_QUARTER[quarters % 4];
    return whole ? `${whole}${part}` : (part || '0');
  }
  return plainAmount(amount);
}

/* The text kept in the draft for a typed field. A number becomes plain
   digits the save can read. Text that is not an amount is kept as typed,
   so the save refuses it instead of guessing. */
export function amountDraftText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text) return '';
  const amount = parseSheetAmount(text);
  if (amount == null) return text;
  return PLAIN.test(text) && Number(text) === amount ? text : plainAmount(amount);
}

/* What the field shows when it is not being typed in. */
export function amountFieldText(raw: unknown): string {
  const amount = parseSheetAmount(raw);
  if (amount == null) return typeof raw === 'string' ? raw.trim() : '';
  const pretty = prettyAmount(amount);
  if (/[¼½¾]/.test(pretty)) return pretty;
  const text = typeof raw === 'string' ? raw.trim() : '';
  return PLAIN.test(text) && Number(text) === amount ? text : pretty;
}

/* What the field shows while it has focus: digits the keypad can edit. */
export function amountEditText(raw: unknown): string {
  const amount = parseSheetAmount(raw);
  if (amount == null) return typeof raw === 'string' ? raw.trim() : '';
  const text = typeof raw === 'string' ? raw.trim() : '';
  return PLAIN.test(text) && Number(text) === amount ? text : plainAmount(amount);
}

/* Whether a step button may be pressed. A step comes from the set for the
   amount before the tap, and taking away never goes below zero. */
export function stepAllowed(amount: unknown, delta: unknown): boolean {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return false;
  if (!amountSteps(amount).includes(Math.abs(delta))) return false;
  const current = isAmount(amount) ? amount : 0;
  return !(delta < 0 && current + delta < -1e-9);
}

/* The amount after a step, rounded to 6 decimals. Zero or less clears it. */
export function stepAmount(amount: unknown, delta: number): number | null {
  if (!stepAllowed(amount, delta)) return isAmount(amount) ? amount : null;
  const current = isAmount(amount) ? amount : 0;
  const next = Math.round((current + delta) * 1e6) / 1e6;
  return next <= 0 ? null : next;
}

/* The meter for small amounts: 0 to 2, or 0 to 4 once the amount passes 2.
   It is empty above 4 and whenever the steps are not the quarter set. */
export function amountMeterMax(amount: unknown): number | null {
  const value = isAmount(amount) ? amount : 0;
  if (amountSteps(amount) !== AMOUNT_STEP_SETS[0]) return null;
  if (value <= 2) return 2;
  return value <= 4 ? 4 : null;
}

/* Whether the two fields make a dose a log can record. Zero is not an
   amount to log, and Save refuses it. */
export function doseSet(amount: unknown, unit: unknown): boolean {
  return isAmount(amount) && amount > 0 && typeof unit === 'string' && !!unit;
}

/* What each log will record, read back from the two fields. */
export function doseReadback(amount: unknown, unit: unknown): string {
  if (doseSet(amount, unit)) return rs('logsEach', { amount: prettyAmount(amount), unit: String(unit) });
  if (isAmount(amount) && amount > 0) return rs('pickUnit');
  return rs('typeAmount');
}
