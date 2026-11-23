/* The concentration converter's words. The arithmetic is the routines
   calculator, unchanged. This file only renames what a person reads, so the
   screen says it converts an amount the user entered and never that it
   picks one (design spec section 4, App Review 1.4.2):

     "Desired amount: x"  ->  "Amount entered: x"
     "Volume to draw: …"  ->  "Volume: …"
     "… and a desired amount."            ->  "… and an amount to convert."
     "… the desired amount unit are not"  ->  "… the amount unit are not"

   The note, the vial, water, concentration and U-100 lines are kept word for word. */

import { rs } from '@/i18n/en';
import {
  CALC_UNITS, formatCalcNumber, reconstitutionNoteText, reconstitutionResult, reconstitutionResultText,
  type ReconstitutionResult,
} from '@/features/routines/model/calculator';
import { parseSheetAmount } from './add-item-amounts';

export { CALC_UNITS };

export interface ConverterDraft { vial: string; water: string; dose: string; vialUnit: string; doseUnit: string }

export interface ConverterView {
  ready: boolean;
  /** Why there is no result yet. Empty when there is one. */
  detail: string;
  lines: string[];
  note: string;
  /** Digits for the two large readouts. Empty until there is a result: the screen shows a dash, never an example. */
  volume: string;
  units: string;
  /** How far along the plain 0 to 100 scale the units sit, from 0 to 1. */
  scale: number;
  over: boolean;
  /** The note Save writes on a saved dose item. Empty when there is nothing to save. */
  itemNote: string;
  result: ReconstitutionResult;
}

const FROM_NEED = 'Enter a vial amount, a water volume, and a desired amount.';
const FROM_MISMATCH = 'The vial unit and the desired amount unit are not the same, so there is no volume from what you entered.';

function detailText(detail: string): string {
  if (detail === FROM_NEED) return rs('converterNeed');
  if (detail === FROM_MISMATCH) return rs('converterMismatch');
  return detail;
}

function lineText(line: string): string {
  if (line.startsWith('Desired amount: ')) return `${rs('amountEntered')}: ${line.slice('Desired amount: '.length)}`;
  if (line.startsWith('Volume to draw: ')) return `${rs('volume')}: ${line.slice('Volume to draw: '.length)}`;
  return line;
}

export function scaleFraction(units: unknown): number {
  if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0) return 0;
  return Math.min(units, 100) / 100;
}

export function converterView(draft: ConverterDraft): ConverterView {
  const result = reconstitutionResult({
    vialAmount: parseSheetAmount(draft.vial), waterMl: parseSheetAmount(draft.water), doseAmount: parseSheetAmount(draft.dose),
    vialUnit: draft.vialUnit, doseUnit: draft.doseUnit,
  });
  const text = reconstitutionResultText(result);
  const units = text.ready ? result.syringeUnits : undefined;
  return {
    ready: text.ready,
    detail: detailText(text.detail),
    lines: text.lines.map(lineText),
    note: text.note,
    volume: text.ready ? formatCalcNumber(result.volumeMl) : '',
    units: text.ready ? formatCalcNumber(units) : '',
    scale: scaleFraction(units),
    over: typeof units === 'number' && units > 100,
    itemNote: reconstitutionNoteText(result),
    result,
  };
}

/* What the converter opens with. From the dose card, the amount and unit
   typed there carry into Amount to convert when the unit is one it takes.
   Every other field starts empty. */
export function openConverterDraft(amount?: unknown, unit?: unknown): ConverterDraft {
  const typed = parseSheetAmount(amount);
  const carry = typed != null && typeof unit === 'string' && (CALC_UNITS as readonly string[]).includes(unit);
  return { vial: '', water: '', dose: carry ? formatCalcNumber(typed) : '', vialUnit: 'mg', doseUnit: carry ? (unit as string) : 'mcg' };
}
