import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import type { Repository } from '../data/repository';
import { createAccountBackup, createPhoneBackup } from './backup';
export function exportPhoneBackup(repo: Repository): Promise<void> {
  return shareBackup(() => createPhoneBackup(repo), 'insight-phone-backup.json');
}
/** JSON copy of a signed-in account's log, offered before deleting the account. */
export function exportAccountBackup(repo: Repository): Promise<void> {
  return shareBackup(() => createAccountBackup(repo), 'insight-backup.json');
}
async function shareBackup(build: () => string, name: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable.');
  const json = build();
  const directory = new Directory(Paths.cache, `phone-backup-${randomUUID()}`);
  try {
    directory.create();
    const file = new File(directory, name);
    file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
  } finally {
    try { directory.delete(); } catch { /* Best effort after the share sheet closes. */ }
  }
}
