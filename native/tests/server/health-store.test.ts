import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { localDatabase, sqliteClient } from './sqlite';
import { Repository, wipeAllOwners } from '../../src/data/repository';
import { HEALTH_SCHEMA, moveHealthRows } from '../../src/data/health-store';
import { importStart, importWeights, refreshWeights } from '../../src/features/health/weights';
import { saveWeighIn } from '../../src/features/body/model';
import { OWNER_A, OWNER_B } from '../../fixtures/sync';

/* Review of #175: Health readings must not sit in the main database, which iOS backs up to iCloud. */
const SAMPLE = 'a1b2c3d4-0000-4000-8000-0000000000fe';
const NOW = new Date(2026, 10, 16, 12);
function healthStore(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec(`PRAGMA journal_mode = WAL; ${HEALTH_SCHEMA};`);
  return { sqlite, db: drizzle(sqliteClient(sqlite)) };
}
const mainWeighIns = (sqlite: DatabaseSync) => sqlite.prepare('SELECT id, source FROM weigh_ins').all() as { id: string; source: string }[];
const healthWeighIns = (sqlite: DatabaseSync) => sqlite.prepare('SELECT id, source, owner_id FROM weigh_ins').all() as { id: string; source: string; owner_id: string }[];

test('a weight imported from Apple Health is kept in the Health store, and a typed weight stays in the main database', async () => {
  const main = await localDatabase(), health = healthStore();
  try {
    const repo = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, health.db);
    expect(importWeights(repo, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW)).toBe(1);
    const typed = saveWeighIn(repo, 80, 'kg', '2026-11-16');
    expect(mainWeighIns(main.sqlite)).toEqual([{ id: typed.id, source: 'app' }]);
    expect(healthWeighIns(health.sqlite)).toEqual([{ id: SAMPLE, source: 'healthkit', owner_id: OWNER_A }]);
    // Reads see both, in id order, and the Health one is never queued for sync.
    expect(repo.list('weigh_ins').map(r => r.id)).toEqual([typed.id, SAMPLE].sort());
    expect(repo.get('weigh_ins', SAMPLE)?.data.weight_kg).toBe(81.25);
    expect(repo.pending().map(p => p.row.id)).toEqual([typed.id]);
    // Removing it (Apple Health no longer has it) leaves a tombstone in the Health store only.
    repo.remove('weigh_ins', SAMPLE);
    expect(repo.list('weigh_ins').map(r => r.id)).toEqual([typed.id]);
    expect(healthWeighIns(health.sqlite)).toHaveLength(1);
    expect(mainWeighIns(main.sqlite)).toHaveLength(1);
    // Re-imported later, it comes back from the Health store.
    expect(importWeights(repo, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW)).toBe(1);
    expect(repo.get('weigh_ins', SAMPLE)?.deleted_at).toBeNull();
  } finally { main.sqlite.close(); health.sqlite.close(); }
});

