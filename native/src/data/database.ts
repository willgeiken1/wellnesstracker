import { sql } from 'drizzle-orm';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { randomUUID } from 'expo-crypto';
import migrations from './migrations';
import { DEFAULT_SYNC_FLAGS, syncTables, type SyncFlags } from './sync/flags';
import { Repository, deviceId, wipeAllOwners } from './repository';
import { Paths } from 'expo-file-system';
import { HEALTH_DB, HEALTH_SCHEMA, moveHealthRows } from './health-store';

/** The Health store, in the Caches folder so it is never backed up. If that file cannot be opened, Health
 * readings are kept in memory for this launch only and read again from Apple Health next time: never in the
 * main, backed-up database. `onDisk` is false for that fallback. */
function openHealthStore() {
  for (const [open, onDisk] of [[() => openDatabaseSync(HEALTH_DB, undefined, Paths.cache.uri), true], [() => openDatabaseSync(':memory:'), false]] as const) {
    let sqlite: ReturnType<typeof openDatabaseSync> | undefined;
    try { sqlite = open(); sqlite.execSync(`PRAGMA journal_mode = WAL; ${HEALTH_SCHEMA};`); return { health: drizzle(sqlite), onDisk }; }
    catch { try { sqlite?.closeSync(); } catch { /* Try the next place. */ } }
  }
  throw new Error('Health store unavailable.');
}
let database: Promise<{forOwner: (owner: string) => Repository; wipeAll(): void; countAllUnsynced?():number}> | undefined;
export function openLocalDatabase(flags: SyncFlags = DEFAULT_SYNC_FLAGS) {
  return database ??= (async () => {
    let sqlite: ReturnType<typeof openDatabaseSync> | undefined;
    let stage = 'DatabaseOpenError';
    try {
      sqlite = openDatabaseSync('insight.db');
      sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const db = drizzle(sqlite);
      stage = 'DatabaseMigrationError';
      await migrate(db,migrations);
      stage = 'DatabaseOpenError';
      const device = deviceId(db, randomUUID);
      const syncFlags = Object.freeze({...flags});
      const { health, onDisk } = openHealthStore();
      // Health weigh-ins an earlier version kept here move out; if that fails they stay unread and Apple Health fills the store again.
      // Never into the memory fallback, which is gone at the next launch: they wait here until the file opens.
      if (onDisk) try { moveHealthRows(db, health); } catch { /* Retried next launch. */ }
      return {countAllUnsynced:()=>db.get<{count:number}>(sql`SELECT count(*) AS count FROM sync_outbox WHERE table_name IN (${sql.join(syncTables(syncFlags).filter(table=>table!=='purges').map(table=>sql`${table}`),sql`, `)})`)?.count??0,wipeAll:()=>wipeAllOwners(db,health),forOwner: (owner: string) => new Repository(db,owner,device,randomUUID,syncFlags,health)};
    } catch {
      try { sqlite?.closeSync(); } catch { /* Keep the original failure category. */ }
      const error = new Error('Local data is unavailable.');
      error.name = stage;
      throw error;
    }
  })().catch(error => { database = undefined; throw error; });
}
