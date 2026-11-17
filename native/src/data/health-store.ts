import { sql } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

/* Readings copied from Apple Health (or Health Connect) live in their own SQLite file in the Caches folder,
   which iOS never puts in an iCloud or computer backup: Apple does not allow personal health information in
   iCloud. Everything else stays in the main database and is backed up as before. Apple Health stays the record
   for these readings, so if iOS clears the folder to free space, the next refresh reads them again, as far back
   as earlier reads reached (Repository.healthWeightsFrom). Expo has no way to mark a file in a kept folder as
   excluded from backup, so Caches is the one place that needs no native code. */

/** The Health store's file name, in the Caches folder. */
export const HEALTH_DB = 'insight-health.db';
/** Same columns as the main database's weigh_ins, so a row moves across unchanged. */
export const HEALTH_SCHEMA = 'CREATE TABLE IF NOT EXISTS weigh_ins (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, weight_kg REAL, entered_value REAL, entered_unit TEXT, source TEXT, PRIMARY KEY(owner_id,id))';
const COLUMNS = ['owner_id', 'id', 'updated_at', 'deleted_at', 'device_id', 'day', 'weight_kg', 'entered_value', 'entered_unit', 'source'] as const;

/** True for a weigh-in that came from a health service rather than being typed into Insight. */
export const isHealthSource = (source: unknown) => source !== null && source !== undefined && source !== 'app';

/** Moves Health weigh-ins an earlier version kept in the main database into the Health store, then rewrites
 * the main file so their values are not left behind in freed pages or the write-ahead log. Safe to run on every
 * launch: a copy left by an interrupted delete never replaces a newer row already in the Health store, so a
 * reading removed since stays removed. Records how far back the moved readings go, so a cleared Health store
 * is read back that far. Returns how many it found. */
export function moveHealthRows(main: ExpoSQLiteDatabase, health: ExpoSQLiteDatabase): number {
  const rows = main.all<Record<string, string | number | null>>(sql`SELECT * FROM weigh_ins WHERE source IS NOT NULL AND source <> 'app'`);
  if (!rows.length) return 0;
  const fields = sql.join(COLUMNS.map(c => sql.identifier(c)), sql`, `);
  health.transaction(() => {
    for (const row of rows) health.run(sql`INSERT INTO weigh_ins (${fields}) VALUES (${sql.join(COLUMNS.map(c => sql`${row[c] ?? null}`), sql`, `)})
      ON CONFLICT(owner_id, id) DO UPDATE SET ${sql.join(COLUMNS.filter(c => c !== 'owner_id' && c !== 'id').map(c => sql`${sql.identifier(c)} = excluded.${sql.identifier(c)}`), sql`, `)}
      WHERE excluded.updated_at > weigh_ins.updated_at`);
  });
  // Zero the deleted cells, then fold the log into the file and rebuild it without free pages.
  main.run(sql`PRAGMA secure_delete = ON`);
  main.transaction(() => {
    // The Health store can be cleared by iOS, so keep (per account, as a date only) the earliest day the moved
    // readings cover: the next refresh then reads that far back, even past the usual window.
    main.run(sql`INSERT INTO sync_state (owner_id, key, value)
      SELECT owner_id, 'health_weights_from', min(day) FROM weigh_ins
      WHERE source IS NOT NULL AND source <> 'app' AND deleted_at IS NULL AND day IS NOT NULL GROUP BY owner_id
      ON CONFLICT(owner_id, key) DO UPDATE SET value = min(value, excluded.value)`);
    main.run(sql`DELETE FROM weigh_ins WHERE source IS NOT NULL AND source <> 'app'`);
  });
  main.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
  main.run(sql`VACUUM`);
  main.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
  return rows.length;
}
