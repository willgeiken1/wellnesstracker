import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { sqliteClient } from './sqlite';
import migrations from '../../src/data/migrations';
import { Repository } from '../../src/data/repository';
import { createPhoneBackup } from '../../src/phone-only/backup';
import { commitImport, nativeBackup, nativeBackupPlan, previewImport, restoreNativeLocal } from '../../src/features/importer/local';
import { DEVICE_A } from '../../fixtures/sync';

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
    restoreNativeLocal(repo, backup, new Set(), 'merge');
    expect(repo.localGet('timer')).toEqual({ seconds: 30 });
    expect(repo.localGet('unilateral:fixture')).toBe(false);
    restoreNativeLocal(repo, backup, new Set(), 'replace');
    expect(repo.localGet('timer')).toEqual({ seconds: 90 });
    expect(repo.localGet('unilateral:fixture')).toBe(true);
    // The importer's own bookkeeping and AI photos are never taken from the file.
    expect(repo.localGet('pwaImportedIds')).toEqual(['kept']);
    expect(repo.localGet('foodAi')).toBeUndefined();
  } finally { sqlite.close(); }
});
