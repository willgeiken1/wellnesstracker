import { heroLayout } from '../src/features/home/hero/layout';
import { hoursParts, type Part } from '../src/features/home/hero/model';
import { goalRuns, NAME, NUM, textWidth, UNIT, valueRuns } from '../src/features/home/hero/readout-layout';

const widthOf = (r: { text: string; kind: string }) => {
  const t = r.kind === 'name' ? NAME : r.kind === 'u' ? UNIT : NUM;
  return textWidth(r.text, t.size, t.spacing);
};
// Made-up readouts: long sleep, nothing eaten, a four-digit day, a long workout, kilojoules.
const LINES: [string, Part[]][] = [
  ['SLEEP', hoursParts(543)], ['SLEEP', hoursParts(750)], ['FOOD', [['0', 'v', 0], ['kcal', 'u', 2.5]]],
  ['FOOD', [['2,450', 'v', 0], ['kcal', 'u', 2.5]]], ['FOOD', [['10,250', 'v', 0], ['kJ', 'u', 2.5]]], ['TRAINING', [['145', 'v', 0], ['min', 'u', 2.5]]],
];

test('widths come from the font: wider text measures wider, and spacing adds per character', () => {
  expect(textWidth('m', 10)).toBeGreaterThan(textWidth('h', 10));
  expect(textWidth('03', 13)).toBeCloseTo(textWidth('0', 13) + textWidth('3', 13));
  expect(textWidth('SLEEP', 9.5, 1)).toBeCloseTo(textWidth('SLEEP', 9.5) + 5);
});

test.each([320, 375, 390, 402, 430])('every readout at %i pt wide stays on screen, in order, with no run over the next', w => {
  const L = heroLayout(w);
  for (let j = 0; j < 3; j++) for (const [name, parts] of LINES) {
    const runs = valueRuns(name, parts, L.valueAt[j], L.aboveSpan[0], L.aboveSpan[1]);
    expect(runs.map(r => r.text)).toEqual([name, ...parts.map(p => p[0])]);
    for (let i = 1; i < runs.length; i++) expect(runs[i].at).toBeGreaterThanOrEqual(runs[i - 1].at + widthOf(runs[i - 1]) - 0.01);
    const last = runs[runs.length - 1];
    expect(runs[0].at).toBeGreaterThanOrEqual(L.aboveSpan[0] - 0.01);
    expect(last.at + widthOf(last)).toBeLessThanOrEqual(L.aboveSpan[1] + 0.01);
    const goal = goalRuns('of ', '2,800', L.goalAt[j], L.underSpan[0], L.underSpan[1]);
    expect(goal[0].at).toBeGreaterThanOrEqual(L.underSpan[0] - 0.01);
    expect(goal[1].at).toBeGreaterThan(goal[0].at);
    expect(goal[1].at + textWidth('2,800', 10)).toBeLessThanOrEqual(L.underSpan[1] + 0.01);
  }
});

test('a readout that fits is centred on its arc', () => {
  const L = heroLayout(390), runs = valueRuns('SLEEP', hoursParts(543), L.valueAt[1], L.aboveSpan[0], L.aboveSpan[1]);
  const last = runs[runs.length - 1], mid = (runs[0].at + last.at + widthOf(last)) / 2;
  expect(mid).toBeCloseTo(L.valueAt[1], 0);
});
