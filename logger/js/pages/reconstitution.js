/* Reconstitution arithmetic. The inputs are numbers the user typed.
   The result repeats those numbers. It does not recommend an amount.
   This module does not save, and it does not call the network. A form
   submit would put the numbers in the URL or a request, so the screen
   is not a form. */

const NOTE = "This is the arithmetic of what you entered. It is not a recommendation.";
const NEED = "Enter a vial amount, a water volume, and a desired amount.";
const UNITS = new Set(["mcg", "mg", "IU", "units"]);

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function formatCalcNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(value) * 1e6) / 1e6;
  const text = rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return sign + (text === "" ? "0" : text);
}

function massToMcg(amount, unit) {
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

function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function amount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function reconstitutionResult({ vialAmount, waterMl, doseAmount, vialUnit, doseUnit }) {
  if (!UNITS.has(vialUnit) || !UNITS.has(doseUnit) || !positive(vialAmount) || !positive(waterMl) || !amount(doseAmount)) {
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
  const perVialUnit = same ? 1 : vialMcg / vialAmount;
  const doseInVial = same ? doseAmount : doseMcg / perVialUnit;
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
export function reconstitutionNoteText(result) {
  if (!result || result.ok !== true) return "";
  const volume = formatCalcNumber(result.volumeMl);
  const units = formatCalcNumber(result.syringeUnits);
  if (!volume || units === "") return "";
  return `${volume} mL · ${units} U-100 units. What you entered. Not a recommendation.`;
}

export function reconstitutionResultHTML(result) {
  const ready = !!(result && result.ok);
  const lines = result && Array.isArray(result.lines) ? result.lines : [];
  const detail = result && result.detail ? `<p>${esc(result.detail)}</p>` : "";
  const body = lines.map((line) => `<p>${esc(line)}</p>`).join("");
  const note = esc(result && result.note ? result.note : NOTE);
  return `<div class="dr-calc-result" data-calc="${ready ? "ready" : "empty"}" aria-live="polite">${detail}${body}<p class="dr-calc-note">${note}</p></div>`;
}
