import { Directory, File, Paths } from 'expo-file-system';

/**
 * Progress photo files: kept in the app's own Documents folder on this phone, never uploaded, synced or exported. The
 * camera writes to Caches, which iOS may clear, so a new photo is moved here at once.
 */
const FOLDER = 'progress-photos';

/** Moves a photo the camera just wrote into the kept folder and returns its new address. */
export async function keepPhoto(cameraUri: string, id: string): Promise<string> {
  const dir = new Directory(Paths.document, FOLDER);
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${id.replace(/[^a-zA-Z0-9-]/g, '')}.jpg`);
  await new File(cameraUri).move(dest);
  return dest.uri;
}

/** Removes a kept photo's file; a file already gone is fine. */
export function dropPhotoFile(uri: string) { try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* already gone */ } }
