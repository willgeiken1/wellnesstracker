import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import type { Repository } from '../data/repository';
import { createPhoneBackup } from './backup';
export async function exportPhoneBackup(repo: Repository): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable.');
  const json = createPhoneBackup(repo);
  const directory = new Directory(Paths.cache, `phone-backup-${randomUUID()}`);
  try {
    directory.create();
    const file = new File(directory, 'insight-phone-backup.json');
    file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
  } finally {
    try { directory.delete(); } catch { /* Best effort after the share sheet closes. */ }
  }
}
