import { buildTileData, DAYS, tileReady, type HomeInput } from '../src/features/home/tiles/data';
import { nightTimeline } from '../src/features/home/tiles/health-detail';
import { parseMarkup, parseStyle } from '../src/features/home/tiles/markup-parse';
import { buildState, tileView } from '../src/features/home/tiles/state';
import { DEFAULT_UNITS, drawTile, studioVersion } from '../src/features/home/tiles/studio';
import { detailFor, pickRecovery } from '../src/features/home/tiles/use-home-tiles';
import { createTheme } from '../src/design/tokens';
import { tilePage } from '../src/features/tiles/registry';
import type { TileSize } from '../src/features/tiles/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Made-up readings only.
const NOW = new Date(2026, 10, 22, 16, 12);
const days = Array.from({ length: DAYS }, (_, i) => { const d = new Date(2026, 10, 22 - (DAYS - 1 - i)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const emptyDay = { kcal: null, protein: null, carbs: null, fat: null, goalKcal: null, goalProtein: null, meals: [] };
function input(over: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW, days, weightUnit: 'lb', waterUnit: 'oz', food: days.map(() => emptyDay), nextMeal: null, recentFoods: [], weighIns: [], weightGoalKg: null,
    volumeKg: days.map(() => 0), volumeByGroupKg: {}, volumeLastWeekKg: 0, workoutsThisWeek: 0, active: null, upNext: null,
    health: null, detail: null, recovery: null, score: null, sources: { activity: 'Apple Health', sleep: 'Apple Health', body: 'Apple Health' },
    goals: { water: 2.5, steps: 8000, exercise: 30, active: 500, sleepHours: 8, mindful: 10 }, ...over,
  };
}
const series = (today: number | null, before: number | null = 5000) => days.map((_, i) => i === DAYS - 1 ? today : i % 4 === 0 ? null : before);
const health = (over: Partial<NonNullable<HomeInput['health']>> = {}) => ({ steps: null, activeKcal: null, exerciseMinutes: null, sleepHours: null, waterMl: null, mindfulMinutes: null, ...over });

describe('which tiles have a reading to draw', () => {
  test('with nothing logged or connected, only Volume draws; every other tile shows its empty state', () => {
    const ready = tileReady(input());
    expect(Object.entries(ready).filter(([, ok]) => ok).map(([id]) => id)).toEqual(['volume']);
    const s = buildState(input(), DEFAULT_UNITS, () => {});
    expect(tileView(s, 'steps', 'A', 'S', {})).toEqual({ empty: 'connect' });
    expect(tileView(s, 'calories', 'A', 'S', {})).toEqual({ empty: 'targets' });
    expect(tileView(s, 'weight', 'A', 'S', {})).toEqual({ empty: 'weigh' });
    expect(tileView(s, 'nextup', 'B', 'S', {})).toEqual({ empty: 'routines' });
  });
  test('a missing reading today is an empty tile, never a 0', () => {
    const i = input({ health: health({ steps: series(null) }) });
    expect(tileReady(i).steps).toBe(false);
    expect(buildState(i, DEFAULT_UNITS, () => {}).why.steps).toBe('today');
    // A real 0 is a reading.
    expect(tileReady(input({ health: health({ steps: series(0) }) })).steps).toBe(true);
  });
  test('earlier days without a reading stay empty in the series', () => {
    const data = buildTileData(input({ health: health({ steps: series(7940) }) }));
    expect(data.steps.today).toBe(7940);
    expect(data.steps.series[0]).toBeNull();
    expect(data.steps.series[1]).toBe(5000);
    expect(data.steps.series).toHaveLength(DAYS);
  });
  test('food tiles need the day\'s targets; Next also draws for a workout in progress', () => {
    const fed = { ...emptyDay, kcal: 1364, protein: 92, goalKcal: 2200, goalProtein: 165, meals: [{ id: 'b', name: 'Breakfast', kcal: 412, protein: 26, count: 3, loggedAt: new Date(2026, 10, 22, 7, 40) }] };
    const i = input({ food: [...days.slice(1).map(() => emptyDay), fed], nextMeal: { id: 'd', name: 'Dinner' } });
    const r = tileReady(i);
    expect([r.calories, r.protein, r.logMeal, r.next]).toEqual([true, true, true, true]);
    const d = buildTileData(i);
    expect(d.calories.meals).toEqual([{ name: 'Breakfast', kcal: 412, time: '7:40 AM' }]);
    expect(d.next.title).toBe('Log dinner');
    expect(d.next.sub).toBe('1,364 of 2,200 kcal so far');
    expect(tileReady(input({ active: { name: 'Legs A', startedAt: new Date(NOW.getTime() - 1450_000), setsDone: 8, setsTotal: 18 } })).next).toBe(true);
  });
  test('weight is drawn from weigh-ins in the window, in pounds, with no goal line when there is no goal', () => {
    const i = input({ weighIns: [{ day: days[DAYS - 3], kg: 82.6, at: null }, { day: days[DAYS - 1], kg: 82.3, at: new Date(2026, 10, 22, 6, 52) }] });
    const d = buildTileData(i), s = buildState(i, DEFAULT_UNITS, () => {});
    expect(d.weight.today).toBeCloseTo(181.4, 1);
    expect(d.weight.lastWeighIn).toBe('Today, 6:52 AM');
    expect(d.weight.series.filter(v => v !== null)).toHaveLength(2);
    expect(tileView(s, 'weight', 'A', 'S', { goal: 'on' })).toEqual({ options: { goal: 'off' } });
    expect(tileView(s, 'weight', 'D', 'S', {})).toEqual({ empty: 'goalWeight' });
  });
  test('a week with no recovery reading shows the pillar as missing, not as 0', () => {
    const score = days.map(() => ({ value: 70, training: 80, food: 60, recovery: null }));
    const d = buildTileData(input({ score }));
    expect(d.week.every(w => w.recovery === null)).toBe(true);
    expect(d.score.pillars.recovery).toBeNull();
    const html = drawTile({ id: 'week', style: 'C', size: 'M', options: {}, colors: createTheme('dark'), mode: 'dark', data: d, uid: 'wk' }) ?? '';
    expect(html).toContain('–');
    expect(html).not.toMatch(/NaN|>null</);
  });
  test('styles that need hour-by-hour detail say so when the source gives none', () => {
    const s = buildState(input({ health: health({ steps: series(7940), activeKcal: series(520) }) }), DEFAULT_UNITS, () => {});
    expect(tileView(s, 'steps', 'A', 'S', {})).toEqual({ empty: 'detail' });
    expect(tileView(s, 'active', 'C', 'S', {})).toEqual({ options: {} });
    expect(tileView(s, 'active', 'A', 'S', {})).toEqual({ empty: 'detail' });
  });
});

describe('health sources stay apart', () => {
  test('HRV, resting heart rate and sleep score come from Oura when connected, otherwise from Apple Health, never mixed', () => {
    const oura = { readiness: [80], sleepScore: [86], hrv: [54], restingHeartRate: [56], night: null };
    const apple = { access: 'asked' as const, recovery: { night: null, restingHeartRate: [60], hrv: [40], heartToday: null, vo2Max: null } };
    expect(pickRecovery(oura, apple)).toEqual({ hrv: [54], rhr: [56], sleepScore: [86], source: 'Oura' });
    expect(pickRecovery(null, apple)).toEqual({ hrv: [40], rhr: [60], sleepScore: null, source: 'Apple Health' });
    expect(pickRecovery(null, { access: 'ask', recovery: null })).toBeNull();
  });
  test('with Oura as the sleep source, Apple\'s night stages are left out and the sleep tile says why', () => {
    const detail = { stepsHourly: null, activeHourly: null, exerciseHourly: null, waterHourly: null, bedtimes: [23], mindful: null, bodyFat: null,
      night: { bed: new Date(2026, 10, 21, 23), wake: new Date(2026, 10, 22, 6), stages: [['core', 0, 420]] as [ 'core', number, number][] } };
    expect(detailFor(detail, false)).toBe(detail);
    const only = detailFor(detail, true)!;
    expect(only.night).toBeNull();
    expect(only.bedtimes).toBeNull();
    const s = buildState(input({ health: health({ sleepHours: series(6.9, 7) }), detail: only,
      recovery: { hrv: series(54, 50), rhr: series(56, 57), sleepScore: series(86, 80), source: 'Oura' } }), DEFAULT_UNITS, () => {});
    expect(tileView(s, 'sleep', 'A', 'S', {})).toEqual({ empty: 'sleepStages' });
    expect(tileView(s, 'hrv', 'A', 'S', {})).toEqual({ options: {} });
  });
});

describe('last night as a timeline', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, h < 12 ? 22 : 21, h, m);
  test('stages from bedtime, awake first, then core, REM and deep', () => {
    const night = nightTimeline([
      { start: at(23), end: at(23, 30), stage: 'core' },
      { start: at(23, 30), end: at(0 + 1), stage: 'deep' },
      { start: at(1), end: at(1, 10), awake: true },
      { start: at(1, 10), end: at(2), stage: 'rem' },
    ], at(18), at(11))!;
    expect(night.bed).toEqual(at(23));
    expect(night.wake).toEqual(at(2));
    expect(night.stages).toEqual([['core', 0, 30], ['deep', 30, 120], ['awake', 120, 130], ['rem', 130, 180]]);
  });
  test('plain asleep with no stages gives no timeline', () => {
    expect(nightTimeline([{ start: at(23), end: at(6) }], at(18), at(11))).toBeNull();
    expect(nightTimeline([], at(18), at(11))).toBeNull();
  });
});

