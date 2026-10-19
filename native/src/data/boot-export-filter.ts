import type { SQLiteDatabase } from 'expo-sqlite';

const identifier = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Only call on the disposable staged copy, never the live database. */
export async function filterBootExport(copy: Pick<SQLiteDatabase, 'execAsync' | 'getAllAsync' | 'runAsync'>, owner: string) {
  // Remove schema hooks before changing rows; retain no unscoped application tables.
  await copy.execAsync('PRAGMA foreign_keys = OFF; PRAGMA secure_delete = ON;');
  const schema = await copy.getAllAsync<{ name: string; type: string }>(
    "SELECT name, type FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'view', 'trigger')",
  );
  for (const { name, type } of schema) {
    if (type === 'view' || type === 'trigger') await copy.execAsync(`DROP ${type.toUpperCase()} ${identifier(name)}`);
  }
  for (const { name, type } of schema) {
    if (type !== 'table') continue;
    if (name.toLowerCase().includes('oura')) {
      await copy.execAsync(`DROP TABLE ${identifier(name)}`);
      continue;
    }
    const columns = await copy.getAllAsync<{ name: string }>(`PRAGMA table_info(${identifier(name)})`);
    const ownerColumn = columns.find(column => column.name.toLowerCase() === 'owner_id');
    if (!ownerColumn) await copy.execAsync(`DROP TABLE ${identifier(name)}`);
    else await copy.runAsync(`DELETE FROM ${identifier(name)} WHERE ${identifier(ownerColumn.name)} IS NULL OR ${identifier(ownerColumn.name)} != ?`, owner);
  }
  // Serialization must not retain deleted owners/Oura bytes in free pages.
  await copy.execAsync('VACUUM;');
}
