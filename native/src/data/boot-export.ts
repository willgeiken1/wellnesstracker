import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { defaultDatabaseDirectory, openDatabaseAsync } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import { filterBootExport } from './boot-export-filter';

/** No migrations, repository, network, or writes to the original database. */
export async function exportBootDatabase(currentOwner: () => string | null): Promise<void> {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof Directory && entry.name.startsWith('boot-export-')) {
        try { entry.delete(); } catch { /* Best effort; continue cleaning other stale exports. */ }
      }
    }
  } catch { /* Cache cleanup must never prevent an export. */ }
  const owner = currentOwner();
  if (!owner || owner === 'demo' || owner === 'guest') throw new Error('Signed-in owner is unavailable.');
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable.');
  const staging = new Directory(Paths.cache, `boot-export-${randomUUID()}`);
  try {
    staging.create();
    const raw = new File(staging, 'insight.db');
    await new File(defaultDatabaseDirectory, 'insight.db').copy(raw);
    // WAL can contain committed rows absent from the main file. Work only on copies.
    const wal = new File(defaultDatabaseDirectory, 'insight.db-wal');
    if (wal.exists) await wal.copy(new File(staging, 'insight.db-wal'));
    const snapshot = new File(staging, 'backup.sqlite');
    const copy = await openDatabaseAsync('insight.db', { useNewConnection: true }, staging.uri);
    try {
      await filterBootExport(copy, owner);
      await snapshot.write(await copy.serializeAsync());
    } finally { await copy.closeAsync(); }
    if (currentOwner() !== owner) throw new Error('Signed-in owner changed.');
    await Sharing.shareAsync(snapshot.uri, { mimeType: 'application/vnd.sqlite3', UTI: 'public.database' });
  } finally {
    try { staging.delete(); } catch { /* Preserve the export result or original error. */ }
  }
}
