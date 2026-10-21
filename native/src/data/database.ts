import { sql } from 'drizzle-orm';
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { randomUUID } from 'expo-crypto';
import migrations from './migrations';
import { Repository, deviceId, wipeAllOwners } from './repository';
let database: Promise<{forOwner: (owner: string) => Repository; wipeAll(): void; countAllUnsynced?():number}> | undefined;
export function openLocalDatabase() {
  return database ??= (async () => {
    try {
      const sqlite = openDatabaseSync('insight.db');
      sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const db = drizzle(sqlite);
      await migrate(db,migrations);
      const device = deviceId(db, randomUUID);
      return {countAllUnsynced:()=>db.get<{count:number}>(sql`SELECT count(*) AS count FROM sync_outbox WHERE table_name <> 'purges'`)?.count??0,wipeAll:()=>wipeAllOwners(db),forOwner: (owner: string) => new Repository(db,owner,device,randomUUID)};
    } catch { database = undefined; throw new Error('Local data is unavailable.'); }
  })();
}
