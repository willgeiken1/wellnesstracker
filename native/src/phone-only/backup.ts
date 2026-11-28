import type { Repository } from '../data/repository';
import { routineTables, syncedTables } from '../data/catalog';
import { ROUTINES_KEY, readStoredRoutines } from '../features/routines/store';
/** Synchronous snapshot, scoped to this build's non-demo repository. Includes tombstones. */
export function createPhoneBackup(repo: Repository): string {
  if (repo.owner !== 'guest') throw new Error('Phone-only data is unavailable.');
  return backupJson(repo, 'insight-phone-only');
}
/** The same file for a signed-in account, offered before the account is deleted. Never the example data. */
export function createAccountBackup(repo: Repository): string {
  if (repo.owner === 'guest' || repo.owner === 'demo' || repo.owner === 'device') throw new Error('Account data is unavailable.');
  return backupJson(repo, 'insight-account');
}
function backupJson(repo: Repository, format: 'insight-phone-only' | 'insight-account'): string {
  return repo.atomic(() => JSON.stringify({
    format, version: 1, exportedAt: new Date().toISOString(),
    // Readings from Apple Health or Health Connect never leave the phone, so they are left out of the file.
    rows: Object.fromEntries(syncedTables.map(table => [table, repo.list(table, true).filter(row => table !== 'weigh_ins' || row.data.source === 'app')])),
    /* The routine rows as the tables hold them, tombstones included, for the record. A restore reads the routines
       back from `local` below. Tombstones carry no values. */
    dailyRoutines: Object.fromEntries(routineTables.map(table => [table, repo.list(table, true)])),
    // AI photos, thumbnails, and barcode caches stay on this device.
    local: localDetails(repo),
  }));
}
/** The phone-side details a restore reads back. Routines kept in their own tables go in as the one document a restore
 *  understands, so a file made after the move to the tables still brings them back. */
function localDetails(repo: Repository): Record<string, unknown> {
  const local = Object.fromEntries(Object.entries(repo.localSnapshot()).filter(([key]) => key !== 'foodAi' && !key.startsWith('barcode:')));
  if (local[ROUTINES_KEY] == null) {
    const routines = readStoredRoutines(repo);
    if (routines) local[ROUTINES_KEY] = routines;
    else delete local[ROUTINES_KEY];
  }
  return local;
}
