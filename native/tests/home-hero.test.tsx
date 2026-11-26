import { heroLayout } from '../src/features/home/hero/layout';
import { ENT, GLINT, HeroMotion, MORPH, SWEEP } from '../src/features/home/hero/motion';
import { heroView, type HeroDayIn, type HeroInput } from '../src/features/home/hero/model';
import { HERO_DEFAULT_GOALS, heroInput, lastWeek, trainingMinutes } from '../src/features/home/hero/data';
import { MAP_DEFAULTS, readMapPrefs } from '../src/features/home/hero/prefs';
import { backdropPaths } from '../src/features/home/hero/backdrop';
import { dayAt, dayGeometry, weekArcY } from '../src/features/home/hero/week';
import { amountOf, ink, kindOf, ratio, ridgeColors, ridgeScene, staticRidgeState, tokens } from '../src/features/home/hero/ridge-scene';
import { stepSprings } from '../src/features/home/hero/ridge';
import { skyTokens } from '../src/features/home/hero/tones';
import { createTheme } from '../src/design/tokens';

const NOW = new Date(2026, 10, 22, 14, 0);
const week = (today: HeroDayIn): HeroDayIn[] =>
  [...Array.from({ length: 6 }, () => ({ trainMin: 45, kcal: 2000, sleepMin: 450 })), today];
const input = (today: HeroDayIn = { trainMin: 24, kcal: 1364, sleepMin: 413 }, extra: Partial<HeroInput> = {}): HeroInput =>
  ({ now: NOW, days: week(today), goals: { kcal: 2200, trainMin: 60, sleepMin: 480 }, energy: 'kcal', hide: false, ...extra });

describe('the hero numbers', () => {
  test('today reads as the mockup: real values on the arcs, goals under the caps, the day score', () => {
    const v = heroView(input());
    expect(v.caption).toBe('Today');
    expect(v.pct).toBe(63);
    expect(v.pillars.map(p => p.arc.map(x => x[0]).join(''))).toEqual(['24min', '1,364kcal', '6h53m']);
    expect(v.pillars.map(p => p.cap)).toEqual(['60', '2,200', '8h']);
    expect(v.pillars[1].status).toBe('836 kcal left · 62%');
    expect(v.week[6].short).toBe('Today');
    expect(v.week[0].short).toBe('Mon');
  });
  test('no sleep recorded is said as such, never drawn as 0 hours', () => {
    const v = heroView(input({ trainMin: 10, kcal: 500, sleepMin: null }));
    expect(v.pillars[2].arc).toEqual([['No data', 'v', 0]]);
    expect(v.pillars[2].status).toBe('No sleep recorded');
    expect(v.pillars[2].missing).toBe(true);
  });
  test('a day with food or sleep but no training is a rest day, left out of the score', () => {
    const v = heroView(input({ trainMin: 0, kcal: 2200, sleepMin: 480 }));
    expect(v.rest).toBe(true);
    expect(v.pct).toBe(100);
    expect(v.allMet).toBe(true);
    expect(v.caption).toBe('Today · Rest day · All goals met');
    expect(v.pillars[0].arc).toEqual([['Rest', 'v', 0]]);
  });
  test('an empty day is a clear sky; a past empty day a quiet one', () => {
    const empty = { trainMin: 0, kcal: null, sleepMin: null };
    expect(heroView(input(empty)).empty).toBe(true);
    expect(heroView(input(empty)).emptyTitle).toBe('A clear sky');
    const days = week(empty); days[3] = empty;
    expect(heroView(input(undefined, { days }), 3).emptyTitle).toBe('A quiet day');
  });
  test('energy shown in kJ and hidden numbers', () => {
    expect(heroView(input(undefined, { energy: 'kJ' })).pillars[1].arc[0][0]).toBe('5,710');
    const hidden = heroView(input(undefined, { hide: true })).pillars[1];
    expect(hidden.arc[0][0]).toBe('•••');
    expect(hidden.status).toBe('Hidden · tap a tile to show');
  });
  test('picking an earlier day names it and says how to come back', () => {
    const v = heroView(input(), 2);
    expect(v.today).toBe(false);
    expect(v.caption).toBe('Wednesday');
    expect(v.weekNote).toBe('Showing Wednesday. Tap Today to come back.');
  });
});

