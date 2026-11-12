import { dayStart, hoursAsleep, nightOf, readHealthDays } from '../src/features/health/days';
import type { HealthAccess, HealthSource, SleepSpan } from '../src/features/health/source';

// Made-up values only.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const span = (a: Date, b: Date): SleepSpan => ({ start: a, end: b });
const source = (access: HealthAccess, over: Partial<HealthSource> = {}): HealthSource => ({
  access: async () => access, request: async () => {}, weights: async () => [], steps: async () => 0, sleep: async () => [], ...over,
});

test('a night runs from 6 pm the evening before to noon and belongs to the day you wake on', () => {
  expect(dayStart('2026-11-12')).toEqual(at(12, 0));
  expect(nightOf('2026-11-12')).toEqual({ from: at(11, 18), to: at(12, 12) });
});

test('hours asleep count overlapping stretches once and ignore time outside the night', () => {
  const night = nightOf('2026-11-12');
  const spans = [span(at(11, 23), at(12, 3)), span(at(12, 2), at(12, 6)), span(at(12, 2, 30), at(12, 3, 30)), span(at(12, 13), at(12, 14)), span(at(11, 17), at(11, 18, 30))];
  expect(hoursAsleep(spans, night.from, night.to)).toBeCloseTo(7.5);
  expect(hoursAsleep([], night.from, night.to)).toBe(0);
  expect(hoursAsleep([span(at(12, 5), at(12, 4))], night.from, night.to)).toBe(0);
});

test('nothing is read before the person has been asked, or with no Apple Health', async () => {
  const steps = jest.fn(async () => 5000), sleep = jest.fn(async () => []);
  expect(await readHealthDays(source('ask', { steps, sleep }), ['2026-11-12'], at(12, 15))).toBeNull();
  expect(await readHealthDays(null, ['2026-11-12'], at(12, 15))).toBeNull();
  expect(steps).not.toHaveBeenCalled();
  expect(sleep).not.toHaveBeenCalled();
});

test('once asked, each day gets its steps up to now and its night of sleep', async () => {
  const windows: [Date, Date][] = [];
  const read = await readHealthDays(source('asked', {
    steps: async (from, to) => { windows.push([from, to]); return from.getDate() === 11 ? 8430.4 : 2100; },
    sleep: async () => [span(at(10, 23), at(11, 6)), span(at(11, 23, 30), at(12, 6, 42))],
  }), ['2026-11-11', '2026-11-12'], at(12, 15));
  expect(read!.steps).toEqual([8430, 2100]);
  expect(read!.sleepHours[0]).toBeCloseTo(7);
  expect(read!.sleepHours[1]).toBeCloseTo(7.2);
  expect(windows).toEqual([[at(11, 0), at(12, 0)], [at(12, 0), at(12, 15)]]);
});

test('a day that cannot be read counts as none instead of failing the rest', async () => {
  const read = await readHealthDays(source('asked', {
    steps: async from => { if (from.getDate() === 11) throw new Error('made-up failure'); return 3000; },
    sleep: async () => { throw new Error('made-up failure'); },
  }), ['2026-11-11', '2026-11-12'], at(12, 15));
  expect(read).toEqual({ steps: [0, 3000], sleepHours: [0, 0] });
});
