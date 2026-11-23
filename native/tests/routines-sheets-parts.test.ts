import fs from 'node:fs';
import path from 'node:path';
import { contrast } from '../scripts/ins01-palette-contrast';
import { createTheme, palettes } from '../src/design/tokens';
import { routinesSheets, rs } from '../src/i18n/en';
import {
  amountDraftText, amountEditText, amountFieldText, amountMeterMax, amountSteps, doseReadback, doseSet, parseSheetAmount, prettyAmount, stepAllowed, stepAmount,
} from '../src/features/routines-ui/add-item-amounts';
import {
  ARC, WINDOW_ARC, arcMinutesAt, arcPoint, arcReadout, arcSegments, arcStepMinutes, clockMinutes, dragWindow, handleAt, nearArc, sidewaysDrag, stepClock, typedClock, windowOnArc,
} from '../src/features/routines-ui/add-item-arc';
import { converterView, openConverterDraft, scaleFraction } from '../src/features/routines-ui/converter';
import { itemDraftProblem, openItemDraft, shiftDay, stepMixedDay, tapItemRoutine, tapItemType, type ItemSheetDraft } from '../src/features/routines-ui/add-item-draft';
import { slotToken, veil } from '../src/features/routines-ui/add-item-tones';

/* The plain rules under the Routines sheets. Amounts here are typed by the test, as a user types their own. */

describe('typed amounts and steps', () => {
  test('an amount is read as typed, with quarters, and nothing else is guessed', () => {
    expect(parseSheetAmount('2.5')).toBe(2.5);
    expect(parseSheetAmount('2½')).toBe(2.5);
    expect(parseSheetAmount('¼')).toBe(0.25);
    expect(parseSheetAmount('0,25')).toBe(0.25);
    for (const bad of ['', ' ', '-1', '1,000', 'two', null, undefined]) expect(parseSheetAmount(bad)).toBeNull();
    expect(prettyAmount(0.75)).toBe('¾');
    expect(prettyAmount(2.5)).toBe('2½');
    expect(prettyAmount(0.3)).toBe('0.3');
    expect(amountFieldText('2.50')).toBe('2½');
    expect(amountEditText('2½')).toBe('2.5');
    expect(amountDraftText('two')).toBe('two');
    expect(amountDraftText(' 12 ')).toBe('12');
  });

  test('steps grow with the amount, start from nothing, and never go below zero', () => {
    expect(amountSteps(null)).toEqual([0.25, 0.5, 1]);
    expect(amountSteps(10)).toEqual([1, 5, 10]);
    expect(amountSteps(250)).toEqual([10, 50, 100]);
    expect(stepAmount(null, 0.25)).toBe(0.25);
    expect(stepAllowed(null, -0.25)).toBe(false);
    expect(stepAllowed(0.25, -0.5)).toBe(false);
    expect(stepAmount(0.25, -0.25)).toBeNull();
    expect(stepAllowed(5, 10)).toBe(false);
    expect(stepAmount(0.1, 0.25)).toBe(0.35);
    expect(amountMeterMax(null)).toBe(2);
    expect(amountMeterMax(3)).toBe(4);
    expect(amountMeterMax(12)).toBeNull();
  });

  test('the read-back only repeats the two fields', () => {
    expect(doseReadback(null, '')).toBe('Type an amount or use the steps.');
    expect(doseReadback(0, 'mg')).toBe('Type an amount or use the steps.');
    expect(doseReadback(0.5, '')).toBe('Pick a unit.');
    expect(doseReadback(0.5, 'mg')).toBe('Logs ½ mg each time.');
    expect(doseSet(0, 'mg')).toBe(false);
  });
});

