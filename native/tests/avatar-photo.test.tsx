import * as ImagePicker from 'expo-image-picker';
import { pickProfilePhoto, readProfilePhoto, removeProfilePhoto, saveProfilePhoto } from '../src/features/settings/avatar-photo';
import type { Repository } from '../src/data/repository';

// A small file system: addresses of files that exist. The picker writes to Caches; the kept copy goes to Documents.
const mockFiles = new Set<string>();
let mockIds = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `photo-${++mockIds}` }));
jest.mock('expo-file-system', () => {
  class Directory { uri: string; constructor(base: string, name: string) { this.uri = `${base}/${name}`; } create() {} }
  class File {
    uri: string;
    constructor(a: string | Directory, b?: string) { this.uri = typeof a === 'string' ? a : `${a.uri}/${b}`; }
    get exists() { return mockFiles.has(this.uri); }
    delete() { mockFiles.delete(this.uri); }
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
beforeEach(() => { mockFiles.clear(); mockIds = 0; jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockReset(); jest.mocked(ImagePicker.launchCameraAsync).mockReset(); jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset(); });

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
