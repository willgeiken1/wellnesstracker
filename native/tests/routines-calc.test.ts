import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatCalcNumber, reconstitutionNoteText, reconstitutionResult, reconstitutionResultText } from '../src/features/routines/model/calculator';

/* Synthetic numbers only. Ported from the web app's tests/daily-routines-calc.test.mjs.
   The calculator repeats numbers the user typed. U-100 units are that volume times 100.
   It does not suggest an amount, and it does not call the network. */

const ADVICE = /recommended dose|should take|prescrib|typical dose|suggested dose|you should/i;
const shown = (result: Parameters<typeof reconstitutionResultText>[0]) => {
  const text = reconstitutionResultText(result);
  return [text.detail, ...text.lines, text.note].join('\n');
};

describe('reconstitution calculator', () => {
  test('U-100 units are the entered milliliters times 100', () => {
    const drawn = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: 'mg', doseUnit: 'mcg' });
    expect(drawn.ok).toBe(true);
    expect(Math.abs((drawn.volumeMl as number) - 0.1) < 1e-9).toBe(true);
    expect(drawn.syringeUnits).toBe(10);
    expect(drawn.lines).toContain('Volume to draw: 0.25 mg ÷ 2.5 mg/mL = 0.1 mL');
    expect(drawn.lines).toContain('U-100 units for what you entered: 0.1 mL × 100 = 10');
    expect(drawn.note).toMatch(/what you entered/i);
    expect(drawn.note).toMatch(/not a recommendation/);
    expect(reconstitutionNoteText(drawn)).toBe('0.1 mL · 10 U-100 units. What you entered. Not a recommendation.');
    const text = shown(drawn);
    expect(text).toMatch(/U-100 units for what you entered: 0\.1 mL × 100 = 10/);
    expect(text).toMatch(/what you entered/i);
    expect(text).toMatch(/not a recommendation/);
    expect(text).not.toMatch(ADVICE);
    expect(reconstitutionResultText(drawn).ready).toBe(true);

    const quarter = reconstitutionResult({ vialAmount: 1, waterMl: 1, doseAmount: 0.25, vialUnit: 'mg', doseUnit: 'mg' });
    expect(quarter.syringeUnits).toBe(25);
    expect(quarter.lines).toContain('U-100 units for what you entered: 0.25 mL × 100 = 25');

    const same = reconstitutionResult({ vialAmount: 13.25, waterMl: 2.5, doseAmount: 0.25, vialUnit: 'mg', doseUnit: 'mg' });
    expect(formatCalcNumber(same.volumeMl)).toBe('0.04717');
    expect(same.syringeUnits).toBe(4.717);
    expect(same.lines).toContain('U-100 units for what you entered: 0.04717 mL × 100 = 4.717');

    const iu = reconstitutionResult({ vialAmount: 10, waterMl: 2, doseAmount: 2.5, vialUnit: 'IU', doseUnit: 'IU' });
    expect(iu.volumeMl).toBe(0.5);
    expect(iu.syringeUnits).toBe(50);

    const mismatch = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: 'IU', doseUnit: 'mcg' });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.syringeUnits).toBeUndefined();
    expect(reconstitutionNoteText(mismatch)).toBe('');
    expect(mismatch.detail).not.toMatch(/U-100|Volume to draw/);
    expect(mismatch.detail).toBe('The vial unit and the desired amount unit are not the same, so there is no volume from what you entered.');
    expect(shown(mismatch)).toMatch(/what you entered/i);
    expect(shown(mismatch)).not.toMatch(/U-100|Volume to draw/);
    expect(reconstitutionResultText(mismatch).ready).toBe(false);

    const empty = reconstitutionResult({ vialAmount: null, waterMl: 2, doseAmount: 1, vialUnit: 'mg', doseUnit: 'mg' });
    expect(empty.ok).toBe(false);
    expect(empty.syringeUnits).toBeUndefined();
    expect(empty.detail).toBe('Enter a vial amount, a water volume, and a desired amount.');
    expect(empty.note).toBe('This is the arithmetic of what you entered. It is not a recommendation.');
    const zeroWater = reconstitutionResult({ vialAmount: 5, waterMl: 0, doseAmount: 1, vialUnit: 'mg', doseUnit: 'mg' });
    expect(zeroWater.ok).toBe(false);
  });

  test('the arithmetic lines repeat what was entered, in order', () => {
    const drawn = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: 'mg', doseUnit: 'mcg' });
    expect(drawn.lines).toEqual([
      'Vial: 5 mg',
      'Water: 2 mL',
      'Desired amount: 250 mcg',
      '250 mcg = 0.25 mg. 1 mg = 1000 mcg.',
      'Concentration: 5 mg ÷ 2 mL = 2.5 mg/mL',
      'Volume to draw: 0.25 mg ÷ 2.5 mg/mL = 0.1 mL',
      'U-100 units for what you entered: 0.1 mL × 100 = 10',
    ]);
    expect(reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: 'grams', doseUnit: 'mcg' }).ok).toBe(false);
    expect(reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: -1, vialUnit: 'mg', doseUnit: 'mg' }).ok).toBe(false);
    expect(reconstitutionNoteText(reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 0, vialUnit: 'mg', doseUnit: 'mg' }))).toBe('');
    expect(reconstitutionNoteText(null)).toBe('');
    expect(reconstitutionResultText(null).note).toBe('This is the arithmetic of what you entered. It is not a recommendation.');
    expect(formatCalcNumber(NaN)).toBe('');
    expect(formatCalcNumber(-0.5)).toBe('-0.5');
    expect(formatCalcNumber(0.0000001)).toBe('0');
  });

  test('no routine logic calls the network, analytics or crash reporting, and none suggests an amount', () => {
    const dir = join(__dirname, '../src/features/routines');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(name => /\.tsx?$/.test(name));
    expect(files).toContain(join('model', 'calculator.ts'));
    for (const file of files) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/sendBeacon/);
      expect(src).not.toMatch(/posthog/i);
      expect(src).not.toMatch(/Sentry/);
      expect(src).not.toMatch(/captureMessage|captureException/);
      expect(src).not.toMatch(/console\./);
      expect(src).not.toMatch(/from ['"][^'"]*(telemetry|analytics|food-ai|workout-ai|\/ai\/)/);
      expect(src).not.toMatch(ADVICE);
    }
  });
});
