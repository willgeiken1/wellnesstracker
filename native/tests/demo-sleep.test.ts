import { withDemoSleep } from '@/features/home/demo-sleep';
import { heroInput } from '@/features/home/hero/data';
import type { HealthDays } from '@/features/health/days';

const real: HealthDays = { steps: [1, 2], sleepHours: [null, 7.5], activeKcal: null, exerciseMinutes: null, waterMl: null, mindfulMinutes: null, bodyFat: null };

describe('example sleep for sample data', () => {
  it('gives the sample-data owner the example week, ending on 6 h 53 m', () => {
    const h = withDemoSleep(null, 'demo', 30)!;
    expect(h.sleepHours).toHaveLength(30);
    expect(h.sleepHours!.slice(0, 23).every(v => v === null)).toBe(true);
    expect(Math.round(h.sleepHours![29]! * 60)).toBe(413);
  });
  it('never touches another owner or a real reading', () => {
    expect(withDemoSleep(null, 'device', 30)).toBeNull();
    expect(withDemoSleep(real, 'user-1', 30)).toBe(real);
    expect(withDemoSleep(real, 'demo', 30)).toBe(real);
  });
  it('keeps the other real readings when only sleep is missing', () => {
    const h = withDemoSleep({ ...real, sleepHours: null }, 'demo', 7)!;
    expect(h.steps).toEqual([1, 2]);
    expect(h.sleepHours).toHaveLength(7);
  });
  it('reaches the hero as last night', () => {
    const h = withDemoSleep(null, 'demo', 7)!;
    const input = heroInput({ calories: { series: [], goal: 2200 }, sleep: { series: h.sleepHours, need: 8 } } as never, null, 'kcal', new Date(2026, 10, 22, 15));
    expect(input.days[6].sleepMin).toBe(413);
  });
});