describe('the hero data', () => {
  test('minutes trained come from finished sessions and the running one', () => {
    const days = lastWeek(NOW);
    const store = {
      trainingHistory: () => [{ data: { day: days[6], duration_ms: 20 * 60000 } }, { data: { day: days[5], started_at: 0, finished_at: 30 * 60000 } }],
      active: () => ({ data: { day: days[6], started_at: NOW.getTime() - 4 * 60000 } }),
    } as never;
    expect(trainingMinutes(store, days, NOW).slice(5)).toEqual([30, 24]);
  });
  test('goals fall back to the defaults, and a missing reading stays missing', () => {
    const i = heroInput(null, null, 'kcal', NOW);
    expect(i.goals).toEqual(HERO_DEFAULT_GOALS);
    expect(i.days[6]).toEqual({ trainMin: 0, kcal: null, sleepMin: null });
  });
  test('saved map choices come back clean', () => {
    expect(readMapPrefs(null)).toEqual(MAP_DEFAULTS);
    expect(readMapPrefs({ style: 'ridge', detail: 2, glow: 3, week: false, motion: 'nope' })).toEqual({ ...MAP_DEFAULTS, style: 'ridge', detail: 2, glow: 1, week: false });
  });
});

describe('the Aurora clock', () => {
  const day = { values: [0.4, 0.62, 1] as const, rest: false };
  test('Reduce Motion starts at the final frame with met goals already lit', () => {
    const m = new HeroMotion(393, { reduceMotion: true });
    m.start(day, 0);
    const { f, busy } = m.frame(16);
    expect(busy).toBe(false);
    expect(f.globe).toBe(1);
    expect(f.fill).toEqual([0.4, 0.62, 1]);
    expect(f.lit).toEqual([0, 0, 1]);
  });
  test('the opening build runs, glints the met goal, then rests', () => {
    const m = new HeroMotion(393, { reduceMotion: false });
    m.start(day, 0);
    const early = m.frame(100);
    expect(early.busy).toBe(true);
    expect(early.f.fill[1]).toBe(0);
    expect(early.f.globe).toBeGreaterThan(0);
    m.frame(ENT.flare + 10);
    const glinting = m.frame(ENT.flare + 100);
    expect(glinting.f.ign[2]).toBeGreaterThan(0);
    let t = ENT.flare + 100, last = glinting;
    while (last.busy && t < 10000) { t += 16; last = m.frame(t); }
    expect(t).toBeLessThan(ENT.end + GLINT + 100);
    expect(last.f.fill).toEqual([0.4, 0.62, 1]);
    expect(last.f.lit).toEqual([0, 0, 1]);
  });
  test('calm motion skips the opening build', () => {
    const m = new HeroMotion(393, { reduceMotion: false });
    m.start(day, 0, true);
    expect(m.frame(10).busy).toBe(false);
  });
  test('a new day crosses the curtains over, then settles', () => {
    const m = new HeroMotion(393, { reduceMotion: false }), settle = jest.fn();
    m.onSettle = settle;
    m.start(day, 0, true);
    expect(m.setDay({ values: [1, 1, 1], rest: false }, true, -1, 1000)).toBe(true);
    const mid = m.frame(1000 + MORPH / 2);
    expect(mid.busy).toBe(true);
    expect(mid.f.nextFade).toBe(1);
    expect(mid.f.yaw).toBeLessThan(0);
    m.frame(1000 + MORPH + 1);
    expect(settle).toHaveBeenCalledTimes(1);
    // All three met: a light runs along the limb, then the arcs stay joined.
    let t = 1000 + MORPH + 1, r = m.frame(t);
    while (r.busy && t < 6000) { t += 16; r = m.frame(t); if (r.f.joinGlint > 0) expect(r.f.join).toBeGreaterThan(0); }
    expect(t).toBeLessThan(1000 + MORPH + 320 + SWEEP + GLINT + 100);
    expect(r.f.join).toBe(1e4);
  });
  test('without motion a new day swaps at once', () => {
    const m = new HeroMotion(393, { reduceMotion: true });
    m.start(day, 0);
    expect(m.setDay({ values: [0, 0.5, 0.5], rest: true }, true, 1, 50)).toBe(false);
    const { f } = m.frame(60);
    expect(f.rest).toEqual([1, 0, 0]);
    expect(f.fill).toEqual([0, 0.5, 0.5]);
  });
  test('focusing one pillar dims the other arcs to 38%', () => {
    const m = new HeroMotion(393, { reduceMotion: true });
    m.start(day, 0);
    m.focus(1); // Food is the third arc on screen
    expect(m.frame(10).f.dim).toEqual([0.38, 0.38, 1]);
    m.focus(-1);
    expect(m.frame(20).f.dim).toEqual([1, 1, 1]);
  });
});

