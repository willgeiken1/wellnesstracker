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
