import { bodyWeight, kcalPerMin, weeklyMinutes, elapsedMs, pauseLive, resumeLive, type Machine } from '../src/core/cardio/rules';
import type { Row } from '../src/data/rows';
const row = (table: Row['table'], data: Row['data'], deleted_at: number | null = null): Row => ({ table, data, deleted_at, id: 'synthetic', owner_id: 'demo', device_id: 'synthetic', updated_at: 1 });
// PWA goldens: 30 minutes, 3 mph / 12% incline or level 8.
test.each([
  ['treadmill', 347.1316224], ['stair', 320.544], ['elliptical', 267.12], ['bike', 247.8], ['rower', 289.8],
] as [Machine, number][])('%s matches PWA with kg and lb weigh-ins', (machine, expected) => {
  for (const [value, unit] of [[80, 'kg'], [176.36980974790205, 'lb']] as const) {
    const weight = bodyWeight([row('weigh_ins', { day: '2026-10-24', weight_kg: 80, entered_value: value, entered_unit: unit })], '2026-10-24');
    expect(weight).toEqual({ kg: 80, fallback: false });
    expect(kcalPerMin(machine, { mph: 3, incline: 12, level: 8 }, weight.kg) * 30).toBeCloseTo(expected, 5);
  }
});
test('latest weigh-in uses day, excludes deleted and future rows; fallback is 80 kg', () => {
  expect(bodyWeight([])).toEqual({ kg: 80, fallback: true });
  expect(bodyWeight([
    row('weigh_ins', { day: '2026-10-23', weight_kg: 75 }),
    row('weigh_ins', { day: '2026-10-22', weight_kg: 90 }),
    row('weigh_ins', { day: '2026-10-24', weight_kg: 85 }, 1),
    row('weigh_ins', { day: '2026-10-25', weight_kg: 95 }),
  ], '2026-10-24')).toEqual({ kg: 75, fallback: false });
});
test.each([[4.49, 6.21730304], [4.5, 11.056064]])('treadmill ACSM walking/running at %s mph', (mph, expected) => {
  expect(kcalPerMin('treadmill', { mph, incline: 0, level: 1 }, 80)).toBeCloseTo(expected, 3);
});
test('MET levels clamp to 1–20', () => {
  expect(kcalPerMin('bike', { mph: 0, incline: 0, level: -1 }, 80)).toBeCloseTo(5.32);
  expect(kcalPerMin('bike', { mph: 0, incline: 0, level: 99 }, 80)).toBeCloseTo(13.3);
});
test.each(['2026-10-19', '2026-10-25'])('Monday-start week includes both edges on %s', today => {
  const sessions = ['2026-10-18','2026-10-19','2026-10-25','2026-10-26'].map(day => row('cardio_sessions', { day, duration_ms: 600000 }));
  sessions.push(row('cardio_sessions', { day: '2026-10-20', duration_ms: 600000 }, 1));
  expect(weeklyMinutes(sessions, [], today)).toBe(20);
});
test('weekly totals exclude inclusive pauses, ignore deleted pause markers', () => {
  const sessions = ['2026-10-19','2026-10-20','2026-10-21','2026-10-22'].map(day => row('cardio_sessions', { day, duration_ms: 600000 }));
  expect(weeklyMinutes(sessions, [row('pauses', { start_day: '2026-10-20', end_day: '2026-10-21' }), row('pauses', { start_day: '2026-10-22', end_day: null }, 1)], '2026-10-24')).toBe(20);
  expect(weeklyMinutes(sessions, [row('pauses', { start_day: '2026-10-20', end_day: null })], '2026-10-24')).toBe(10);
});
test('week edges span year changes and DST', () => {
  expect(weeklyMinutes([row('cardio_sessions', { day: '2027-01-01', duration_ms: 60000 })], [], '2026-12-28')).toBe(1);
  expect(weeklyMinutes([row('cardio_sessions', { day: '2026-11-01', duration_ms: 60000 })], [], '2026-10-26')).toBe(1);
});
test('multiple pauses exclude stopped time, including pause at timestamp zero', () => {
  let live = { startedAt: 0, pausedAt: null as number | null, pausedMs: 0 };
  live = pauseLive(live, 10000);
  expect(elapsedMs(live, 90000)).toBe(10000);
  live = resumeLive(live, 40000);
  live = pauseLive(live, 60000);
  live = resumeLive(live, 100000);
  expect(elapsedMs(live, 120000)).toBe(50000);
  expect(elapsedMs(pauseLive({ startedAt: 0, pausedAt: null, pausedMs: 0 }, 0), 1000)).toBe(0);
});
