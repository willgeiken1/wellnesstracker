import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { dailyWeights, saveWeighIn } from '../../src/features/body/model';
import type { HealthAccess, HealthSource, WeightSample } from '../../src/features/health/source';
import { IMPORT_DAYS, importStart, importWeights, refreshWeights } from '../../src/features/health/weights';

// Made-up readings only.
const now = new Date(2026, 10, 12, 9, 0);
const sample = (id: string, day: number, kg: number): WeightSample => ({ id, at: new Date(2026, 10, day, 7, 30), kg });
const A = 'AAAAAAAA-0000-4000-8000-000000000001', B = 'AAAAAAAA-0000-4000-8000-000000000002';
const source = (access: HealthAccess, samples: WeightSample[]): HealthSource & { since?: Date } => ({
  access: async () => access, request: async () => {}, steps: async () => 0, sleep: async () => [], activeEnergy: async () => 0, exerciseMinutes: async () => 0,
  async weights(since) { this.since = since; return samples; },
});

test('Apple Health weights land as local weigh-ins that are never queued for sync', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, fixture.owner, fixture.device, randomUUID);
    expect(importWeights(repo, [sample(A, 10, 80.4), sample(B, 11, 80.1)], now)).toBe(2);
    const rows = repo.list('weigh_ins');
    expect(rows.map(row => row.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ day: '2026-11-10', weight_kg: 80.4, source: 'healthkit' }),
      expect.objectContaining({ day: '2026-11-11', weight_kg: 80.1, source: 'healthkit' }),
    ]));
    expect(repo.hasUnsynced()).toBe(false);
    expect(dailyWeights(rows)).toHaveLength(2);
  } finally { sqlite.close(); }
});

test('a second import adds nothing new', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, fixture.owner, fixture.device, randomUUID);
    importWeights(repo, [sample(A, 10, 80.4)], now);
    expect(importWeights(repo, [sample(A, 10, 80.4), sample(B, 11, 80.1)], now)).toBe(1);
    expect(importWeights(repo, [sample(A, 10, 80.4), sample(B, 11, 80.1)], now)).toBe(0);
    expect(repo.list('weigh_ins')).toHaveLength(2);
  } finally { sqlite.close(); }
});

test('a reading removed from Apple Health leaves Insight too, and returns if it comes back; typed weigh-ins are untouched', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, 'guest', fixture.device, randomUUID);
    const typed = saveWeighIn(repo, 81, 'kg', '2026-11-09');
    expect(await refreshWeights(repo, source('asked', [sample(A, 10, 80.4), sample(B, 11, 80.1)]), now)).toBe(2);
    expect(await refreshWeights(repo, source('asked', [sample(B, 11, 80.1)]), now)).toBe(0);
    expect(repo.list('weigh_ins').map(row => row.id).sort()).toEqual([B.toLowerCase(), typed.id].sort());
    expect(await refreshWeights(repo, source('asked', [sample(A, 10, 80.4), sample(B, 11, 80.1)]), now)).toBe(1);
    expect(repo.list('weigh_ins')).toHaveLength(3);
  } finally { sqlite.close(); }
});

test('readings that make no sense are skipped', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, fixture.owner, fixture.device, randomUUID);
    const future = { id: B, at: new Date(2027, 0, 1), kg: 80 };
    expect(importWeights(repo, [sample(A, 10, 0), sample(A, 10, NaN), sample(A, 10, 900), sample('', 10, 80), future], now)).toBe(0);
    expect(repo.list('weigh_ins')).toHaveLength(0);
  } finally { sqlite.close(); }
});

test('refresh never reads before the person has been asked, and reaches back two years after', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, fixture.owner, fixture.device, randomUUID);
    const notAsked = source('ask', [sample(A, 10, 80.4)]);
    expect(await refreshWeights(repo, notAsked, now)).toBe(0);
    expect(notAsked.since).toBeUndefined();
    expect(await refreshWeights(repo, null, now)).toBe(0);
    const asked = source('asked', [sample(A, 10, 80.4)]);
    expect(await refreshWeights(repo, asked, now)).toBe(1);
    expect(asked.since).toEqual(importStart(now));
    expect([asked.since!.getHours(), asked.since!.getMinutes()]).toEqual([0, 0]);
    expect(Math.round((new Date(2026, 10, 12).getTime() - asked.since!.getTime()) / 86_400_000)).toBe(IMPORT_DAYS);
  } finally { sqlite.close(); }
});

test('an empty read removes nothing, since sharing turned off looks the same as nothing there', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, 'guest', fixture.device, randomUUID);
    await refreshWeights(repo, source('asked', [sample(A, 10, 80.4), sample(B, 11, 80.1)]), now);
    expect(await refreshWeights(repo, source('asked', []), now)).toBe(0);
    expect(repo.list('weigh_ins')).toHaveLength(2);
  } finally { sqlite.close(); }
});

test('a reading from early on the first day of the window is read and kept, not dropped', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, 'guest', fixture.device, randomUUID);
    const start = importStart(now), early = { id: A, at: new Date(start.getTime() + 60_000), kg: 81 };
    const reads = (since: Date) => [early, sample(B, 11, 80.1)].filter(item => item.at >= since);
    const honest: HealthSource = { access: async () => 'asked', request: async () => {}, steps: async () => 0, sleep: async () => [], activeEnergy: async () => 0, exerciseMinutes: async () => 0, weights: async since => reads(since) };
    expect(await refreshWeights(repo, honest, now)).toBe(2);
    expect(await refreshWeights(repo, honest, now)).toBe(0);
    expect(repo.list('weigh_ins')).toHaveLength(2);
  } finally { sqlite.close(); }
});

test('a read that finishes after the page or account has gone writes nothing', async () => {
  const { db, repo: fixture, sqlite } = await localDatabase();
  try {
    const repo = new Repository(db, 'guest', fixture.device, randomUUID);
    let live = true;
    const slow: HealthSource = { access: async () => 'asked', request: async () => {}, steps: async () => 0, sleep: async () => [], activeEnergy: async () => 0, exerciseMinutes: async () => 0, weights: async () => { live = false; return [sample(A, 10, 80.4)]; } };
    expect(await refreshWeights(repo, slow, now, () => live)).toBe(0);
    expect(repo.list('weigh_ins')).toHaveLength(0);
  } finally { sqlite.close(); }
});