describe('the sun path', () => {
  test('a place on the path maps back to its time, on both pickers', () => {
    for (const shape of [ARC, WINDOW_ARC]) {
      for (const minutes of [5 * 60, 7 * 60 + 30, 12 * 60, 18 * 60 + 45, 23 * 60]) {
        const [x, y] = arcPoint(minutes, shape);
        expect(arcMinutesAt(x, shape, 5)).toBe(minutes);
        expect(y).toBeLessThanOrEqual(shape.hy + 1e-6);
        expect(nearArc(x, y, shape)).toBe(true);
      }
      expect(arcMinutesAt(-50, shape)).toBe(shape.startMin);
      expect(arcMinutesAt(9999, shape)).toBe(shape.endMin);
      expect(nearArc(shape.cx, shape.hy, shape, 24)).toBe(false);
    }
    expect(arcMinutesAt(Number.NaN)).toBeNull();
  });

  test('only a sideways drag on a handle moves a time, so the sheet still scrolls and pulls down', () => {
    expect(sidewaysDrag(8, 2)).toBe(true);
    expect(sidewaysDrag(2, 30)).toBe(false);
    expect(sidewaysDrag(12, 14)).toBe(false);
    const at = arcPoint(9 * 60)[0];
    expect(handleAt(at + 10, [9 * 60])).toBe(0);
    expect(handleAt(at + 60, [9 * 60])).toBe(-1);
    expect(handleAt(at, [null])).toBe(-1);
    const start = arcPoint(12 * 60, WINDOW_ARC)[0], end = arcPoint(14 * 60, WINDOW_ARC)[0];
    expect(handleAt(start - 5, [12 * 60, 14 * 60], WINDOW_ARC)).toBe(0);
    expect(handleAt(end + 5, [12 * 60, 14 * 60], WINDOW_ARC)).toBe(1);
  });

  test('times step on the clock and typed times are read forgivingly', () => {
    expect(arcStepMinutes(7 * 60, 5)).toBe(7 * 60 + 5);
    expect(arcStepMinutes(23 * 60, 5)).toBe(23 * 60);
    expect(arcStepMinutes(2 * 60, -5)).toBe(115);
    expect(stepClock(23 * 60 + 50, 15)).toBe(0);
    expect(stepClock(0, -15)).toBe(23 * 60 + 45);
    expect(['7', '730', '0730', '7:30', '19.30', '24:00', 'soon', ''].map(typedClock)).toEqual(['07:00', '07:30', '07:30', '07:30', '19:30', null, null, null]);
    expect(clockMinutes('07:30')).toBe(450);
    expect(clockMinutes('7.30')).toBeNull();
  });

  test('a routine window keeps a quarter of an hour between its ends and shows on the path', () => {
    expect(dragWindow({ startMin: 720, endMin: 840 }, 0, 900)).toEqual({ startMin: 825, endMin: 840 });
    expect(dragWindow({ startMin: 720, endMin: 840 }, 1, 600)).toEqual({ startMin: 720, endMin: 735 });
    expect(arcSegments({ startMin: 22 * 60, endMin: 30 * 60 })).toEqual([[5 * 60, 6 * 60], [22 * 60, 23 * 60]]);
    expect(arcSegments(null)).toEqual([]);
  });

  test('a window with an end off the path is never rewritten by a drag', () => {
    // 04:00 to 09:00 starts before the path, and 23:30 to 01:30 runs past midnight and off both ends.
    const early = { startMin: 4 * 60, endMin: 9 * 60 }, overnight = { startMin: 23 * 60 + 30, endMin: 25 * 60 + 30 }, late = { startMin: 20 * 60, endMin: 23 * 60 + 30 };
    for (const window of [early, overnight, late]) {
      expect(windowOnArc(window)).toBe(false);
      for (const end of [0, 1] as const) for (const minutes of [5 * 60, 12 * 60, 23 * 60]) expect(dragWindow(window, end, minutes)).toBe(window);
    }
    // A window that reaches exactly to the ends of the path is on it, and still drags.
    const whole = { startMin: 5 * 60, endMin: 23 * 60 };
    expect(windowOnArc(whole)).toBe(true);
    expect(dragWindow(whole, 0, 6 * 60)).toEqual({ startMin: 6 * 60, endMin: 23 * 60 });
    expect(dragWindow({ startMin: 22 * 60 + 50, endMin: 23 * 60 }, 0, 23 * 60)).toEqual({ startMin: 22 * 60 + 50 - 5, endMin: 23 * 60 });
  });

  test('the words over the path say where the item sits', () => {
    const morning = { id: 'a', name: 'Morning', window: { startMin: 300, endMin: 660 } };
    const night = { id: 'b', name: 'Night', window: null };
    expect(arcReadout({ timeMin: 450, routines: [morning, night], picked: [] })).toEqual({ big: '07:30', sub: 'in Morning · tap to move' });
    expect(arcReadout({ timeMin: 900, routines: [morning], picked: [] }).sub).toBe('your own time · tap to move');
    expect(arcReadout({ timeMin: null, routines: [morning], picked: [morning] })).toEqual({ big: 'Morning', sub: 'at the routine\'s start, 05:00' });
    expect(arcReadout({ timeMin: null, routines: [night], picked: [night] }).sub).toBe('no start time · tap for a time');
    expect(arcReadout({ timeMin: null, routines: [morning, night], picked: [morning, night] }).big).toBe('2 routines');
    expect(arcReadout({ timeMin: null, routines: [], picked: [] })).toEqual({ big: 'No routine', sub: 'tap for a time' });
  });
});

