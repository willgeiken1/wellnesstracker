import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Image, Linking, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/auth/provider';
import { deleteProfilePhoto, PROFILE_PHOTO_FOLDER, PROFILE_PHOTO_KEY, PROFILE_PHOTO_LEFTOVERS_KEY } from '@/core/owner-files';
import type { Repository } from '@/data/repository';
import { Icon, Tappable, useKit } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { showToast } from '@/features/shell/toast';
import { st } from './copy';
import { actionSheet } from './sheet-actions';

/*
 * The profile photo (pages/settings.js `.st-acct .cam`, `photo`): taken or chosen from the library, cropped square and kept
 * on this phone only, as Progress photos are. The file lives in the app's Documents folder, its address in the person's
 * local storage, which is never synced, uploaded or sent anywhere. Without a photo the avatar shows the initial. Signing out
 * and deleting the account delete the file (src/core/owner-files.ts).
 */
const KEY = PROFILE_PHOTO_KEY;
const FOLDER = PROFILE_PHOTO_FOLDER;

function storedUri(repo: Repository | null | undefined): string | null {
  if (!repo) return null;
  try { return storedUriStrict(repo); } catch { return null; }
}
/** For a change: the kept address, or null when there is none. A record that can't be read throws, so a change never
 * writes over an address it couldn't see (the file it names would be forgotten on the phone). */
function storedUriStrict(repo: Repository): string | null {
  const v = repo.localGet<unknown>(KEY);
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw new Error('The profile photo record could not be read');
  return v;
}
/** For a change: the addresses waiting to be deleted. A list that can't be read throws rather than count as empty. */
function leftovers(repo: Repository): string[] {
  const v = repo.localGet<unknown>(PROFILE_PHOTO_LEFTOVERS_KEY);
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error('The profile photo leftovers could not be read');
  return v.filter((u): u is string => typeof u === 'string' && !!u);
}
/** Notes an old photo's address as waiting to be deleted, before its own address is cleared or replaced, so the file is
 * never forgotten while it is still on the phone. Returns every address waiting. */
function keepForDeleting(repo: Repository, uri: string | null): string[] {
  const before = leftovers(repo), waiting = uri && !before.includes(uri) ? [...before, uri] : before;
  if (waiting !== before) repo.localSave(PROFILE_PHOTO_LEFTOVERS_KEY, waiting);
  return waiting;
}
/** Deletes the waiting files and keeps the addresses of any still there, for the next change or departure to retry. */
function deleteWaiting(repo: Repository, waiting: string[]) {
  if (!waiting.length) return;
  const left = waiting.filter(u => !deleteProfilePhoto(u));
  try { repo.localSave(PROFILE_PHOTO_LEFTOVERS_KEY, left.length ? left : null); } catch { /* the list still names them all */ }
}
function exists(uri: string) { try { return new File(uri).exists; } catch { return false; } }

/** The kept photo's address, or null when there is none or its file is gone (a backup restored on another phone). */
export function readProfilePhoto(repo: Repository | null | undefined): string | null {
  const uri = storedUri(repo);
  return uri && exists(uri) ? uri : null;
}

