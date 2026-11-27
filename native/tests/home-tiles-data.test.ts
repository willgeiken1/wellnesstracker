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
    now: NOW, days, weightUnit: 'lb', water: { unit: 'oz', goal: 100 / 33.814, litres: days.map(() => 0), drinks: [], containers: [] }, food: days.map(() => emptyDay), nextMeal: null, recentFoods: [], weighIns: [], weightGoalKg: null,
    volumeKg: days.map(() => 0), volumeByGroupKg: {}, volumeLastWeekKg: 0, workoutsThisWeek: 0, active: null, upNext: null,
    health: null, detail: null, recovery: null, score: null, sources: { activity: 'Apple Health', sleep: 'Apple Health', body: 'Apple Health' },
    goals: { steps: 8000, exercise: 30, active: 500, sleepHours: 8, mindful: 10 }, ...over,
  };
}
const series = (today: number | null, before: number | null = 5000) => days.map((_, i) => i === DAYS - 1 ? today : i % 4 === 0 ? null : before);
const health = (over: Partial<NonNullable<HomeInput['health']>> = {}) => ({ steps: null, activeKcal: null, exerciseMinutes: null, sleepHours: null, mindfulMinutes: null, ...over });

describe('which tiles have a reading to draw', () => {
  test('with nothing logged or connected, only Volume and Water (logged in the app) draw; every other tile shows its empty state', () => {
    const ready = tileReady(input());
    expect(Object.entries(ready).filter(([, ok]) => ok).map(([id]) => id)).toEqual(['volume', 'water']);
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
  test('food logged today that gives no energy or protein reads as unknown, not as 0 eaten with the whole goal left', () => {
    const at = new Date(2026, 10, 22, 12, 30);
    // A calorie-only Quick add and a scanned bar with no energy: made-up foods.
    const quick = { ...emptyDay, kcal: 600, protein: null, goalKcal: 2200, goalProtein: 165, meals: [{ id: 'l', name: 'Lunch', kcal: 600, protein: null, count: 1, loggedAt: at }] };
    const bar = { ...emptyDay, kcal: null, protein: 8, carbs: 30, fat: 4, goalKcal: 2200, goalProtein: 165, meals: [{ id: 'l', name: 'Lunch', kcal: null, protein: 8, count: 1, loggedAt: at }] };
    const withDay = (d: HomeInput['food'][number]) => input({ food: [...days.slice(1).map(() => emptyDay), d], nextMeal: { id: 'd', name: 'Dinner' } });

    const q = buildState(withDay(quick), DEFAULT_UNITS, () => {});
    expect(q.ready.calories).toBe(true);
    expect(tileView(q, 'protein', 'A', 'S', {})).toEqual({ empty: 'foodUnknown' });
    expect(tileView(q, 'calories', 'C', 'M', {})).toEqual({ empty: 'foodUnknown' });
    expect(tileView(q, 'logMeal', 'A', 'S', { value: 'p' })).toEqual({ empty: 'foodUnknown' });
    expect(tileView(q, 'logMeal', 'A', 'S', { value: 'kcal' })).toEqual({ options: { value: 'kcal' } });
    expect(q.data.protein.byMeal).toEqual([null]);

    const b = buildState(withDay(bar), DEFAULT_UNITS, () => {});
    expect(tileView(b, 'calories', 'A', 'M', {})).toEqual({ empty: 'foodUnknown' });
    expect(tileView(b, 'logMeal', 'A', 'S', {})).toEqual({ empty: 'foodUnknown' });
    expect(b.ready.protein).toBe(true);
    expect(b.data.calories.meals).toEqual([{ name: 'Lunch', kcal: null, time: '12:30 PM' }]);
    expect(b.data.next.sub).toBe('– of 2,200 kcal so far');
    // Drawn where it still can be, an unknown meal reads as a dash, never 0 or null.
    const html = drawTile({ id: 'protein', style: 'D', size: 'M', options: {}, colors: createTheme('dark'), mode: 'dark', data: q.data, uid: 'pd' }) ?? '';
    expect(html).not.toMatch(/NaN|null| 0 g/);
    expect(html).toContain('Lunch – g');
    // Nothing logged yet is still a real 0 eaten.
    expect(tileReady(withDay({ ...quick, kcal: null, protein: null, meals: [] })).calories).toBe(true);
  });
  test('a recent food that gives no protein or energy reads as a dash in Quick add, not as 0', () => {
    const fed = { ...emptyDay, kcal: 600, protein: 20, goalKcal: 2200, goalProtein: 165, meals: [{ id: 'l', name: 'Lunch', kcal: 600, protein: 20, count: 1, loggedAt: new Date(2026, 10, 22, 12, 30) }] };
    // Made-up foods: a calorie-only Quick add and a scanned bar with no energy.
    const d = buildTileData(input({ food: [...days.slice(1).map(() => emptyDay), fed], nextMeal: { id: 'd', name: 'Dinner' },
      recentFoods: [{ name: 'Synthetic quick lunch', serving: '', kcal: 450, protein: null }, { name: 'Synthetic bar', serving: '40 g', kcal: null, protein: 8 }] }));
    expect(d.mealLog?.recent).toEqual([{ n: 'Synthetic quick lunch', q: '', kcal: 450, p: null }, { n: 'Synthetic bar', q: '40 g', kcal: null, p: 8 }]);
    const draw = (value: string) => drawTile({ id: 'logMeal', style: 'B', size: 'M', options: { value, list: 'recent' }, colors: createTheme('dark'), mode: 'dark', data: d, uid: 'mb' }) ?? '';
    expect(draw('p')).toContain('Synthetic quick lunch to lunch, – grams of protein');
    expect(draw('kcal')).toContain('Synthetic bar to lunch, – kcal');
    for (const v of ['p', 'kcal']) expect(draw(v)).not.toMatch(/NaN|null| 0 g protein|>0</);
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
  test('water draws from the app\'s own water model: today, goal, week, drinks by the hour and quick containers', () => {
    const glass = { id: 'glass', name: 'Glass', oz: 8, icon: 'glass', quick: true }, bottle = { id: 'bottle', name: 'Bottle', oz: 16.9, icon: 'bottle', quick: false };
    const i = input({ water: { unit: 'ml', goal: 2.5, litres: days.map((_, k) => k === DAYS - 1 ? 0.71 : k === DAYS - 2 ? 2.6 : 0),
      drinks: [{ at: new Date(2026, 10, 22, 8, 5), oz: 8 }, { at: new Date(2026, 10, 22, 8, 40), oz: 16 }], containers: [glass, bottle] } });
    expect(tileReady(i).water).toBe(true);
    const w = buildTileData(i).water;
    expect([w.unit, w.goal, w.today]).toEqual(['ml', 2.5, 0.71]);
    expect(w.series).toHaveLength(DAYS);
    expect(w.series.slice(-2)).toEqual([2.6, 0.71]);
    expect(w.hourly[8]).toBeCloseTo(24 / 33.814, 5);
    expect(w.hourly.filter(v => v > 0)).toHaveLength(1);
    expect(w.log).toEqual([{ t: '8:05 AM', oz: 8 }, { t: '8:40 AM', oz: 16 }]);
    expect(w.containers).toEqual([glass]);
    // No health source is needed: the clock style draws from the drinks themselves.
    const s = buildState(i, DEFAULT_UNITS, () => {});
    expect(tileView(s, 'water', 'B', 'S', {})).toEqual({ options: {} });
    expect(tileView(s, 'water', 'E', 'S', {})).toEqual({ options: {} });
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
    const detail = { stepsHourly: null, activeHourly: null, exerciseHourly: null, bedtimes: [23], mindful: null, bodyFat: null,
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
      health: health({ steps: series(7940), activeKcal: series(520, 480), exerciseMinutes: series(24, 30), sleepHours: series(6.9, 7.4), mindfulMinutes: series(12, 9) }),
      detail: { stepsHourly: hourly, activeHourly: hourly, exerciseHourly: hourly,
        night: { bed: new Date(2026, 10, 21, 23, 28), wake: new Date(2026, 10, 22, 6, 21), stages: [['core', 0, 100], ['deep', 100, 180], ['awake', 180, 190], ['rem', 190, 413]] },
        bedtimes: series(23.5, 23), mindful: [{ start: new Date(2026, 10, 22, 7, 5), minutes: 7 }],
        bodyFat: [{ at: new Date(2026, 10, 12, 7), percent: 18.4 }, { at: new Date(2026, 10, 21, 7), percent: 17.8 }] },
      recovery: { hrv: series(54, 50), rhr: series(56, 58), sleepScore: series(86, 80), source: 'Oura' },
      water: { unit: 'oz', goal: 2.5, litres: days.map((_, k) => k % 4 === 0 ? 0 : 2.1), drinks: [{ at: new Date(2026, 10, 22, 8, 5), oz: 16.9 }, { at: new Date(2026, 10, 22, 12, 30), oz: 24 }],
        containers: [{ id: 'glass', name: 'Glass', oz: 8, icon: 'glass', quick: true }, { id: 'bottle', name: 'Bottle', oz: 16.9, icon: 'bottle', quick: true }] },
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