describe('the concentration converter', () => {
  const never = /desired|to draw|reconstitut|calculator|syringe|inject|recommended dose|suggested/i;

  test('it opens empty unless an amount was typed on the dose card', () => {
    expect(openConverterDraft()).toEqual({ vial: '', water: '', dose: '', vialUnit: 'mg', doseUnit: 'mcg' });
    expect(openConverterDraft('250', 'mcg')).toMatchObject({ vial: '', water: '', dose: '250', doseUnit: 'mcg' });
    // A unit the converter does not take carries nothing.
    expect(openConverterDraft('1', 'mL')).toMatchObject({ dose: '', doseUnit: 'mcg' });
    const empty = converterView(openConverterDraft());
    expect(empty).toMatchObject({ ready: false, volume: '', units: '', scale: 0, over: false, itemNote: '', lines: [] });
    expect(empty.detail).toBe('Enter a vial amount, a water volume, and an amount to convert.');
  });

  test('every line it shows is the arithmetic of what was entered, under the converter\'s own labels', () => {
    const drafts = [
      { vial: '5', water: '2', dose: '250', vialUnit: 'mg', doseUnit: 'mcg' },
      { vial: '10', water: '1', dose: '2', vialUnit: 'mg', doseUnit: 'mg' },
      { vial: '5000', water: '5', dose: '500', vialUnit: 'IU', doseUnit: 'IU' },
      { vial: '5', water: '2', dose: '250', vialUnit: 'IU', doseUnit: 'mcg' },
      { vial: '', water: '2', dose: '250', vialUnit: 'mg', doseUnit: 'mcg' },
    ];
    for (const draft of drafts) {
      const view = converterView(draft);
      const shown = [view.detail, view.note, ...view.lines].join('\n');
      expect(shown).not.toMatch(never);
      if (view.ready) {
        expect(view.lines).toEqual(expect.arrayContaining([expect.stringMatching(/^Amount entered: /), expect.stringMatching(/^Volume: /)]));
        expect(view.note).toBe('This is the arithmetic of what you entered. It is not a recommendation.');
        expect(Number(view.units)).toBeCloseTo(Number(view.volume) * 100, 6);
      } else {
        expect(view.volume).toBe('');
        expect(view.itemNote).toBe('');
      }
    }
    expect(converterView(drafts[0])).toMatchObject({ volume: '0.1', units: '10', scale: 0.1, itemNote: '0.1 mL · 10 U-100 units. What you entered. Not a recommendation.' });
    expect(converterView(drafts[3]).detail).toBe('The vial unit and the amount unit are not the same, so there is no volume from what you entered.');
  });

  test('the scale is a plain 0 to 100 and stops at 100', () => {
    expect([0, -4, 25, 100, 180, Number.NaN].map(scaleFraction)).toEqual([0, 0, 0.25, 1, 1, 0]);
    expect(converterView({ vial: '1', water: '2', dose: '1', vialUnit: 'mg', doseUnit: 'mg' })).toMatchObject({ units: '200', over: true, scale: 1 });
  });
});