/** Moves a photo the picker just wrote (in Caches, which iOS may clear) into the kept folder, then forgets the old one. */
export async function saveProfilePhoto(repo: Repository, pickedUri: string): Promise<string> {
  const dir = new Directory(Paths.document, FOLDER);
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${randomUUID().replace(/[^a-zA-Z0-9-]/g, '')}.jpg`);
  // The new file's address is noted with the leftovers before the file exists, so if anything below fails (the move, or
  // saving an address), signing out or deleting the account still finds and deletes it.
  keepForDeleting(repo, dest.uri);
  try {
    await new File(pickedUri).move(dest);
    const before = storedUriStrict(repo);
    keepForDeleting(repo, before && before !== dest.uri ? before : null);
    repo.localSave(KEY, dest.uri);
  } catch (error) {
    // Not kept: delete the new file now, and forget its address only once it is gone.
    // The photo still in place (noted above as about to be replaced) comes off the list too.
    // A record that can't be read is left as it is: the list keeps naming the new file, and departure retries it.
    let kept: string | null = null;
    try { kept = storedUriStrict(repo); } catch { /* unknown; nothing comes off the list for it */ }
    const deleted = deleteProfilePhoto(dest.uri);
    if (deleted || kept) {
      try {
        const rest = leftovers(repo).filter(u => u !== kept && !(deleted && u === dest.uri));
        repo.localSave(PROFILE_PHOTO_LEFTOVERS_KEY, rest.length ? rest : null);
      } catch { /* the list still names it; it is gone */ }
    }
    throw error;
  }
  // It is the photo now: off the list, and the old ones on it are deleted (any still there stay listed).
  try {
    const old = leftovers(repo).filter(u => u !== dest.uri), stuck = old.filter(u => !deleteProfilePhoto(u));
    repo.localSave(PROFILE_PHOTO_LEFTOVERS_KEY, stuck.length ? stuck : null);
  } catch { /* an unreadable list stays as it is; listed until the next change or departure */ }
  return dest.uri;
}

/** Deletes the kept file and the address; the initial shows again. A file that can't be deleted yet keeps its address
 * among the leftovers, so the next change or departure deletes it. */
export function removeProfilePhoto(repo: Repository) {
  // Throws, changing nothing, when the address or the list can't be read.
  const waiting = keepForDeleting(repo, storedUriStrict(repo));
  repo.localSave(KEY, null);
  deleteWaiting(repo, waiting);
}

/** The current person's photo, kept up to date as it changes. Null outside an account or without one. */
export function useProfilePhoto(): string | null {
  const repo = useAuth().repository;
  const subscribe = useCallback((listener: () => void) => (typeof repo?.subscribe === 'function' ? repo.subscribe(listener) : () => {}), [repo]);
  return useSyncExternalStore(subscribe, () => readProfilePhoto(repo), () => null);
}

/** The photo filling a round avatar of `size` points, drawn over the initial. */
export function AvatarPhoto({ uri, size }: { uri: string; size: number }) {
  return <Image testID="avatar-photo" source={{ uri }} accessible={false} resizeMode="cover"
    style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, borderRadius: size / 2 }} />;
}

const PICK: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, exif: false };

/** Opens the camera or the library and keeps the square crop. Returns false when nothing was chosen. */
export async function pickProfilePhoto(repo: Repository, from: 'camera' | 'library'): Promise<boolean | 'denied'> {
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const result = from === 'camera' ? await ImagePicker.launchCameraAsync(PICK) : await ImagePicker.launchImageLibraryAsync(PICK);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset?.uri) return false;
  await saveProfilePhoto(repo, asset.uri);
  return true;
}

/** `.cam`: the round camera button on the Account avatar's lower right. Opens Take photo, Choose from library and, when
 * there is a photo, Remove photo. */
export function AvatarCameraButton({ repo }: { repo: Repository }) {
  const k = useKit(), { mode } = useTheme();
  const photo = useProfilePhoto();
  const busy = useRef(false);
  const pick = async (from: 'camera' | 'library') => {
    if (busy.current) return; busy.current = true;
    try {
      const result = await pickProfilePhoto(repo, from);
      if (result === 'denied') showToast(st('settingsPhotoCameraOff'), { color: 'warning', action: { label: st('settingsPhotoOpenSettings'), onAction: () => { void Linking.openSettings().catch(() => {}); } } });
    } catch { showToast(st('settingsPhotoFailed'), { color: 'warning' }); }
    finally { busy.current = false; }
  };
  const open = () => actionSheet({ title: st('settingsPhotoTitle'), acts: [
    { label: st('settingsPhotoTake'), onPress: () => { void pick('camera'); } },
    { label: st('settingsPhotoChoose'), onPress: () => { void pick('library'); } },
    ...(photo ? [{ label: st('settingsPhotoRemove'), destructive: true, onPress: () => {
      try { removeProfilePhoto(repo); showToast(st('settingsPhotoRemoved')); } catch { showToast(st('settingsPhotoFailed'), { color: 'warning' }); } } }] : []),
  ] });
  const light = mode === 'light';
  return <Tappable testID="avatar-camera" accessibilityRole="button" accessibilityLabel={st('settingsPhotoChange')} onPress={open}
    hitSlop={6} style={{ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
      backgroundColor: light ? k.c.surface : k.c['surface-2'],
      boxShadow: light ? `0px 0px 0px 1px ${k.c.hair}, 0px 0px 0px 3px ${k.c.bg}` : `0px 0px 0px 3px ${k.c.bg}` }}>
    <View pointerEvents="none"><Icon name="camera" size={17} color={k.c.text} /></View>
  </Tappable>;
}
