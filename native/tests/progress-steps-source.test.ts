import { WorkoutStore } from '../src/data/workout/store';
import { mergeHealthDays } from '../src/features/health/oura';
import type { HealthDays } from '../src/features/health/days';
import { metricView } from '../src/features/progress/metric';
import { buildProgress } from '../src/features/progress/source';
import { TREND_KEYS, TREND_OPEN } from '../src/features/progress/model';
import { memoryRepository } from './workout-repository';

// Made-up step counts only.
const NOW = new Date(2026, 10, 11, 12), N = 40;
const none = { activeKcal: null, exerciseMinutes: null, waterMl: null, mindfulMinutes: null, bodyFat: null };
const days = (steps: (number | null)[], from?: 'oura'): HealthDays =>
  ({ steps, sleepHours: null, ...(from ? { stepsFrom: steps.map(n => n == null ? null : from) } : {}), ...none });
const progress = (health: HealthDays | null) => buildProgress({ store: new WorkoutStore(memoryRepository()), now: NOW, demo: false, health, recovery: null, ring: null });

describe('where the steps shown came from', () => {
  test('steps from Oura alone are put down to Oura, not Apple Health', () => {
    const d = progress(mergeHealthDays(null, days(Array(N).fill(6000), 'oura')));
    expect(metricView(d, 'steps', 'week').src).toBe('Oura');
    expect(metricView(d, 'steps').src).toBe('Oura');
  });
  test('Oura filling a day Apple Health has none for names both, only in a range that shows that day', () => {
    const apple = Array<number | null>(N).fill(8000); apple[N - 20] = null;
    const ring = Array<number | null>(N).fill(null); ring[N - 20] = 5000;
    const d = progress(mergeHealthDays(days(apple), days(ring, 'oura')));
    expect(metricView(d, 'steps', 'week').src).toBe('Apple Health');
    expect(metricView(d, 'steps', 'month').src).toBe('Apple Health and Oura');
  });
  test('Apple Health alone stays Apple Health', () => {
    expect(metricView(progress(days(Array(N).fill(8000))), 'steps', 'month').src).toBe('Apple Health');
  });
});

describe('where the nights shown came from', () => {
  const nights = (h: (number | null)[], from: 'oura' | 'apple'): HealthDays => ({ steps: null, sleepHours: h, sleepFrom: h.map(v => v == null ? null : from), ...none });
  const withOura = (d: ReturnType<typeof progress>) => ({ ...d, sources: { ...d.sources, oura: true } });
  test('with Oura connected, a week of nights filled from Apple Health reads as Apple Health', () => {
    const apple = Array<number | null>(N).fill(7), ring = Array<number | null>(N).fill(null); ring[N - 20] = 6.5; apple[N - 20] = null;
    const d = withOura(progress(mergeHealthDays(nights(apple, 'apple'), nights(ring, 'oura'))));
    expect(metricView(d, 'sleep', 'week').src).toBe('Apple Health');
    expect(metricView(d, 'sleep', 'month').src).toBe('Apple Health and Oura');
  });
  test('nights from Oura alone read as Oura, and with no per-night record the connected source is named', () => {
    expect(metricView(progress(mergeHealthDays(null, nights(Array(N).fill(7), 'oura'))), 'sleep', 'week').src).toBe('Oura');
    const bare = progress({ steps: null, sleepHours: Array(N).fill(7), ...none });
    expect(metricView({ ...bare, sleepFrom: undefined }, 'sleep').src).toBe('Apple Health');
    expect(metricView(withOura({ ...bare, sleepFrom: undefined }), 'sleep').src).toBe('Oura');
  });
});

describe('active energy', () => {
  test('comes from Apple Health\'s active energy, day by day, with a missing day left blank, not 0', () => {
    const kcal = Array<number | null>(N).fill(420); kcal[N - 2] = null;
    const d = progress({ steps: null, sleepHours: null, ...none, activeKcal: kcal });
    expect(d.days.active.slice(-3)).toEqual([420, null, 420]);
    expect(metricView(d, 'active').src).toBe('Apple Health');
    expect(metricView(d, 'active').unit).toBe('kcal');
  });
  test('opens as a trend but is not added to Progress\'s own list', () => {
    expect(TREND_OPEN).toContain('active');
    expect(TREND_KEYS).not.toContain('active');
  });
});