test('Health weigh-ins an earlier version saved move out of the main file and leave no trace in it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'insight-health-'));
  try {
    const mainPath = join(dir, 'insight.db');
    const main = await localDatabase(mainPath), health = healthStore(join(dir, 'insight-health.db'));
    // What the previous version did: Health rows straight into the main database.
    const old = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(old, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    const typed = saveWeighIn(old, 80, 'kg', '2026-11-16');
    const other = new Repository(main.db, OWNER_B, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(other, [{ id: 'b1b2c3d4-0000-4000-8000-0000000000fe', at: new Date(2026, 10, 14, 7), kg: 70 }], NOW);
    expect(mainWeighIns(main.sqlite)).toHaveLength(3);

    expect(moveHealthRows(main.db, health.db)).toBe(2);
    expect(mainWeighIns(main.sqlite)).toEqual([{ id: typed.id, source: 'app' }]);
    expect(healthWeighIns(health.sqlite).map(r => r.owner_id).sort()).toEqual([OWNER_A, OWNER_B].sort());
    // Running again moves nothing and changes nothing.
    expect(moveHealthRows(main.db, health.db)).toBe(0);
    expect(healthWeighIns(health.sqlite)).toHaveLength(2);

    const repo = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, health.db);
    expect(repo.list('weigh_ins').map(r => r.id)).toEqual([typed.id, SAMPLE].sort());
    main.sqlite.close();
    // The main file and its log no longer hold the Health reading's id anywhere, freed pages included.
    for (const file of [mainPath, `${mainPath}-wal`]) if (existsSync(file)) expect(readFileSync(file).includes(SAMPLE)).toBe(false);
    health.sqlite.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a copy left in the main database by an interrupted move is never read twice', async () => {
  const main = await localDatabase(), health = healthStore();
  try {
    const old = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(old, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    const repo = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, health.db);
    // Not moved yet: the stale copy is not shown, and Apple Health fills the Health store again.
    expect(repo.list('weigh_ins')).toEqual([]);
    importWeights(repo, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    expect(repo.list('weigh_ins').map(r => r.id)).toEqual([SAMPLE]);
    expect(moveHealthRows(main.db, health.db)).toBe(1);
    expect(repo.list('weigh_ins').map(r => r.id)).toEqual([SAMPLE]);
  } finally { main.sqlite.close(); health.sqlite.close(); }
});

test('signing out or deleting the account erases that account\'s Health weigh-ins, and the full reset erases all', async () => {
  const main = await localDatabase(), health = healthStore();
  try {
    const a = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, health.db);
    const b = new Repository(main.db, OWNER_B, main.repo.device, randomUUID, main.repo.syncFlags, health.db);
    importWeights(a, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    importWeights(b, [{ id: 'b1b2c3d4-0000-4000-8000-0000000000fe', at: new Date(2026, 10, 14, 7), kg: 70 }], NOW);
    a.wipe();
    expect(healthWeighIns(health.sqlite).map(r => r.owner_id)).toEqual([OWNER_B]);
    wipeAllOwners(main.db, health.db);
    expect(healthWeighIns(health.sqlite)).toEqual([]);
  } finally { main.sqlite.close(); health.sqlite.close(); }
});

test('a copy left by an interrupted move never brings back a reading removed since', async () => {
  const main = await localDatabase(), health = healthStore();
  try {
    const old = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(old, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    // The move did not run; Apple Health later drops the reading and the refresh removes it from the Health store.
    const repo = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, health.db);
    importWeights(repo, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    repo.remove('weigh_ins', SAMPLE);
    expect(moveHealthRows(main.db, health.db)).toBe(1);
    expect(repo.get('weigh_ins', SAMPLE)?.deleted_at).not.toBeNull();
    expect(repo.list('weigh_ins')).toEqual([]);
    expect(mainWeighIns(main.sqlite)).toEqual([]);
  } finally { main.sqlite.close(); health.sqlite.close(); }
});

test('the Health store has exactly the main database\'s weigh-in columns, so a later migration cannot leave it behind', async () => {
  const main = await localDatabase(), health = healthStore();
  try {
    const columns = (sqlite: DatabaseSync) => (sqlite.prepare('PRAGMA table_info(weigh_ins)').all() as { name: string; type: string; notnull: number; pk: number }[])
      .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }));
    expect(columns(health.sqlite)).toEqual(columns(main.sqlite));
  } finally { main.sqlite.close(); health.sqlite.close(); }
});

test('if iOS clears the Health store, the next refresh reads back as far as earlier reads did, not just two years', async () => {
  const main = await localDatabase(), lost = healthStore();
  try {
    const old = { id: SAMPLE, at: new Date(2024, 0, 10, 7), kg: 79.5 };
    const reads: Date[] = [];
    const apple = { access: async () => 'asked' as const, weights: async (since: Date) => { reads.push(since); return [old].filter(s => s.at >= since); } } as unknown as Parameters<typeof refreshWeights>[1];
    const first = new Date(2025, 11, 20, 9);
    let repo = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, lost.db);
    expect(await refreshWeights(repo, apple, first)).toBe(1);
    // A year later the reading is past the usual two-year window, and iOS has cleared the Health store.
    const later = new Date(2026, 11, 20, 9), fresh = healthStore();
    expect(old.at < importStart(later)).toBe(true);
    repo = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, fresh.db);
    expect(await refreshWeights(repo, apple, later)).toBe(1);
    expect(reads[1]).toEqual(importStart(first));
    expect(repo.get('weigh_ins', SAMPLE)?.data.weight_kg).toBe(79.5);
    // Only the day is kept in the main database, never the reading; signing out clears it.
    expect(JSON.stringify(main.sqlite.prepare("SELECT * FROM sync_state WHERE key = 'health_weights_from'").all())).not.toContain('79.5');
    repo.wipe();
    expect(repo.healthWeightsFrom()).toBeUndefined();
    fresh.sqlite.close();
  } finally { main.sqlite.close(); lost.sqlite.close(); }
});

test('readings moved from an earlier version are read back after iOS clears the Health store, however old', async () => {
  // Codex review, Nov 17: the move must record how far back the moved readings go.
  const main = await localDatabase(), health = healthStore();
  try {
    const aged = { id: SAMPLE, at: new Date(2023, 0, 10, 7), kg: 80.5 };
    const old = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(old, [aged], new Date(2023, 0, 11, 12));
    const other = new Repository(main.db, OWNER_B, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(other, [{ id: 'b1b2c3d4-0000-4000-8000-0000000000fe', at: new Date(2026, 10, 14, 7), kg: 70 }], NOW);
    expect(moveHealthRows(main.db, health.db)).toBe(2);
    expect(new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, health.db).healthWeightsFrom()).toBe('2023-01-10');
    expect(new Repository(main.db, OWNER_B, main.repo.device, randomUUID, main.repo.syncFlags, health.db).healthWeightsFrom()).toBe('2026-11-14');
    // iOS clears the Health store; the next refresh still reaches back to January 2023.
    expect(aged.at < importStart(NOW)).toBe(true);
    const fresh = healthStore(), reads: Date[] = [];
    const apple = { access: async () => 'asked' as const, weights: async (since: Date) => { reads.push(since); return [aged].filter(s => s.at >= since); } } as unknown as Parameters<typeof refreshWeights>[1];
    const repo = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags, fresh.db);
    expect(await refreshWeights(repo, apple, NOW)).toBe(1);
    expect(reads[0]).toEqual(new Date(2023, 0, 10));
    expect(repo.get('weigh_ins', SAMPLE)?.data.weight_kg).toBe(80.5);
    fresh.sqlite.close();
  } finally { main.sqlite.close(); health.sqlite.close(); }
});