describe('the item draft', () => {
  const base: ItemSheetDraft = { itemId: null, name: 'Stretch', kind: 'check', amount: '', unit: '', type: '', time: '', onHand: '', mixedOn: '', blockIds: ['a'] };

  test('a new item starts with nothing chosen for it', () => {
    expect(openItemDraft(null)).toEqual({ ...base, name: '', blockIds: [] });
  });

  test('Save names what is missing', () => {
    const today = '2026-11-23';
    expect(itemDraftProblem(base, today)).toBe('');
    expect(itemDraftProblem({ ...base, blockIds: [] }, today)).toBe('Pick a type or a routine.');
    expect(itemDraftProblem({ ...base, name: ' ' }, today)).toBe('Add a name.');
    expect(itemDraftProblem({ ...base, kind: 'dose' }, today)).toBe('Add a name, an amount, and a unit.');
    expect(itemDraftProblem({ ...base, kind: 'dose', amount: '5' }, today)).toBe('Pick a unit.');
    expect(itemDraftProblem({ ...base, kind: 'dose', amount: '0', unit: 'mg' }, today)).toBe('Add a name, an amount, and a unit.');
    expect(itemDraftProblem({ ...base, kind: 'dose', amount: '5', unit: 'mg' }, today)).toBe('');
    expect(itemDraftProblem({ ...base, kind: 'dose', amount: '5', unit: 'mg', mixedOn: '2026-11-24' }, today)).not.toBe('');
  });

  test('an item keeps a type or a routine, and a new peptide is logged by amount', () => {
    expect(tapItemRoutine(base, 'a').refused).toBe('keepRoutine');
    expect(tapItemRoutine({ ...base, type: 'other' }, 'a').draft.blockIds).toEqual([]);
    expect(tapItemType({ ...base, type: 'other', blockIds: [] }, 'other').refused).toBe('keepType');
    expect(tapItemType(base, 'peptide').draft).toMatchObject({ type: 'peptide', kind: 'dose' });
    expect(tapItemType({ ...base, itemId: 'saved' }, 'peptide').draft.kind).toBe('check');
    expect(tapItemType({ ...base, type: 'peptide' }, 'peptide').draft.type).toBe('');
  });

  test('Mixed on steps by a day and never past today', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(stepMixedDay('', -1, '2026-11-23')).toBe('2026-11-22');
    expect(stepMixedDay('2026-11-22', 1, '2026-11-23')).toBe('2026-11-23');
    expect(stepMixedDay('2026-11-23', 1, '2026-11-23')).toBe('2026-11-23');
  });
});

describe('colour and contrast in every palette and both modes', () => {
  test.each(palettes.flatMap((palette) => (['light', 'dark'] as const).map((mode) => [palette, mode] as const)))('%s %s', (palette, mode) => {
    const colors = createTheme(mode, palette);
    const onAccent = colors['on-accent'];
    // Words on the dose card, the picked Log as card and the main button, and on the card's inset panel.
    expect(contrast(onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(onAccent, veil(colors.accent, onAccent))).toBeGreaterThanOrEqual(contrast(onAccent, colors.accent));
    // The icon on a picked type, routine strokes on the path's well, and routine dots: graphics, 3 to 1.
    expect(contrast(onAccent, colors.sleep)).toBeGreaterThanOrEqual(3);
    for (const slot of ['citrus', 'lavender', 'pink']) {
      for (const under of ['surface-2', 'bg', 'surface'] as const) expect(contrast(colors[slotToken(slot)], colors[under])).toBeGreaterThanOrEqual(3);
    }
    // Every word: labels, help, errors, the accent links, a picked day and the toast.
    for (const under of ['bg', 'surface', 'surface-2'] as const) {
      expect(contrast(colors.text, colors[under])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors['text-muted'], colors[under])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.danger, colors[under])).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(colors.accent, colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.bg, colors.text)).toBeGreaterThanOrEqual(4.5);
  });

  test('an unknown colour id falls back to the accent', () => {
    expect(slotToken('teal')).toBe('accent');
    expect(slotToken(undefined)).toBe('accent');
  });
});

