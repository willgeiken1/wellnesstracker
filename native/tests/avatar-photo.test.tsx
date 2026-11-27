import * as ImagePicker from 'expo-image-picker';
import { eraseOwnerFiles, OwnerFilesNotErased } from '../src/core/owner-files';
import { pickProfilePhoto, readProfilePhoto, removeProfilePhoto, saveProfilePhoto } from '../src/features/settings/avatar-photo';
import type { Repository } from '../src/data/repository';

// A small file system: addresses of files that exist. The picker writes to Caches; the kept copy goes to Documents.
const mockFiles = new Set<string>();
// Files whose delete does nothing, as when the file system refuses.
const mockStuck = new Set<string>();
let mockIds = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `photo-${++mockIds}` }));
jest.mock('expo-file-system', () => {
  class Directory { uri: string; constructor(base: string, name: string) { this.uri = `${base}/${name}`; } create() {} }
  class File {
    uri: string;
    constructor(a: string | Directory, b?: string) { this.uri = typeof a === 'string' ? a : `${a.uri}/${b}`; }
    get exists() { return mockFiles.has(this.uri); }
    delete() { if (!mockStuck.has(this.uri)) mockFiles.delete(this.uri); }
    async move(dest: File) { if (!mockFiles.delete(this.uri)) throw new Error('missing'); mockFiles.add(dest.uri); this.uri = dest.uri; }
  }
  return { Directory, File, Paths: { document: 'file:///docs' } };
});
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: null }) }));

function repo() {
  const store = new Map<string, unknown>();
  return { localGet: (k: string) => store.get(k), localSave: jest.fn((k: string, v: unknown) => { store.set(k, v); }) } as unknown as Repository & { localSave: jest.Mock };
}
beforeEach(() => { mockFiles.clear(); mockStuck.clear(); mockIds = 0; jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockReset(); jest.mocked(ImagePicker.launchCameraAsync).mockReset(); jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset(); });

test('a chosen photo moves out of Caches into the kept folder, and a new one replaces the old file', async () => {
  const r = repo();
  expect(readProfilePhoto(r)).toBeNull();
  mockFiles.add('file:///caches/picked-1.jpg');
  const first = await saveProfilePhoto(r, 'file:///caches/picked-1.jpg');
  expect(first).toBe('file:///docs/profile-photo/photo-1.jpg');
  expect(readProfilePhoto(r)).toBe(first);
  expect(mockFiles.has('file:///caches/picked-1.jpg')).toBe(false);
  mockFiles.add('file:///caches/picked-2.jpg');
  const second = await saveProfilePhoto(r, 'file:///caches/picked-2.jpg');
  expect(readProfilePhoto(r)).toBe(second);
  expect([...mockFiles]).toEqual([second]);
});

test('removing the photo deletes its file and the initial shows again; a missing file reads as no photo', async () => {
  const r = repo();
  mockFiles.add('file:///caches/picked.jpg');
  const kept = await saveProfilePhoto(r, 'file:///caches/picked.jpg');
  removeProfilePhoto(r);
  expect(readProfilePhoto(r)).toBeNull();
  expect(mockFiles.has(kept)).toBe(false);
  r.localSave('profilePhoto', 'file:///docs/profile-photo/gone.jpg');
  expect(readProfilePhoto(r)).toBeNull();
});

test('the camera asks first and keeps the square crop; a closed picker or refused camera keeps nothing', async () => {
  const r = repo();
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({ granted: false } as ImagePicker.CameraPermissionResponse);
  expect(await pickProfilePhoto(r, 'camera')).toBe('denied');
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null });
  expect(await pickProfilePhoto(r, 'library')).toBe(false);
  expect(r.localSave).not.toHaveBeenCalled();
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({ granted: true } as ImagePicker.CameraPermissionResponse);
  mockFiles.add('file:///caches/shot.jpg');
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///caches/shot.jpg', width: 900, height: 900 }] });
  expect(await pickProfilePhoto(r, 'camera')).toBe(true);
  expect(jest.mocked(ImagePicker.launchCameraAsync).mock.calls[0][0]).toMatchObject({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'] });
  expect(readProfilePhoto(r)).toBe('file:///docs/profile-photo/photo-1.jpg');
});

test('an old photo that cannot be deleted keeps its address until a later change or departure deletes it', async () => {
  const r = repo();
  mockFiles.add('file:///caches/a.jpg');
  const first = await saveProfilePhoto(r, 'file:///caches/a.jpg');
  mockStuck.add(first);
  mockFiles.add('file:///caches/b.jpg');
  const second = await saveProfilePhoto(r, 'file:///caches/b.jpg');
  expect(readProfilePhoto(r)).toBe(second);
  expect(r.localGet('profilePhotoLeftovers')).toEqual([first]);
  mockStuck.add(second);
  removeProfilePhoto(r);
  expect(readProfilePhoto(r)).toBeNull();
  expect(r.localGet('profilePhotoLeftovers')).toEqual([first, second]);
  // Departure tries every one and stops while any is still there.
  expect(() => eraseOwnerFiles(r)).toThrow(OwnerFilesNotErased);
  mockStuck.clear();
  eraseOwnerFiles(r);
  expect(mockFiles.has(first) || mockFiles.has(second)).toBe(false);
});

test('a later change deletes the leftovers it can and forgets them', async () => {
  const r = repo();
  mockFiles.add('file:///caches/a.jpg');
  const first = await saveProfilePhoto(r, 'file:///caches/a.jpg');
  mockStuck.add(first);
  removeProfilePhoto(r);
  expect(r.localGet('profilePhotoLeftovers')).toEqual([first]);
  mockStuck.clear();
  mockFiles.add('file:///caches/b.jpg');
  await saveProfilePhoto(r, 'file:///caches/b.jpg');
  expect(mockFiles.has(first)).toBe(false);
  expect(r.localGet('profilePhotoLeftovers')).toBeNull();
});

