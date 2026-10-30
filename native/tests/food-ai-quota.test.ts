import { foodAiQuota, type FoodAiUsage } from '../src/features/food/ai/quota';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const usage: FoodAiUsage = {
  daily: { day: '2026-10-30', photos: 0, descriptions: 0 },
  weekly: { weekStart: '2026-10-26', photos: 0, descriptions: 0 },
};
const clock = () => new Date('2026-10-30T17:00:00Z');

test('free Snap and Describe share three tries; checking never consumes one', () => {
  const used = Object.freeze({ ...usage, weekly: Object.freeze({ ...usage.weekly, photos: 1, descriptions: 1 }) });
  for (const kind of ['photos', 'descriptions'] as const) {
    expect(foodAiQuota({ tier: 'free', kind, usage: used, clock, timeZone: 'UTC' })).toEqual({
      allowed: true, remaining: 1, resetsAt: '2026-11-02T00:00:00.000Z', reason: null,
    });
  }
  expect(used.weekly.descriptions).toBe(1);
  expect(foodAiQuota({ tier: 'free', kind: 'photos', usage: { ...usage, weekly: { ...usage.weekly, descriptions: 3 } }, clock, timeZone: 'UTC' }))
    .toMatchObject({ allowed: false, remaining: 0, reason: 'free_weekly_limit' });
});

test.each([0, 1, 5])('free weekly allowance is configurable: %i', freeWeeklyLimit => {
  expect(foodAiQuota({ tier: 'free', kind: 'photos', usage, clock, timeZone: 'UTC', freeWeeklyLimit }))
    .toMatchObject({ allowed: freeWeeklyLimit > 0, remaining: freeWeeklyLimit, reason: freeWeeklyLimit ? null : 'free_weekly_limit' });
});

test.each([['photos', 10], ['descriptions', 20]] as const)('Plus retains an independent %s cap of %i, including reserved attempts', (kind, cap) => {
  const used = { ...usage, daily: { ...usage.daily, photos: 10, descriptions: 20, [kind]: cap - 1 }, weekly: { ...usage.weekly, photos: 100 } };
  const options = { tier: 'plus' as const, kind, usage: used, clock, timeZone: 'UTC', freeWeeklyLimit: 0 };
  expect(foodAiQuota(options)).toEqual({ allowed: true, remaining: 1, resetsAt: '2026-10-31T00:00:00.000Z', reason: null });
  expect(foodAiQuota({ ...options, usage: { ...used, daily: { ...used.daily, [kind]: cap } } }))
    .toMatchObject({ allowed: false, remaining: 0, reason: 'daily_cap' });
  expect(foodAiQuota({ ...options, usage: { ...used, daily: { ...used.daily, [kind]: cap + 5 } } }).remaining).toBe(0);
});

test.each([
  ['UTC', '2026-11-01T23:59:59.999Z', false, '2026-11-02T00:00:00.000Z'],
  ['UTC', '2026-11-02T00:00:00.000Z', true, '2026-11-09T00:00:00.000Z'],
  ['America/Chicago', '2026-11-02T05:59:59.999Z', false, '2026-11-02T06:00:00.000Z'],
  ['America/Chicago', '2026-11-02T06:00:00.000Z', true, '2026-11-09T06:00:00.000Z'],
  ['America/Chicago', '2026-10-30T17:00:00Z', false, '2026-11-02T06:00:00.000Z'],
])('Monday weekly boundary in %s at %s', (timeZone, now, allowed, resetsAt) => {
  expect(foodAiQuota({ tier: 'free', kind: 'descriptions', usage: { ...usage, weekly: { ...usage.weekly, photos: 3 } }, clock: () => new Date(now), timeZone }))
    .toEqual({ allowed, remaining: allowed ? 3 : 0, resetsAt, reason: allowed ? null : 'free_weekly_limit' });
});