describe('copy and code guards for the sheets', () => {
  const dir = path.resolve(__dirname, '../src/features/routines-ui');
  const routes = path.resolve(__dirname, '../src/app/routines');
  /* The forms' own files. The rest of the folder is the tab's, and has its own tests. */
  const sources = [
    ...fs.readdirSync(dir).filter((name) => /^(?:add-item|converter|new-routine|edit-routines|setup)[\w-]*\.tsx?$/.test(name)).map((name) => path.join(dir, name)),
    ...['add-item.tsx', 'new.tsx', 'setup.tsx', 'edit/index.tsx', 'edit/[id].tsx'].map((name) => path.join(routes, name)),
  ];
  const strings = Object.entries(routinesSheets);

  test('the labels and safety lines are the approved ones, word for word', () => {
    expect(rs('converter')).toBe('Concentration converter');
    expect(rs('amountToConvert')).toBe('Amount to convert');
    expect(rs('volume')).toBe('Volume');
    expect(rs('doctor')).toBe('Check with your doctor or pharmacist in addition to using this app, and before making any medical decision.');
    expect(rs('doseNote')).toBe('The amount and unit are what you type. Nothing here suggests a dose.');
    expect(rs('evidence')).toBe('Custom item. No evidence is attached.');
    expect(rs('saveNote')).toBe('Save as note on this item');
    expect(rs('saveNoteHelp')).toBe('Saves the volume and U-100 units on this item. It does not log a dose, and it does not suggest an amount.');
    expect(rs('converterIntro')).toContain('The lines below are the arithmetic of what you entered, including U-100 units (mL × 100). What you type stays on this screen.');
    expect(rs('errRoutine')).toBe('Add a name and both times.');
    expect(rs('errDays')).toBe('A routine runs at least one day.');
    expect(rs('setupIntro')).toBe('Your answers decide what this page starts with. You can add anything else later in Routines settings.');
    expect(rs('setupStep', { step: 2, count: 6 })).toBe('2 of 6');
  });

  test('every string is sentence case, with no example amount and no old calculator wording', () => {
    for (const [key, value] of strings) {
      const words = value.replace(/\{[a-z]+\}/g, '').replace(/U-100|mL/g, '');
      expect([key, /\b[A-Z]{2,}\b/.test(words)]).toEqual([key, false]);
      // Sentence case: no word after the first starts with a capital, apart from names the app owns.
      const tail = words.replace(/^[^a-zA-Z]*[A-Za-z]+/, '').replace(/[.?!]\s+[A-Z][a-z]*/g, '').replace(/\b(?:Routines|Edit routines|Skin care|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, '');
      expect([key, /\b[A-Z][a-z]+/.test(tail)]).toEqual([key, false]);
      expect([key, /\d/.test(value.replace(/U-100|× 100|\b100 units\b|from 0 to 100|15 minutes/g, ''))]).toEqual([key, false]);
      expect([key, /reconstitut|calculator|desired|to draw|syringe/i.test(value)]).toEqual([key, false]);
    }
  });

  test('the sheets never log, report or send, and reach no telemetry, AI, sync or server code', () => {
    expect(sources.length).toBe(24);
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      expect([file, /\bconsole\s*\.|\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(|\b(?:Sentry|PostHog|posthog)\b|captureException|captureMessage/.test(text)]).toEqual([file, false]);
      for (const match of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
        expect([file, match[1], /telemetry|analytics|sentry|posthog|\/ai\/|\/ai-|\/sync\/|\/server\//i.test(match[1])]).toEqual([file, match[1], false]);
      }
    }
  });

  test('labels keep to the style guard: no capitals transform, no letter spacing, nothing under 13 points', () => {
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      expect([file, /textTransform|letterSpacing|toUpperCase\(/.test(text)]).toEqual([file, false]);
      for (const match of text.matchAll(/fontSize[=:]\s*\{?\s*(\d+(?:\.\d+)?)/g)) expect([file, Number(match[1]) >= 13]).toEqual([file, true]);
    }
  });

  test('no amount field carries a placeholder, and no sheet offers a library', () => {
    const card = fs.readFileSync(path.join(dir, 'add-item-amount-card.tsx'), 'utf8');
    expect(card).not.toMatch(/placeholder\w*\s*[=:]/);
    for (const file of sources) expect([file, /library|catalog/i.test(fs.readFileSync(file, 'utf8'))]).toEqual([file, false]);
  });
});