describe('drawing', () => {
  test('markup parses elements, text, inline styles and entities', () => {
    expect(parseStyle('left:16px; font-weight:600;color:#fff')).toEqual({ left: '16px', 'font-weight': '600', color: '#fff' });
    const [el] = parseMarkup('<div style="top:2px" data-ql="food">Eggs &amp; toast<span>2</span></div>');
    expect(el).toMatchObject({ kind: 'el', tag: 'div', attrs: { 'data-ql': 'food' }, style: { top: '2px' } });
    expect(el.kind === 'el' && el.children[0]).toEqual({ kind: 'text', text: 'Eggs & toast' });
  });
  test('every Home tile and style the catalogue offers draws its reading at every size, with no stray null or NaN', () => {
    const colors = createTheme('dark');
    const hourly = Array.from({ length: 24 }, (_, h) => h < 16 ? h * 10 : 0);
    const fed = { ...emptyDay, kcal: 1364, protein: 92, carbs: 148, fat: 44, goalKcal: 2200, goalProtein: 165,
      meals: [{ id: 'b', name: 'Breakfast', kcal: 412, protein: 26, count: 3, loggedAt: new Date(2026, 10, 22, 7, 40) }, { id: 'd', name: 'Dinner', kcal: null, protein: null, count: 0, loggedAt: null }] };
    const i = input({
      food: days.map((_, k) => k === DAYS - 1 ? fed : k % 5 === 0 ? emptyDay : { ...fed, kcal: 2100, protein: 150 }), nextMeal: { id: 'd', name: 'Dinner' },
      recentFoods: [{ name: 'Banana', serving: '118 g', kcal: 105, protein: 1 }],
      weighIns: days.filter((_, k) => k % 3 !== 1).map((day, k) => ({ day, kg: 83 - k * 0.05, at: null })),
      volumeKg: days.map((_, k) => k % 3 === 0 ? 0 : 3000), volumeByGroupKg: { Legs: 3000, Back: 2000 }, volumeLastWeekKg: 20000, workoutsThisWeek: 4,
      upNext: 'Push day B · 6 exercises',
      health: health({ steps: series(7940), activeKcal: series(520, 480), exerciseMinutes: series(24, 30), sleepHours: series(6.9, 7.4), waterMl: series(1700, 2400), mindfulMinutes: series(12, 9) }),
      detail: { stepsHourly: hourly, activeHourly: hourly, exerciseHourly: hourly, waterHourly: hourly,
        night: { bed: new Date(2026, 10, 21, 23, 28), wake: new Date(2026, 10, 22, 6, 21), stages: [['core', 0, 100], ['deep', 100, 180], ['awake', 180, 190], ['rem', 190, 413]] },
        bedtimes: series(23.5, 23), mindful: [{ start: new Date(2026, 10, 22, 7, 5), minutes: 7 }],
        bodyFat: [{ at: new Date(2026, 10, 12, 7), percent: 18.4 }, { at: new Date(2026, 10, 21, 7), percent: 17.8 }] },
      recovery: { hrv: series(54, 50), rhr: series(56, 58), sleepScore: series(86, 80), source: 'Oura' },
      score: days.map((_, k) => k % 6 === 0 ? { value: null, training: null, food: null, recovery: null } : { value: 63, training: 40, food: 62, recovery: k === DAYS - 2 ? null : 86 }),
    });
    const s = buildState(i, DEFAULT_UNITS, () => {});
    let drawn = 0;
    for (const def of tilePage('home').tiles) {
      for (const v of def.versions ?? []) {
        expect(studioVersion(def.id, v.key)).toBeTruthy();
        for (const size of (v.sizes ?? def.sizes) as TileSize[]) {
          const view = tileView(s, def.id, v.key, size, {});
          if ('empty' in view) continue;
          const html = drawTile({ id: def.id, style: v.key, size, options: view.options, colors, mode: 'dark', data: s.data, uid: `t${def.id}${v.key}${size}` });
          expect(html).toBeTruthy();
          expect([def.id, v.key, size, html]).not.toEqual([def.id, v.key, size, expect.stringMatching(/NaN|>null<|undefined/)]);
          drawn++;
        }
      }
    }
    // Only Next up (no routine items yet) and the styles needing sleep score parts sit out.
    expect(drawn).toBeGreaterThan(180);
  });
});
