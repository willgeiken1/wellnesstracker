import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { defaultDatabaseDirectory, openDatabaseAsync } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';

/** No migrations, repository, network, or writes to the original database. */
export async function exportBootDatabase(): Promise<void> {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof Directory && entry.name.startsWith('boot-export-')) {
        try { entry.delete(); } catch { /* Best effort; continue cleaning other stale exports. */ }
      }
    }
  } catch { /* Cache cleanup must never prevent an export. */ }
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable.');
  const staging = new Directory(Paths.cache, `boot-export-${randomUUID()}`);
  try {
    staging.create();
    const raw = new File(staging, 'insight.db');
    await new File(defaultDatabaseDirectory, 'insight.db').copy(raw);
    // WAL can contain committed rows absent from the main file. Work only on copies.
    const wal = new File(defaultDatabaseDirectory, 'insight.db-wal');
    if (wal.exists) await wal.copy(new File(staging, 'insight.db-wal'));
    let share = raw;
    try {
      const copy = await openDatabaseAsync('insight.db', { useNewConnection: true }, staging.uri);
      try {
        await copy.execAsync('PRAGMA query_only = ON;');
        const bytes = await copy.serializeAsync();
        const snapshot = new File(staging, 'backup.sqlite');
        await snapshot.write(bytes);
        share = snapshot;
      } finally { await copy.closeAsync(); }
    } catch { /* Unreadable SQLite: the user can still save the raw file. */ }
    await Sharing.shareAsync(share.uri, { mimeType: 'application/vnd.sqlite3', UTI: 'public.database' });
  } finally {
    try { staging.delete(); } catch { /* Preserve the export result or original error. */ }
  }
}