test('a photo whose address cannot be saved after the move is deleted, and a stuck one stays listed for departure', async () => {
  const store = new Map<string, unknown>();
  let full = false;
  const r = { localGet: (k: string) => store.get(k), localSave: jest.fn((k: string, v: unknown) => { if (full && k === 'profilePhoto') throw new Error('storage full'); store.set(k, v); }) } as unknown as Repository;
  mockFiles.add('file:///caches/a.jpg');
  const first = await saveProfilePhoto(r, 'file:///caches/a.jpg');
  full = true;
  mockFiles.add('file:///caches/b.jpg');
  await expect(saveProfilePhoto(r, 'file:///caches/b.jpg')).rejects.toThrow('storage full');
  // The old photo is still the photo, the new file is gone, and nothing is listed to delete.
  expect(readProfilePhoto(r)).toBe(first);
  expect([...mockFiles]).toEqual([first]);
  expect(store.get('profilePhotoLeftovers')).toBeNull();

  // The same failure with a file that will not delete: its address stays listed, and departure finds it.
  const third = 'file:///docs/profile-photo/photo-3.jpg';
  mockStuck.add(third);
  mockFiles.add('file:///caches/c.jpg');
  await expect(saveProfilePhoto(r, 'file:///caches/c.jpg')).rejects.toThrow('storage full');
  expect(readProfilePhoto(r)).toBe(first);
  expect(store.get('profilePhotoLeftovers')).toEqual([third]);
  expect(() => eraseOwnerFiles(r)).toThrow(OwnerFilesNotErased);
  mockStuck.clear();
  eraseOwnerFiles(r);
  expect(mockFiles.has(third) || mockFiles.has(first)).toBe(false);
});

test('a move that fails keeps the old photo and lists nothing new', async () => {
  const r = repo();
  mockFiles.add('file:///caches/a.jpg');
  const first = await saveProfilePhoto(r, 'file:///caches/a.jpg');
  await expect(saveProfilePhoto(r, 'file:///caches/missing.jpg')).rejects.toThrow('missing');
  expect(readProfilePhoto(r)).toBe(first);
  expect(r.localGet('profilePhotoLeftovers')).toBeNull();
});

test('a change stops, writing nothing, when the kept address or the leftover list cannot be read', async () => {
  const store = new Map<string, unknown>();
  const broken = new Set<string>();
  const r = { localGet: (k: string) => { if (broken.has(k)) throw new Error('unreadable'); return store.get(k); },
    localSave: jest.fn((k: string, v: unknown) => { store.set(k, v); }) } as unknown as Repository & { localSave: jest.Mock };
  mockFiles.add('file:///caches/a.jpg');
  const first = await saveProfilePhoto(r, 'file:///caches/a.jpg');
  const saves = () => r.localSave.mock.calls.length;

  // The address can't be read: removing it, or saving a new one over it, leaves the record as it was.
  broken.add('profilePhoto');
  let before = saves();
  expect(() => removeProfilePhoto(r)).toThrow('unreadable');
  expect(r.localSave.mock.calls.slice(before).some(([k]) => k === 'profilePhoto')).toBe(false);
  mockFiles.add('file:///caches/b.jpg');
  await expect(saveProfilePhoto(r, 'file:///caches/b.jpg')).rejects.toThrow('unreadable');
  expect(store.get('profilePhoto')).toBe(first);
  expect(mockFiles.has(first)).toBe(true);
  broken.delete('profilePhoto');

  // A stored address of the wrong shape counts as unreadable too.
  store.set('profilePhoto', { uri: first });
  expect(() => removeProfilePhoto(r)).toThrow();
  expect(store.get('profilePhoto')).toEqual({ uri: first });
  store.set('profilePhoto', first);

  // The leftover list can't be read: nothing writes over it and the kept photo stays.
  store.set('profilePhotoLeftovers', ['file:///docs/profile-photo/old.jpg']);
  broken.add('profilePhotoLeftovers');
  before = saves();
  expect(() => removeProfilePhoto(r)).toThrow('unreadable');
  mockFiles.add('file:///caches/c.jpg');
  await expect(saveProfilePhoto(r, 'file:///caches/c.jpg')).rejects.toThrow('unreadable');
  expect(saves()).toBe(before);
  expect(store.get('profilePhoto')).toBe(first);
  expect(store.get('profilePhotoLeftovers')).toEqual(['file:///docs/profile-photo/old.jpg']);
  // A list of the wrong shape is not read as empty.
  broken.delete('profilePhotoLeftovers');
  store.set('profilePhotoLeftovers', 'file:///docs/profile-photo/old.jpg');
  expect(() => removeProfilePhoto(r)).toThrow();
  expect(store.get('profilePhotoLeftovers')).toBe('file:///docs/profile-photo/old.jpg');
  expect(store.get('profilePhoto')).toBe(first);
});

test('example data keeps no profile photo: nothing is moved or noted, so no file is left for an account to lose', async () => {
  const r = Object.assign(repo(), { owner: 'demo' });
  mockFiles.add('file:///caches/picked.jpg');
  await expect(saveProfilePhoto(r, 'file:///caches/picked.jpg')).rejects.toThrow();
  expect([...mockFiles]).toEqual(['file:///caches/picked.jpg']);
  expect(r.localSave).not.toHaveBeenCalled();
});