/* Cole's #199 review: the clean-up's finish is recorded apart from whether Health rows remain, so a run cut off
   after the delete is still finished next launch. `flaky` is the main or Health database with chosen statements failing. */
const flaky = (sqlite: DatabaseSync, fails: (query: string) => boolean) => {
  const client = sqliteClient(sqlite);
  return drizzle({ prepareSync: (query: string) => { if (fails(query)) throw new Error('synthetic failure'); return client.prepareSync(query); } } as unknown as Parameters<typeof drizzle>[0]);
};
const cleaned = (sqlite: DatabaseSync) => sqlite.prepare("SELECT value FROM sync_state WHERE owner_id = 'device' AND key = 'health_moved'").get();
const holds = (path: string, text: string) => [path, `${path}-wal`].some(file => existsSync(file) && readFileSync(file).includes(text));

test('a clean-up cut off after the delete finishes rewriting the main file on the next launch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'insight-health-'));
  try {
    const mainPath = join(dir, 'insight.db');
    const main = await localDatabase(mainPath), health = healthStore(join(dir, 'insight-health.db'));
    const old = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(old, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    // The app is stopped right after the delete, before the log is folded in and the file rebuilt.
    expect(() => moveHealthRows(flaky(main.sqlite, q => q.includes('wal_checkpoint')), health.db)).toThrow();
    expect(mainWeighIns(main.sqlite)).toEqual([]);
    expect(cleaned(main.sqlite)).toBeUndefined();
    expect(holds(mainPath, SAMPLE)).toBe(true);
    // Next launch: no Health rows are left, but the clean-up has not finished, so it runs to the end.
    expect(moveHealthRows(main.db, health.db)).toBe(0);
    expect(cleaned(main.sqlite)).toBeDefined();
    expect(healthWeighIns(health.sqlite)).toEqual([{ id: SAMPLE, source: 'healthkit', owner_id: OWNER_A }]);
    main.sqlite.close();
    expect(holds(mainPath, SAMPLE)).toBe(false);
    health.sqlite.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a finished clean-up is not run again on later launches', async () => {
  const main = await localDatabase(), health = healthStore();
  try {
    const old = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(old, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    expect(moveHealthRows(main.db, health.db)).toBe(1);
    const statements: string[] = [];
    const watched = flaky(main.sqlite, q => { statements.push(q); return false; });
    expect(moveHealthRows(watched, health.db)).toBe(0);
    expect(moveHealthRows(watched, health.db)).toBe(0);
    // Only the check for the finished mark: no copy, delete or file rebuild.
    expect(statements).toHaveLength(2);
    expect(statements.some(q => /VACUUM|DELETE|INSERT/i.test(q))).toBe(false);
  } finally { main.sqlite.close(); health.sqlite.close(); }
});

test('a clean-up that keeps failing is left for the next launch and never loses or repeats a reading', async () => {
  const main = await localDatabase(), health = healthStore();
  try {
    const old = new Repository(main.db, OWNER_A, main.repo.device, randomUUID, main.repo.syncFlags);
    importWeights(old, [{ id: SAMPLE, at: new Date(2026, 10, 15, 7), kg: 81.25 }], NOW);
    const typed = saveWeighIn(old, 80, 'kg', '2026-11-16');
    // The Health store can't be written: the main database must keep the reading rather than delete it.
    const stuck = flaky(health.sqlite, q => /^\s*INSERT/i.test(q));
    for (let launch = 0; launch < 3; launch++) expect(() => moveHealthRows(main.db, stuck)).toThrow();
    expect(mainWeighIns(main.sqlite).map(r => r.id).sort()).toEqual([typed.id, SAMPLE].sort());
    expect(healthWeighIns(health.sqlite)).toEqual([]);
    expect(cleaned(main.sqlite)).toBeUndefined();
    // Once the Health store works again, the reading moves once and the typed weight stays.
    expect(moveHealthRows(main.db, health.db)).toBe(1);
    expect(mainWeighIns(main.sqlite)).toEqual([{ id: typed.id, source: 'app' }]);
    expect(healthWeighIns(health.sqlite)).toEqual([{ id: SAMPLE, source: 'healthkit', owner_id: OWNER_A }]);
  } finally { main.sqlite.close(); health.sqlite.close(); }
});
