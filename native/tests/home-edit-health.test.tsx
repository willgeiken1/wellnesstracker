import { buildState, tileView } from '../src/features/home/tiles/state';
import { DAYS, type HomeInput } from '../src/features/home/tiles/data';
import { DEFAULT_UNITS } from '../src/features/home/tiles/studio';
import { tilePage } from '../src/features/tiles/registry';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// The tile tray lists every Home tile; Steps and Sleep are always there. Without a health source they say how to fill them.
const days = Array.from({ length: DAYS }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const empty = { kcal: null, protein: null, carbs: null, fat: null, goalKcal: null, goalProtein: null, meals: [] };
const input = (over: Partial<HomeInput>): HomeInput => ({
  now: new Date(2026, 9, 30, 15), days, weightUnit: 'lb', waterUnit: 'oz', food: days.map(() => empty), nextMeal: null, recentFoods: [], weighIns: [],
  weightGoalKg: null, volumeKg: days.map(() => 0), volumeByGroupKg: {}, volumeLastWeekKg: 0, workoutsThisWeek: 0, active: null, upNext: null,
  health: null, detail: null, recovery: null, score: null, sources: { activity: 'Apple Health', sleep: 'Apple Health', body: 'Apple Health' },
  goals: { water: 2.5, steps: 8000, exercise: 30, active: 500, sleepHours: 8, mindful: 10 }, ...over,
});

test('the tray offers Steps and Sleep with their styles', () => {
  const home = tilePage('home');
  for (const id of ['steps', 'sleep']) expect(home.tiles.find(d => d.id === id)?.versions?.length).toBe(4);
});

test.each([
  ['no health source', null, 'connect'],
  ['a source with nothing yet today', { steps: [null], activeKcal: null, exerciseMinutes: null, sleepHours: [null], waterMl: null, mindfulMinutes: null }, 'today'],
] as const)('with %s, Steps says how it fills in rather than showing 0', (_name, health, why) => {
  const s = buildState(input({ health: health ? { ...health, steps: [...health.steps], sleepHours: [...health.sleepHours] } : null }), DEFAULT_UNITS, () => {});
  expect(tileView(s, 'steps', 'C', 'S', {})).toEqual({ empty: why });
  expect(tileView(s, 'sleep', 'A', 'S', {})).toEqual({ empty: health ? 'night' : 'connect' });
});
