import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { sqliteClient } from './sqlite';
import migrations from '../../src/data/migrations';
import { Repository } from '../../src/data/repository';
import { createPhoneBackup } from '../../src/phone-only/backup';
import { commitImport, commitPendingAccountImport, nativeBackup, nativeBackupPlan, previewImport, restoreNativeLocal } from '../../src/features/importer/local';
import { DEVICE_A } from '../../fixtures/sync';

/** Photo files are kept in their own test; this restore holds no photo addresses. */
const noPhotos = { names: () => null, settle: () => {} };
const ids = { custom: '30000000-0000-4000-8000-000000000011', plan: '30000000-0000-4000-8000-000000000012', pause: '30000000-0000-4000-8000-000000000013', session: '30000000-0000-4000-8000-000000000014' };
async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  const db = drizzle(sqliteClient(sqlite));
  await migrate(db, migrations);
  let n = 100;
  const repo = new Repository(db, 'guest', DEVICE_A, () => `30000000-0000-4000-8000-000000000${n++}`);
  return { sqlite, repo };
}

test('a Replace restore from this app\'s own backup keeps its custom exercises, split and breaks', async () => {
  const { sqlite, repo } = await setup();
  try {
    repo.save('custom_exercises', { name: 'Fixture press' }, ids.custom);
    repo.save('plans', { mode: 'fixed', days_per_week: 4 }, ids.plan);
    repo.save('pauses', { start_day: '2026-01-02', end_day: '2026-01-09' }, ids.pause);
    repo.save('sessions', {}, ids.session);
    const backup = nativeBackup(JSON.parse(createPhoneBackup(repo)))!;
    const plan = nativeBackupPlan(backup);
    expect(plan.rows.map(r => r.table)).toEqual(expect.arrayContaining(['custom_exercises', 'plans', 'pauses', 'sessions']));
    commitImport(repo, previewImport(repo, plan, 'replace', true), true, true);
    expect(repo.get('custom_exercises', ids.custom)?.deleted_at).toBeNull();
    expect(repo.get('plans', ids.plan)?.data.days_per_week).toBe(4);
    expect(repo.get('pauses', ids.pause)?.data.end_day).toBe('2026-01-09');
    expect(repo.get('sessions', ids.session)?.deleted_at).toBeNull();
  } finally { sqlite.close(); }
});

test('a web app import still refuses the tables only this app writes', async () => {
  const { sqlite, repo } = await setup();
  try {
    const plan = { version: 1 as const, rows: [{ table: 'plans', id: ids.plan, data: { mode: 'fixed' } }], issues: [], unmapped: [], legacy: {} };
    expect(() => previewImport(repo, plan, 'merge')).toThrow('Invalid import table.');
  } finally { sqlite.close(); }
});

test('Replace puts the file\'s phone-side details back over the phone\'s, and a merge keeps the phone\'s', async () => {
  const { sqlite, repo } = await setup();
  try {
    const backup = { format: 'insight-phone-only' as const, version: 1 as const, rows: {}, local: { timer: { seconds: 90 }, 'unilateral:fixture': true, pwaImportedIds: ['x'], foodAi: { synthetic: true } } };
    repo.localSave('timer', { seconds: 30 });
    repo.localSave('unilateral:fixture', false);
    repo.localSave('pwaImportedIds', ['kept']);
    restoreNativeLocal(repo, backup, new Set(), 'merge', noPhotos);
    expect(repo.localGet('timer')).toEqual({ seconds: 30 });
    expect(repo.localGet('unilateral:fixture')).toBe(false);
    restoreNativeLocal(repo, backup, new Set(), 'replace', noPhotos);
    expect(repo.localGet('timer')).toEqual({ seconds: 90 });
    expect(repo.localGet('unilateral:fixture')).toBe(true);
    // The importer's own bookkeeping and AI photos are never taken from the file.
    expect(repo.localGet('pwaImportedIds')).toEqual(['kept']);
    expect(repo.localGet('foodAi')).toBeUndefined();
  } finally { sqlite.close(); }
});

test('a backup restored while signed out follows the first account with its custom exercises, split and breaks', async () => {
  const { sqlite, repo: guest } = await setup();
  try {
    const db = drizzle(sqliteClient(sqlite));
    let n = 500;
    const account = new Repository(db, '20000000-0000-4000-8000-000000000001', DEVICE_A, () => `30000000-0000-4000-8000-000000000${n++}`);
    const from = new Repository(db, 'guest', DEVICE_A, () => '30000000-0000-4000-8000-000000000099');
    from.save('custom_exercises', { name: 'Fixture press' }, ids.custom);
    from.save('plans', { mode: 'fixed', days_per_week: 4 }, ids.plan);
    from.save('pauses', { start_day: '2026-01-02', end_day: '2026-01-09' }, ids.pause);
    const plan = nativeBackupPlan(nativeBackup(JSON.parse(createPhoneBackup(from)))!);
    commitImport(guest, previewImport(guest, plan, 'merge', true), true);
    expect(commitPendingAccountImport(guest, account)).toBe(3);
    expect(account.get('custom_exercises', ids.custom)?.data.name).toBe('Fixture press');
    expect(account.get('plans', ids.plan)?.data.days_per_week).toBe(4);
    expect(account.get('pauses', ids.pause)?.data.end_day).toBe('2026-01-09');
    // It goes once.
    expect(guest.localGet('pwaPendingAccountPlan')).toBeNull();
    expect(commitPendingAccountImport(guest, account)).toBeNull();
  } finally { sqlite.close(); }
});

