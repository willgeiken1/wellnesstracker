import { File } from "expo-file-system";
import { getDocumentAsync } from "expo-document-picker";
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export function localBackupUri(uri: string) {
  if (!/^(file|content):\/\//i.test(uri))
    throw new Error("Local backup required.");
  return uri;
}
export async function readBackup(uri: string): Promise<unknown> {
  const file = new File(localBackupUri(uri));
  if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup too large.");
  const text = await file.text();
  if (text.length > MAX_BACKUP_BYTES) throw new Error("Backup too large.");
  return JSON.parse(text);
}
export async function pickBackup(): Promise<unknown | undefined> {
  const result = await getDocumentAsync({
    type: ["application/json", "text/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  return result.canceled ? undefined : readBackup(result.assets[0].uri);
}
