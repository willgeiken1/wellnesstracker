import { foodAiQuota, type FoodAiUsage } from '../src/features/food/ai/quota';
import { FREE_AI_FOOD_LOGS_PER_DAY } from '../src/features/food/ai/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const usage: FoodAiUsage = {
  daily: { day: '2026-10-30', photos: 0, descriptions: 0 },
};
const clock = () => new Date('2026-10-30T17:00:00Z');

test('one exported config sets the free daily allowance to two', () => {
  expect(FREE_AI_FOOD_LOGS_PER_DAY).toBe(2);
  expect(foodAiQuota({ tier: 'free', kind: 'photos', usage, clock, timeZone: 'UTC' }).remaining)
    .toBe(FREE_AI_FOOD_LOGS_PER_DAY);
});

test.each(['photos', 'descriptions'] as const)('free %s shares the daily Snap/Describe budget; checks never reserve', kind => {
  const used = Object.freeze({ daily: Object.freeze({ ...usage.daily, photos: 1 }) });
  expect(foodAiQuota({ tier: 'free', kind, usage: used, clock, timeZone: 'UTC' })).toEqual({
    allowed: true, remaining: FREE_AI_FOOD_LOGS_PER_DAY - 1, resetsAt: '2026-10-31T00:00:00.000Z', reason: null,
  });
  expect(used.daily.photos).toBe(1);
});

test.each([[1, 1], [2, 0], [0, 2], [3, 4]])('free cap hit at %i photos + %i descriptions blocks both kinds', (photos, descriptions) => {
  for (const kind of ['photos', 'descriptions'] as const) {
    expect(foodAiQuota({ tier: 'free', kind, usage: { daily: { ...usage.daily, photos, descriptions } }, clock, timeZone: 'UTC' }))
      .toEqual({ allowed: false, remaining: 0, resetsAt: '2026-10-31T00:00:00.000Z', reason: 'free_daily_limit' });
  }
});

test.each([['photos', 10], ['descriptions', 20]] as const)('Plus retains an independent %s cap of %i, including reserved attempts', (kind, cap) => {
  // Both counts exceed the free allowance; the other kind is already at its Plus cap.
  const used = { daily: { ...usage.daily, photos: 10, descriptions: 20, [kind]: cap - 1 } };
  const options = { tier: 'plus' as const, kind, usage: used, clock, timeZone: 'UTC' };
  expect(foodAiQuota(options)).toEqual({ allowed: true, remaining: 1, resetsAt: '2026-10-31T00:00:00.000Z', reason: null });
  expect(foodAiQuota({ ...options, usage: { daily: { ...used.daily, [kind]: cap } } }))
    .toMatchObject({ allowed: false, remaining: 0, reason: 'daily_cap' });
  expect(foodAiQuota({ ...options, usage: { daily: { ...used.daily, [kind]: cap + 5 } } }).remaining).toBe(0);
});

const boundaries = [
  ['UTC', '2026-10-30T23:59:59.999Z', false, '2026-10-31T00:00:00.000Z'],
  ['UTC', '2026-10-31T00:00:00.000Z', true, '2026-11-01T00:00:00.000Z'],
  ['America/Chicago', '2026-10-31T04:59:59.999Z', false, '2026-10-31T05:00:00.000Z'],
  ['America/Chicago', '2026-10-31T05:00:00.000Z', true, '2026-11-01T05:00:00.000Z'],
] as const;

describe.each(['free', 'plus'] as const)('%s local day rollover', tier => {
  test.each(boundaries)('resets at local midnight in %s at %s', (timeZone, now, allowed, resetsAt) => {
    const cap = tier === 'free' ? FREE_AI_FOOD_LOGS_PER_DAY : 10;
    expect(foodAiQuota({ tier, kind: 'photos', usage: { daily: { ...usage.daily, photos: cap } }, clock: () => new Date(now), timeZone }))
      .toEqual({ allowed, remaining: allowed ? cap : 0, resetsAt, reason: allowed ? null : tier === 'free' ? 'free_daily_limit' : 'daily_cap' });
  });
  test.each([
    ['2026-03-08T06:00:00Z', '2026-03-09T05:00:00.000Z'],
    ['2026-11-01T05:00:00Z', '2026-11-02T06:00:00.000Z'],
    ['2026-12-31T18:00:00Z', '2027-01-01T06:00:00.000Z'],
  ])('reset spans Chicago DST/year boundary at %s', (now, resetsAt) => {
    expect(foodAiQuota({ tier, kind: 'photos', usage, clock: () => new Date(now), timeZone: 'America/Chicago' }).resetsAt).toBe(resetsAt);
  });
});

test('a stale daily bucket replenishes the full shared free allowance', () => {
  expect(foodAiQuota({ tier: 'free', kind: 'descriptions', usage: { daily: { day: '2026-10-29', photos: 4, descriptions: 5 } }, clock, timeZone: 'UTC' }))
    .toMatchObject({ allowed: true, remaining: FREE_AI_FOOD_LOGS_PER_DAY, reason: null });
});

test.each([-1, 1.5, NaN, Infinity])('invalid active counts are rejected: %s', invalid => {
  for (const tier of ['free', 'plus'] as const) {
    for (const kind of ['photos', 'descriptions'] as const) {
      expect(() => foodAiQuota({ tier, kind, usage: { daily: { ...usage.daily, [kind]: invalid } }, clock, timeZone: 'UTC' })).toThrow(RangeError);
    }
  }
});

test('invalid clock and timezone are rejected', () => {
  const options = { tier: 'free' as const, kind: 'photos' as const, usage, clock, timeZone: 'UTC' };
  expect(() => foodAiQuota({ ...options, clock: () => new Date(NaN) })).toThrow(RangeError);
  expect(() => foodAiQuota({ ...options, timeZone: 'Invalid/Timezone' })).toThrow(RangeError);
});

test('always-free features remain ungated: 988, export, data/account deletion, logging, check-ins, workouts, barcode, importer, basic/advanced trends, plain workout summary, widgets/Live Activity', () => {
  // Only AI-food may consume this quota. Safety, ownership and core paths stay free.
  const root = join(__dirname, '../src');
  const consumers = readdirSync(root, { recursive: true })
    .map(String)
    .filter(file => /\.[jt]sx?$/.test(file) && file !== 'features/food/ai/quota.ts')
    .filter(file => /\bfoodAiQuota\b|\b(?:from|import|require)\s*(?:\(\s*)?['"][^'"]*\bquota['"]/.test(readFileSync(join(root, file), 'utf8')));
  // pw-04 wires quota exclusively in the AI-food service; core/free features cannot consume it.
  expect(consumers).toEqual(['features/food/ai/service.ts']);
});