test('a merge adds the records of a water, routine or body history that only the file has, and keeps the phone\'s own', async () => {
  const { sqlite, repo } = await setup();
  try {
    const drink = (id: string, oz: number) => ({ id, c: 'glass', name: 'Glass', oz, icon: 'glass', at: 1 });
    repo.localSave('foodWater', { v: 1, unit: 'ml', goal: 3, containers: [], log: { '2026-01-10': [drink('w2', 8)] } });
    repo.localSave('progressBodyFat', [{ day: '2026-01-10', pct: 20 }]);
    repo.localSave('routines', { v: 1, routines: [{ id: 'r1', name: 'Morning' }], hidden: [], items: [{ id: 'i1', name: 'Fixture vitamin' }], log: { '2026-01-10': { i1: 'd' } } });
    const backup = { format: 'insight-phone-only' as const, version: 1 as const, rows: {}, local: {
      foodWater: { v: 1, unit: 'oz', goal: 2, containers: [], log: { '2026-01-09': [drink('w1', 16)], '2026-01-10': [drink('w2', 99), drink('w3', 12)] } },
      progressBodyFat: [{ day: '2026-01-09', pct: 21 }, { day: '2026-01-10', pct: 25 }],
      routines: { v: 1, routines: [{ id: 'r1', name: 'Renamed' }, { id: 'r2', name: 'Evening' }], hidden: [], items: [{ id: 'i2', name: 'Fixture tea' }],
        log: { '2026-01-09': { i1: 'd' }, '2026-01-10': { i1: 's', i2: 'd' } } },
    } };
    restoreNativeLocal(repo, backup, new Set(), 'merge', noPhotos);
    expect(repo.localGet('foodWater')).toEqual({ v: 1, unit: 'ml', goal: 3, containers: [],
      log: { '2026-01-10': [drink('w2', 8), drink('w3', 12)], '2026-01-09': [drink('w1', 16)] } });
    expect(repo.localGet('progressBodyFat')).toEqual([{ day: '2026-01-10', pct: 20 }, { day: '2026-01-09', pct: 21 }]);
    expect(repo.localGet('routines')).toEqual({ v: 1, routines: [{ id: 'r1', name: 'Morning' }, { id: 'r2', name: 'Evening' }], hidden: [],
      items: [{ id: 'i1', name: 'Fixture vitamin' }, { id: 'i2', name: 'Fixture tea' }],
      log: { '2026-01-10': { i1: 'd', i2: 'd' }, '2026-01-09': { i1: 'd' } } });
  } finally { sqlite.close(); }
});

test('a backup restored while signed out brings its phone-side details to the first account, but not its photo addresses', async () => {
  const { sqlite, repo: guest } = await setup();
  try {
    const db = drizzle(sqliteClient(sqlite));
    const account = new Repository(db, '20000000-0000-4000-8000-000000000002', DEVICE_A, () => '30000000-0000-4000-8000-000000000777');
    const backup = { format: 'insight-phone-only' as const, version: 1 as const, rows: {}, local: {
      progressNeck: [{ day: '2026-01-09', cm: 38 }], timer: { seconds: 90 },
      progressPhotos: [{ id: 'p1', uri: 'file:///docs/progress-photos/p1.jpg' }], profilePhoto: 'file:///docs/profile-photo/a1.jpg',
    } };
    const plan = nativeBackupPlan(backup);
    commitImport(guest, previewImport(guest, plan, 'merge', true), true);
    restoreNativeLocal(guest, backup, new Set(), 'merge', noPhotos);
    account.localSave('timer', { seconds: 30 });
    commitPendingAccountImport(guest, account);
    expect(account.localGet('progressNeck')).toEqual([{ day: '2026-01-09', cm: 38 }]);
    expect(account.localGet('timer')).toEqual({ seconds: 30 });
    expect(account.localGet('progressPhotos')).toBeUndefined();
    expect(account.localGet('profilePhoto')).toBeUndefined();
    expect(guest.localGet('pwaPendingAccountLocal')).toBeNull();
  } finally { sqlite.close(); }
});

test('a merge keeps one copy of a routine the phone shows that the file still has hidden, and the other way round', async () => {
  const { sqlite, repo } = await setup();
  try {
    repo.localSave('routines', { v: 1, routines: [{ id: 'r1', name: 'Morning' }], hidden: [{ id: 'r2', name: 'Evening', sub: '' }], items: [], log: {} });
    const backup = { format: 'insight-phone-only' as const, version: 1 as const, rows: {}, local: {
      routines: { v: 1, routines: [{ id: 'r2', name: 'Evening' }, { id: 'r3', name: 'Noon' }], hidden: [{ id: 'r1', name: 'Morning', sub: '' }, { id: 'r4', name: 'Late', sub: '' }], items: [], log: {} },
    } };
    restoreNativeLocal(repo, backup, new Set(), 'merge', noPhotos);
    const merged = repo.localGet<{ routines: { id: string }[]; hidden: { id: string }[] }>('routines')!;
    expect(merged.routines.map(r => r.id)).toEqual(['r1', 'r3']);
    expect(merged.hidden.map(r => r.id)).toEqual(['r2', 'r4']);
  } finally { sqlite.close(); }
});
