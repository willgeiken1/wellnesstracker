/* Reconstitution arithmetic. The inputs are numbers the user typed.
   The result repeats those numbers. It does not recommend an amount.
   This module does not save, and it does not call the network.
   Ported word for word from the web app's pages/reconstitution.js. Every
   string a person reads is the same string. */

const NOTE = "This is the arithmetic of what you entered. It is not a recommendation.";
const NEED = "Enter a vial amount, a water volume, and a desired amount.";
export const CALC_UNITS = ["mcg", "mg", "IU", "units"] as const;
export type CalcUnit = (typeof CALC_UNITS)[number];
const UNITS = new Set<string>(CALC_UNITS);

export interface ReconstitutionInput {
  vialAmount: number | null | undefined;
  waterMl: number | null | undefined;
  doseAmount: number | null | undefined;
  vialUnit: string | null | undefined;
  doseUnit: string | null | undefined;
}

export interface ReconstitutionResult {
  ok: boolean;
  note: string;
  detail: string;
  lines: string[];
  concentration?: number;
  volumeMl?: number;
  doseInVial?: number;
  syringeUnits?: number;
}

export function formatCalcNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(value) * 1e6) / 1e6;
  const text = rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return sign + (text === "" ? "0" : text);
}

function massToMcg(amount: number, unit: string): number | null {
  switch (unit) {
    case "mcg":
      return amount;
    case "mg":
      return amount * 1000;
    case "IU":
    case "units":
      return null;
    default: {
      const unexpected = unit;
      void unexpected;
      return null;
    }
  }
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function reconstitutionResult({ vialAmount, waterMl, doseAmount, vialUnit, doseUnit }: ReconstitutionInput): ReconstitutionResult {
  if (typeof vialUnit !== "string" || typeof doseUnit !== "string" || !UNITS.has(vialUnit) || !UNITS.has(doseUnit) || !positive(vialAmount) || !positive(waterMl) || !amount(doseAmount)) {
    return { ok: false, note: NOTE, detail: NEED, lines: [] };
  }
  const vialMcg = massToMcg(vialAmount, vialUnit);
  const doseMcg = massToMcg(doseAmount, doseUnit);
  const same = vialUnit === doseUnit;
  if (!same && (vialMcg == null || doseMcg == null)) {
    return {
      ok: false,
      note: NOTE,
      detail: "The vial unit and the desired amount unit are not the same, so there is no volume from what you entered.",
      lines: [],
    };
  }
  const perVialUnit = same ? 1 : (vialMcg as number) / vialAmount;
  const doseInVial = same ? doseAmount : (doseMcg as number) / perVialUnit;
  const concentration = vialAmount / waterMl;
  const volumeMl = doseInVial / concentration;
  const vialText = formatCalcNumber(vialAmount);
  const waterText = formatCalcNumber(waterMl);
  const doseText = formatCalcNumber(doseAmount);
  const doseInVialText = formatCalcNumber(doseInVial);
  const concText = formatCalcNumber(concentration);
  const volumeText = formatCalcNumber(volumeMl);
  const unitsText = formatCalcNumber(Number(volumeText) * 100);
  const lines = [
    `Vial: ${vialText} ${vialUnit}`,
    `Water: ${waterText} mL`,
    `Desired amount: ${doseText} ${doseUnit}`,
  ];
  if (!same) lines.push(`${doseText} ${doseUnit} = ${doseInVialText} ${vialUnit}. 1 mg = 1000 mcg.`);
  lines.push(`Concentration: ${vialText} ${vialUnit} ÷ ${waterText} mL = ${concText} ${vialUnit}/mL`);
  lines.push(`Volume to draw: ${doseInVialText} ${vialUnit} ÷ ${concText} ${vialUnit}/mL = ${volumeText} mL`);
  lines.push(`U-100 units for what you entered: ${volumeText} mL × 100 = ${unitsText}`);
  return {
    ok: true,
    note: NOTE,
    detail: "",
    lines,
    concentration,
    volumeMl,
    doseInVial,
    syringeUnits: Number(unitsText),
  };
}

/* The row note repeats the volume and the U-100 units. It is not a log. */
export function reconstitutionNoteText(result: ReconstitutionResult | null | undefined): string {
  if (!result || result.ok !== true) return "";
  const volume = formatCalcNumber(result.volumeMl);
  const units = formatCalcNumber(result.syringeUnits);
  if (!volume || volume === "0" || units === "" || units === "0") return "";
  return `${volume} mL · ${units} U-100 units. What you entered. Not a recommendation.`;
}

/* What the result card shows, in order: the detail line when there is one,
   the arithmetic lines, then the note. The web app builds the same three
   parts as HTML; a native screen draws them as text. The note is always
   there, with or without a result. */
export function reconstitutionResultText(result: ReconstitutionResult | null | undefined): { ready: boolean; detail: string; lines: string[]; note: string } {
  const ready = !!(result && result.ok);
  const lines = result && Array.isArray(result.lines) ? result.lines : [];
  return { ready, detail: result && result.detail ? result.detail : "", lines: lines.slice(), note: result && result.note ? result.note : NOTE };
}
