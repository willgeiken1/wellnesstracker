import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { sqliteClient } from './sqlite';
import migrations from '../../src/data/migrations';
import { Repository } from '../../src/data/repository';
import { createPhoneBackup } from '../../src/phone-only/backup';
import { syncedTables } from '../../src/data/catalog';
import { syntheticRow, DEVICE_A, OWNER_A } from '../../fixtures/sync';
test('SQLite JSON snapshot includes tombstones, drafts, timer, weekly/milestone state; excludes other owners and has no outbox', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = drizzle(sqliteClient(sqlite));
    await migrate(db, migrations);
    const guest = new Repository(db, 'guest', DEVICE_A, () => '10000000-0000-4000-8000-000000000099');
    for (const owner of ['guest', 'demo', OWNER_A]) {
      const repo = new Repository(db, owner, DEVICE_A, () => '10000000-0000-4000-8000-000000000099');
      for (const table of syncedTables) if (table !== 'purges') repo.putLocal({ ...syntheticRow(table), owner_id: owner });
      for (const key of ['draft:fixture-entry', 'timer', 'weekly', 'milestones']) repo.localSave(key, { syntheticOwner: owner });
    }
    guest.localSave('barcode:v1:00000000',{synthetic:true});
    guest.localSave('barcode:v2',{synthetic:true});
    guest.remove('sets', syntheticRow('sets').id, 200);
    const backup = JSON.parse(createPhoneBackup(guest));
    expect(backup.rows.sets[0].deleted_at).toBe(200);
    expect(Object.values(backup.rows).flat().every((row: unknown) => (row as {owner_id:string}).owner_id === 'guest')).toBe(true);
    expect(Object.keys(backup.rows)).toEqual(syncedTables);
    expect(backup.local).toEqual(Object.fromEntries(['draft:fixture-entry', 'timer', 'weekly', 'milestones'].map(key => [key, { syntheticOwner: 'guest' }])));
    expect(guest.pending()).toEqual([]);
    expect(sqlite.prepare("SELECT count(*) AS n FROM sync_outbox WHERE owner_id='guest'").get()?.n).toBe(0);
  } finally { sqlite.close(); }
});