test.each([
  ['UTC', '2026-10-30T23:59:59.999Z', false, '2026-10-31T00:00:00.000Z'],
  ['UTC', '2026-10-31T00:00:00.000Z', true, '2026-11-01T00:00:00.000Z'],
  ['America/Chicago', '2026-10-31T04:59:59.999Z', false, '2026-10-31T05:00:00.000Z'],
  ['America/Chicago', '2026-10-31T05:00:00.000Z', true, '2026-11-01T05:00:00.000Z'],
])('Plus resets at local midnight in %s at %s', (timeZone, now, allowed, resetsAt) => {
  expect(foodAiQuota({ tier: 'plus', kind: 'photos', usage: { ...usage, daily: { ...usage.daily, photos: 10 } }, clock: () => new Date(now), timeZone }))
    .toEqual({ allowed, remaining: allowed ? 10 : 0, resetsAt, reason: allowed ? null : 'daily_cap' });
});

test.each([
  ['2026-03-08T06:00:00Z', '2026-03-09T05:00:00.000Z'],
  ['2026-11-01T05:00:00Z', '2026-11-02T06:00:00.000Z'],
])('daily reset spans Chicago DST at %s', (now, resetsAt) => {
  expect(foodAiQuota({ tier: 'plus', kind: 'photos', usage, clock: () => new Date(now), timeZone: 'America/Chicago' }).resetsAt).toBe(resetsAt);
});

test('weekly reset spans spring DST and a year boundary', () => {
  for (const [now, resetsAt] of [
    ['2026-03-02T06:00:00Z', '2026-03-09T05:00:00.000Z'],
    ['2026-12-31T18:00:00Z', '2027-01-04T06:00:00.000Z'],
  ]) expect(foodAiQuota({ tier: 'free', kind: 'photos', usage, clock: () => new Date(now), timeZone: 'America/Chicago' }).resetsAt).toBe(resetsAt);
});

test.each([-1, 1.5, NaN, Infinity])('invalid free allowance is rejected: %s', freeWeeklyLimit => {
  expect(() => foodAiQuota({ tier: 'free', kind: 'photos', usage, clock, timeZone: 'UTC', freeWeeklyLimit })).toThrow(RangeError);
});

test('a new daily bucket does not replenish the shared weekly free tries', () => {
  expect(foodAiQuota({ tier: 'free', kind: 'photos', usage: { ...usage, daily: { ...usage.daily, day: '2026-10-29' }, weekly: { ...usage.weekly, descriptions: 4 } }, clock, timeZone: 'UTC' }))
    .toMatchObject({ allowed: false, remaining: 0, reason: 'free_weekly_limit' });
});

test('invalid active counts, clock and timezone are rejected', () => {
  const options = { tier: 'plus' as const, kind: 'photos' as const, usage, clock, timeZone: 'UTC' };
  expect(() => foodAiQuota({ ...options, usage: { ...usage, daily: { ...usage.daily, photos: -1 } } })).toThrow(RangeError);
  expect(() => foodAiQuota({ ...options, tier: 'free', usage: { ...usage, weekly: { ...usage.weekly, descriptions: NaN } } })).toThrow(RangeError);
  expect(() => foodAiQuota({ ...options, clock: () => new Date(NaN) })).toThrow(RangeError);
  expect(() => foodAiQuota({ ...options, timeZone: 'Invalid/Timezone' })).toThrow(RangeError);
});

test('always-free features remain ungated: 988, export, data/account deletion, logging, check-ins, workouts, barcode, importer, basic trends, widgets/Live Activity', () => {
  // This step must remain unwired: zero production consumers protects every
  // always-free path without introducing a second entitlement policy here.
  const root = join(__dirname, '../src');
  const consumers = readdirSync(root, { recursive: true })
    .map(String)
    .filter(file => /\.[jt]sx?$/.test(file) && file !== 'features/food/ai/quota.ts')
    .filter(file => /\bfoodAiQuota\b|\b(?:from|import|require)\s*(?:\(\s*)?['"][^'"]*\bquota['"]/.test(readFileSync(join(root, file), 'utf8')));
  expect(consumers).toEqual([]);
});
