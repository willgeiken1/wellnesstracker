import { backdropAt, SPREAD, spreadAt } from '../src/features/home/hero/scroll-spread';

test('at rest every layer sits in place', () => {
  for (const l of ['greet', 'apex', 'map'] as const) expect(spreadAt(l, 0)).toBe(0);
  expect(backdropAt(1, 0)).toBe(0);
});

test('scrolling up opens the gaps: each lower layer trails more than the one above it', () => {
  for (const y of [20, 120, 300]) {
    const g = spreadAt('greet', y), a = g + spreadAt('apex', y), m = spreadAt('map', y);
    // The date moves with the page; the greeting trails it, the caption and score trail more (they ride the map).
    expect(g).toBeGreaterThan(0);
    expect(m + spreadAt('apex', y)).toBeGreaterThan(g);
    expect(a).toBeGreaterThan(g);
  }
  // Past the hero nothing more changes.
  expect(spreadAt('map', SPREAD.reach + 500)).toBe(spreadAt('map', SPREAD.reach));
});

test('pulling past the top stretches the same gaps, and Reduce Motion keeps everything still', () => {
  expect(spreadAt('greet', -60)).toBeGreaterThan(0);
  expect(spreadAt('map', -60)).toBeGreaterThan(spreadAt('greet', -60));
  expect(spreadAt('map', 200, true)).toBe(0);
  expect(spreadAt('map', -200, true)).toBe(0);
  expect(spreadAt('map', NaN)).toBe(0);
});

test('the backdrop moves up at about 70 percent of the page, the nearer lines faster, and stays put on a pull', () => {
  expect(backdropAt(1, 100)).toBeCloseTo(-70);
  expect(backdropAt(2, 100)).toBeLessThan(backdropAt(0, 100));
  expect(backdropAt(0, -80)).toBe(0);
  expect(backdropAt(1, 100, true)).toBe(0);
});
