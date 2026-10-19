import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { SQLiteDatabase } from 'expo-sqlite';
import migrations from '../../src/data/migrations';
import { Repository } from '../../src/data/repository';
import { DEVICE_A, OWNER_A } from '../../fixtures/sync';

/** Exercise the production Drizzle driver/repository/migrator on actual SQLite. */
export async function localDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL');
  const client = sqliteClient(sqlite);
  const db = drizzle(client);
  await migrate(db, migrations);
  return { sqlite, db, repo: new Repository(db, OWNER_A, DEVICE_A, () => '40000000-0000-4000-8000-000000000001') };
}

export function sqliteClient(sqlite: DatabaseSync) {
  return { prepareSync(query: string) {
    const statement = sqlite.prepare(query);
    return { executeForRawResultSync(params: (string | number | null)[]) { return {getAllSync: () => statement.all(...params).map(r => Object.values(r))}; }, executeSync(params: (string | number | null)[]) {
      const rows = statement.columns().length ? statement.all(...params) : [];
      const result = statement.columns().length ? { changes: 0, lastInsertRowid: 0 } : statement.run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid), getAllSync: () => rows, getFirstSync: () => rows[0] ?? null };
    }};
  }} as unknown as SQLiteDatabase;
}

/** Reconstruct the pre-v1 schema for upgrade fixtures; never used in production. */
export function downgradeV1Fixture(sqlite: DatabaseSync) {
 const additions: Record<string,string[]> = {
  sets:['tag'],routine_exercises:['rep_min','rep_max','superset_group'],entries:['superset_group'],
  machine_notes:['step','bar_weight','unit_override'],settings:['plate_set','rest_per_exercise','rest_style'],
  food_entries:['fiber_g','sugar_g','sodium_mg'],saved_foods:['fiber_g','sugar_g','sodium_mg'],
 };
 for(const [table,fields] of Object.entries(additions))for(const field of fields)sqlite.exec(`ALTER TABLE ${table} DROP COLUMN ${field}`);
 for(const table of ['custom_exercises','plans','pauses','purges'])sqlite.exec(`DROP TABLE ${table}`);
 sqlite.exec('DELETE FROM __drizzle_migrations WHERE created_at>=1792238400004');
}
