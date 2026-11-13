import { dayEnd, dayStart, hoursAsleep, lastDays, nightOf, readHealthDays } from '../src/features/health/days';
import type { HealthAccess, HealthSource, SleepSpan } from '../src/features/health/source';

// Made-up values only.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const span = (a: Date, b: Date): SleepSpan => ({ start: a, end: b });
const source = (access: HealthAccess, over: Partial<HealthSource> = {}): HealthSource => ({
  access: async () => access, request: async () => {}, weights: async () => [], steps: async () => 0, sleep: async () => [], activeEnergy: async () => 0, exerciseMinutes: async () => 0, heart: async () => null, vo2Max: async () => null, water: async () => 0, mindful: async () => [], bodyFat: async () => [], ...over,
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
  expect(read!.sleepHours![0]).toBeCloseTo(7);
  expect(read!.sleepHours![1]).toBeCloseTo(7.2);
  expect(windows).toEqual([[at(11, 0), at(12, 0)], [at(12, 0), at(12, 15)]]);
});

test('active calories and exercise minutes are read per day like steps, up to now, and each stands alone', async () => {
  const windows: [Date, Date][] = [];
  const read = await readHealthDays(source('asked', {
    activeEnergy: async (from, to) => { windows.push([from, to]); return from.getDate() === 11 ? 612.6 : 240.2; },
    exerciseMinutes: async from => { if (from.getDate() === 12) throw new Error('made-up failure'); return 41; },
  }), ['2026-11-11', '2026-11-12'], at(12, 15));
  expect(read!.activeKcal).toEqual([613, 240]);
  expect(windows).toEqual([[at(11, 0), at(12, 0)], [at(12, 0), at(12, 15)]]);
  // Today's exercise failing leaves that tile out and nothing else.
  expect(read!.exerciseMinutes).toBeNull();
  expect(read!.steps).toEqual([0, 0]);
  const odd = await readHealthDays(source('asked', { activeEnergy: async () => Number.NaN, exerciseMinutes: async () => -3 }), ['2026-11-12'], at(12, 15));
  expect(odd).toMatchObject({ activeKcal: [0], exerciseMinutes: [0] });
});

test('water adds up per day, mindful sessions logged twice count once, and body fat comes from the last 90 days', async () => {
  let since: Date | undefined;
  const read = await readHealthDays(source('asked', {
    water: async from => from.getDate() === 12 ? 1250.4 : 0,
    mindful: async (from, to) => from.getDate() === 12 ? [{ start: at(12, 8), end: at(12, 8, 10) }, { start: at(12, 8, 5), end: at(12, 8, 15) }, { start: at(12, 14, 50), end: at(12, 15, 20) }].filter(s => s.start < to) : [],
    bodyFat: async start => { since = start; return [{ at: at(1, 7), percent: 22.46 }, { at: at(12, 7), percent: 21.94 }, { at: at(13, 7), percent: 20 }, { at: at(12, 8), percent: Number.NaN }]; },
  }), ['2026-11-11', '2026-11-12'], at(12, 15));
  expect(read!.waterMl).toEqual([0, 1250]);
  // 8:00 to 8:15 once, plus 14:50 up to now at 15:00.
  expect(read!.mindfulMinutes).toEqual([0, 25]);
  expect(read!.bodyFat).toEqual([22.5, 21.9]);
  expect(since).toEqual(new Date(2026, 10, 12 - 89));
  const failed = await readHealthDays(source('asked', { bodyFat: async () => { throw new Error('made-up failure'); } }), ['2026-11-12'], at(12, 15));
  expect(failed!.bodyFat).toBeNull();
  expect(failed!.steps).toEqual([0]);
});

test('an earlier day that fails only loses its bar; today failing leaves the number out instead of showing 0', async () => {
  const early = await readHealthDays(source('asked', {
    steps: async from => { if (from.getDate() === 11) throw new Error('made-up failure'); return 3000; },
  }), ['2026-11-11', '2026-11-12'], at(12, 15));
  expect(early).toEqual({ steps: [0, 3000], sleepHours: [0, 0], activeKcal: [0, 0], exerciseMinutes: [0, 0], waterMl: [0, 0], mindfulMinutes: [0, 0], bodyFat: [] });
  const today = await readHealthDays(source('asked', {
    steps: async from => { if (from.getDate() === 12) throw new Error('made-up failure'); return 3000; },
    sleep: async () => { throw new Error('made-up failure'); },
  }), ['2026-11-11', '2026-11-12'], at(12, 15));
  expect(today).toEqual({ steps: null, sleepHours: null, activeKcal: [0, 0], exerciseMinutes: [0, 0], waterMl: [0, 0], mindfulMinutes: [0, 0], bodyFat: [] });
});

test('days and nights follow the clock on the wall across a clock change', () => {
  // Any zone: the end of a day is the next local midnight and a night ends at local noon, never "24 hours later".
  for (const day of ['2026-03-08', '2026-11-01', '2026-03-29', '2026-10-25', '2026-06-15']) {
    const [y, m, d] = day.split('-').map(Number);
    expect(dayEnd(day)).toEqual(new Date(y, m - 1, d + 1));
    expect([dayEnd(day).getHours(), dayEnd(day).getMinutes()]).toEqual([0, 0]);
    expect(nightOf(day).from.getHours()).toBe(18);
    expect(nightOf(day).to.getHours()).toBe(12);
    expect(nightOf(day).to.getDate()).toBe(d);
  }
});

test('time one device marks awake comes out of another device\'s broad asleep block', () => {
  const night = nightOf('2026-11-12');
  const spans = [span(at(11, 23), at(12, 7)), { ...span(at(12, 2), at(12, 3)), awake: true }, { ...span(at(12, 8), at(12, 9)), awake: true }];
  expect(hoursAsleep(spans, night.from, night.to)).toBeCloseTo(7);
});

test('sleep that has not happened yet is not counted', async () => {
  const read = await readHealthDays(source('asked', { sleep: async () => [span(at(11, 23), at(12, 8))] }), ['2026-11-12'], at(12, 2));
  expect(read!.sleepHours![0]).toBeCloseTo(3);
});

test('the last days end on today, oldest first, across a month boundary', () => {
  expect(lastDays(new Date(2026, 2, 2, 9), 4)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  expect(lastDays(new Date(2026, 10, 13, 0, 1), 1)).toEqual(['2026-11-13']);
});
