import { WorkoutStore } from '../src/data/workout/store';
import { mergeHealthDays } from '../src/features/health/oura';
import type { HealthDays } from '../src/features/health/days';
import { metricView } from '../src/features/progress/metric';
import { buildProgress } from '../src/features/progress/source';
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
