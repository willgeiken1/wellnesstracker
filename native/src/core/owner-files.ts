import { Directory, File, Paths } from 'expo-file-system';
import type { Repository } from '@/data/repository';

/*
 * Files the app keeps for one person on this phone, outside the database: the profile photo and progress photos. Each
 * lives in its own folder in Documents, and its address in the person's local storage. Wiping the database rows on
 * sign-out or account deletion forgets the addresses but leaves the files, which would stay on the phone and in its
 * backups, so departure deletes them first, while the addresses can still be read.
 */
export const PROFILE_PHOTO_KEY = 'profilePhoto';
export const PROFILE_PHOTO_FOLDER = 'profile-photo';
/** Addresses of replaced or removed profile photos whose files could not be deleted yet. The next change and departure
 * try them again, so a file is never forgotten while it is still on the phone. */
export const PROFILE_PHOTO_LEFTOVERS_KEY = 'profilePhotoLeftovers';
export const PROGRESS_PHOTOS_KEY = 'progressPhotos';
export const PROGRESS_PHOTOS_FOLDER = 'progress-photos';
/** Addresses of new progress photos noted before their file is moved in, until the photo itself is saved. A photo whose
 * save failed and whose file could not be deleted keeps its address here, so departure still finds the file. */
export const PROGRESS_PHOTOS_PENDING_KEY = 'progressPhotosPending';
const FOLDERS = [PROFILE_PHOTO_FOLDER, PROGRESS_PHOTOS_FOLDER];

/** The file a stored address names, found by its name in the app's own folder. Only a file directly inside one of the
 * app's photo folders is ever named, whatever the address holds, and a backup restored into a new app folder still
 * finds its file. */
function keptFile(uri: unknown, folder: string): File | null {
  if (typeof uri !== 'string') return null;
  const name = uri.slice(uri.lastIndexOf('/') + 1);
  if (!/^[A-Za-z0-9-]+\.jpg$/.test(name)) return null;
  try { return new File(new Directory(Paths.document, folder), name); } catch { return null; }
}

/** Deletes a kept file or folder. True when it is gone afterwards (or was never there); false when it is still there or
 * that can't be told. */
function gone(f: File | Directory): boolean {
  try { if (f.exists) f.delete(); } catch { /* checked below */ }
  try { return !f.exists; } catch { return false; }
}

/** Deletes one kept progress photo by its stored address. True when the file is gone afterwards (or was never there),
 * false when it could not be deleted, so the caller keeps the address and a later delete or departure can retry. */
export function deleteProgressPhoto(uri: unknown): boolean {
  const f = keptFile(uri, PROGRESS_PHOTOS_FOLDER);
  return !f || gone(f);
}

/** Deletes one kept profile photo by its stored address. True when the file is gone afterwards (or was never there). */
export function deleteProfilePhoto(uri: unknown): boolean {
  const f = keptFile(uri, PROFILE_PHOTO_FOLDER);
  return !f || gone(f);
}

/** A kept file or folder that departure could not delete. Departure stops before the wipe, so the addresses and the
 * departure marker stay and a retry finishes it. */
export class OwnerFilesNotErased extends Error { constructor() { super('Kept files could not be deleted.'); } }

/** A stored address list. One that can't be read stops departure, so the wipe never forgets files it could not find;
 * the addresses and the marker stay for a retry (and the all-owner escape still deletes the folders). */
function read(repo: Pick<Repository, 'localGet'>, key: string): unknown {
  // A store with no local storage at all holds no addresses.
  if (typeof repo.localGet !== 'function') return undefined;
  try { return repo.localGet<unknown>(key); } catch { throw new OwnerFilesNotErased(); }
}

/** This person's kept files, profile photo first. */
function ownerFiles(repo: Pick<Repository, 'localGet'>): File[] {
  const progress = read(repo, PROGRESS_PHOTOS_KEY);
  const progressUris: unknown[] = Array.isArray(progress) ? progress.map(p => p && typeof p === 'object' ? (p as { uri?: unknown }).uri : null) : [];
  const pending = read(repo, PROGRESS_PHOTOS_PENDING_KEY);
  if (Array.isArray(pending)) progressUris.push(...pending);
  const leftovers = read(repo, PROFILE_PHOTO_LEFTOVERS_KEY), profileUris = [read(repo, PROFILE_PHOTO_KEY), ...(Array.isArray(leftovers) ? leftovers : [])];
  return [...profileUris.map(u => keptFile(u, PROFILE_PHOTO_FOLDER)), ...progressUris.map(u => keptFile(u, PROGRESS_PHOTOS_FOLDER))]
    .filter((f): f is File => !!f);
}

/** Departure: deletes this person's kept files. Call before their rows are wiped, while the addresses still read. Tries
 * every file, then throws OwnerFilesNotErased if any is still there, so the wipe never forgets a file's address. */
export function eraseOwnerFiles(repo: Pick<Repository, 'localGet'>) {
  const left = ownerFiles(repo).filter(f => !gone(f));
  if (left.length) throw new OwnerFilesNotErased();
}

/** The all-owner escape: every person's rows go, so the whole photo folders go too. Throws OwnerFilesNotErased if a
 * folder is still there, so the escape's marker stays and a retry deletes it. */
export function eraseAllOwnerFiles() {
  const left = FOLDERS.filter(name => { try { return !gone(new Directory(Paths.document, name)); } catch { return false; } });
  if (left.length) throw new OwnerFilesNotErased();
}
