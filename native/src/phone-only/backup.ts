import type { Repository } from '../data/repository';
import { syncedTables } from '../data/catalog';
/** Synchronous snapshot, scoped to this build's non-demo repository. Includes tombstones. */
export function createPhoneBackup(repo: Repository): string {
  if (repo.owner !== 'guest') throw new Error('Phone-only data is unavailable.');
  return repo.atomic(() => JSON.stringify({
    format: 'insight-phone-only', version: 1, exportedAt: new Date().toISOString(),
    rows: Object.fromEntries(syncedTables.map(table => [table, repo.list(table, true)])),
    // AI photos, thumbnails, and barcode caches stay on this device.
    local: Object.fromEntries(Object.entries(repo.localSnapshot()).filter(([key]) => key !== 'foodAi' && !key.startsWith('barcode:'))),
  }));
}
