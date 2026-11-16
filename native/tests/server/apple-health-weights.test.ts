import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { dailyWeights, saveWeighIn } from '../../src/features/body/model';
import { clearHealthWeighIns, healthWeighIns } from '../../src/features/health/live-weights';
import type { HealthAccess, HealthSource, WeightSample } from '../../src/features/health/source';
import { IMPORT_DAYS, forgetStoredWeights, importStart, refreshWeights, toWeighIns } from '../../src/features/health/weights';

// Made-up readings only.
const now = new Date(2026, 10, 12, 9, 0);
const sample = (id: string, day: number, kg: number): WeightSample => ({ id, at: new Date(2026, 10, day, 7, 30), kg });
const A = 'AAAAAAAA-0000-4000-8000-000000000001', B = 'AAAAAAAA-0000-4000-8000-000000000002';
const source = (access: HealthAccess, samples: WeightSample[]): HealthSource & { since?: Date } => ({
  access: async () => access, request: async () => {}, steps: async () => 0, sleep: async () => [],
  async weights(since) { this.since = since; return samples; },
});
// The database row as the earlier import wrote it, to check it is cleared.
const storedHealthRow = (repo: Repository, id: string, kg: number) =>
  repo.save('weigh_ins', { day: '2026-11-01', weight_kg: kg, entered_value: kg, entered_unit: 'kg', source: 'healthkit' }, id.toLowerCase());

afterEach(() => clearHealthWeighIns());

test('Apple Health weights are held in memory for the account and never written to the database', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, fixture.owner, fixture.device, randomUUID);
    expect(await refreshWeights(repo, source('asked', [sample(A, 10, 80.4), sample(B, 11, 80.1)]), now)).toBe(2);
    expect(healthWeighIns(repo.owner).map(row => row.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ day: '2026-11-10', weight_kg: 80.4, source: 'healthkit' }),
      expect.objectContaining({ day: '2026-11-11', weight_kg: 80.1, source: 'healthkit' }),
    ]));
    expect(dailyWeights([...healthWeighIns(repo.owner)])).toHaveLength(2);
    expect(repo.list('weigh_ins', true)).toHaveLength(0);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM weigh_ins').get()).toEqual({ n: 0 });
    expect(repo.hasUnsynced()).toBe(false);
    // Another account never sees them.
    expect(healthWeighIns('someone-else')).toHaveLength(0);
  } finally { sqlite.close(); }
});

test('weigh-ins saved by the earlier import are cleared down to an empty marker, typed ones stay, and nothing syncs', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, fixture.owner, fixture.device, randomUUID);
    const typed = saveWeighIn(repo, 81, 'kg', '2026-11-09');
    const before = repo.pending().length;
    storedHealthRow(repo, A, 80.4); storedHealthRow(repo, B, 80.1);
    expect(forgetStoredWeights(repo)).toBe(2);
    expect(repo.list('weigh_ins').map(row => row.id)).toEqual([typed.id]);
    const left = sqlite.prepare("SELECT day, weight_kg, entered_value FROM weigh_ins WHERE source = 'healthkit'").all();
    expect(left).toEqual([{ day: null, weight_kg: null, entered_value: null }, { day: null, weight_kg: null, entered_value: null }]);
    expect(repo.pending()).toHaveLength(before);
    expect(forgetStoredWeights(repo)).toBe(0);
  } finally { sqlite.close(); }
});

test('every refresh clears stored Health rows, even when Apple Health is off or unavailable', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, 'guest', fixture.device, randomUUID);
    storedHealthRow(repo, A, 80.4);
    expect(await refreshWeights(repo, null, now)).toBe(0);
    expect(repo.list('weigh_ins')).toHaveLength(0);
  } finally { sqlite.close(); }
});

test('each read replaces the last, so a reading removed from Apple Health leaves Insight too', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, 'guest', fixture.device, randomUUID);
    await refreshWeights(repo, source('asked', [sample(A, 10, 80.4), sample(B, 11, 80.1)]), now);
    expect(await refreshWeights(repo, source('asked', [sample(B, 11, 80.1)]), now)).toBe(1);
    expect(healthWeighIns(repo.owner).map(row => row.id)).toEqual([B.toLowerCase()]);
    expect(await refreshWeights(repo, source('asked', []), now)).toBe(0);
    expect(healthWeighIns(repo.owner)).toHaveLength(0);
  } finally { sqlite.close(); }
});

test('readings that make no sense are left out, and a repeated id counts once', () => {
  const future = { id: B, at: new Date(2027, 0, 1), kg: 80 };
  expect(toWeighIns('guest', [sample(A, 10, 0), sample(A, 10, NaN), sample(A, 10, 900), sample('', 10, 80), future], now)).toHaveLength(0);
  expect(toWeighIns('guest', [sample(A, 10, 80), sample(A.toLowerCase(), 10, 80)], now)).toHaveLength(1);
});

test('refresh never reads before the person has been asked, and reaches back two years after', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, fixture.owner, fixture.device, randomUUID);
    const notAsked = source('ask', [sample(A, 10, 80.4)]);
    expect(await refreshWeights(repo, notAsked, now)).toBe(0);
    expect(notAsked.since).toBeUndefined();
    const asked = source('asked', [sample(A, 10, 80.4)]);
    expect(await refreshWeights(repo, asked, now)).toBe(1);
    expect(asked.since).toEqual(importStart(now));
    expect([asked.since!.getHours(), asked.since!.getMinutes()]).toEqual([0, 0]);
    expect(Math.round((new Date(2026, 10, 12).getTime() - asked.since!.getTime()) / 86_400_000)).toBe(IMPORT_DAYS);
  } finally { sqlite.close(); }
});

test('a read that finishes after the page or account has gone keeps nothing', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, 'guest', fixture.device, randomUUID);
    let live = true;
    const slow: HealthSource = { access: async () => 'asked', request: async () => {}, steps: async () => 0, sleep: async () => [], weights: async () => { live = false; return [sample(A, 10, 80.4)]; } };
    expect(await refreshWeights(repo, slow, now, () => live)).toBe(0);
    expect(healthWeighIns(repo.owner)).toHaveLength(0);
  } finally { sqlite.close(); }
});