describe('where the words sit', () => {
  test('the limb readout follows the camera: apex in the middle, three 46 pt targets in screen order', () => {
    const L = heroLayout(393);
    expect(L.apex.x).toBeCloseTo(196.5, 0);
    expect(L.apex.y).toBeGreaterThan(80);
    expect(L.apex.y).toBeLessThan(96);
    expect(L.targets.map(t => t.pillar)).toEqual([0, 2, 1]);
    L.targets.forEach(t => { expect(t.h).toBe(46); expect(t.w).toBeGreaterThan(44); });
    expect(L.valueAt[0]).toBeLessThan(L.valueAt[1]);
    expect(L.valueAt[1]).toBeLessThan(L.valueAt[2]);
    expect(L.above.startsWith('M')).toBe(true);
  });
  test('the week: a day per seventh, the limb highest in the middle', () => {
    expect(dayAt(0, 393)).toBe(0);
    expect(dayAt(393, 393)).toBe(6);
    expect(dayAt(393 / 2, 393)).toBe(3);
    expect(weekArcY(196.5, 393)).toBeCloseTo(84, 5);
    expect(weekArcY(0, 393)).toBeGreaterThan(weekArcY(100, 393));
    const g = dayGeometry(3, 393);
    expect(g.beams[0]).toBeLessThan(g.cx);
    expect(g.beams[1]).toBeGreaterThan(g.cx);
  });
  test('the backdrop draws today\'s isobars in three depths and the far graticule', () => {
    const b = backdropPaths([0.4, 0.62, 0.86], 9, 393, 852);
    expect(b.layers.flat().length).toBeGreaterThan(3);
    expect(b.grat).toHaveLength(9);
    expect(b.stars).toHaveLength(18);
  });
  test('the sky tokens follow the theme', () => {
    const dark = skyTokens(createTheme('dark') as unknown as Record<string, string>, 'dark');
    const light = skyTokens(createTheme('light') as unknown as Record<string, string>, 'light');
    expect(dark.glow).toBe(1);
    expect(light.glow).toBe(0);
    expect(light.air).toBe(createTheme('light').accent);
  });
});

describe('Ridgeline', () => {
  test('real amounts are read back from each value line and count in the same units', () => {
    expect(kindOf([['1,364', 'v', 0], ['kcal', 'u', 2.5]], false)).toBe('kcal');
    expect(amountOf([['6', 'v', 0], ['h', 'u', 0.5], ['53', 'v', 3], ['m', 'u', 0.5]], false)).toBe(413);
    expect(kindOf([['•••', 'v', 0], ['kcal', 'u', 2.5]], false)).toBe('mask');
    expect(tokens('sleep', 413).map(x => x[0]).join('')).toBe('6h53m');
    expect(tokens('kj', 5712).map(x => x[0]).join('')).toBe('5,710kJ');
  });
  test('muted and pillar inks are raised until they read on the page', () => {
    const t = createTheme('light') as unknown as Record<string, string>;
    const K = ridgeColors(t, 'light');
    K.ink.forEach(c => expect(ratio(c, t.bg)).toBeGreaterThanOrEqual(4.5));
    expect(ink('#ffffff', '#ffffff', '#000000', 4.5)).not.toBe('#ffffff');
  });
  test('springs settle on the target and stop', () => {
    const s = { x: { v: [0, 0, 0], a: [0, 0, 0], p: [0], f: [1, 1, 1] }, vel: { v: [0, 0, 0], a: [0, 0, 0], p: [0], f: [0, 0, 0] }, tg: { v: [0.4, 0.6, 1], a: [24, 1364, 413], p: [63], f: [1, 1, 1] } };
    let moving = true, t = 0;
    while (moving && t < 5000) { t += 16; moving = stepSprings(s, 0.016, 8.4, t, [0, 0, 0]); }
    expect(moving).toBe(false);
    expect(s.x.p[0]).toBe(63);
    expect(s.x.a).toEqual([24, 1364, 413]);
  });
  test('the scene carries the score, three readouts and a lit summit for a met goal', () => {
    const v = heroView(input({ trainMin: 24, kcal: 1364, sleepMin: 480 }));
    const svg = ridgeScene(393, 352, staticRidgeState(v, 'of ', 'Recovery day'), ridgeColors(createTheme('dark') as unknown as Record<string, string>, 'dark'), { uid: 't', detail: 1, labels: true, glow: 0.6 });
    expect(svg).toContain('>' + v.pct + '</text>');
    expect(svg).toContain('of 2,200 kcal');
    expect((svg.match(/r="2.8"/g) ?? []).length).toBe(1);
  });
});
