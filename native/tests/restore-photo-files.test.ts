import { eraseOwnerFiles, OwnerFilesNotErased, photoAddresses, settleReplacedPhotos, PROFILE_PHOTO_KEY, PROFILE_PHOTO_LEFTOVERS_KEY, PROGRESS_PHOTOS_KEY, PROGRESS_PHOTOS_PENDING_KEY } from '../src/core/owner-files';
import { PHOTO_ADDRESS_KEYS, restoreNativeLocal } from '../src/features/importer/local';
import type { Repository } from '../src/data/repository';

// A small file system: addresses of files that exist, and files whose delete is refused.
const mockFiles = new Set<string>();
const mockStuck = new Set<string>();
jest.mock('expo-file-system', () => {
  class Directory { uri: string; constructor(base: { uri: string }, name: string) { this.uri = `${base.uri}${name}/`; } get exists() { return false; } delete() {} }
  class File {
    uri: string;
    constructor(a: string | Directory, b?: string) { this.uri = typeof a === 'string' ? a : a.uri + b; }
    get exists() { return mockFiles.has(this.uri); }
    delete() { if (mockStuck.has(this.uri)) throw new Error('fixture: file is locked'); mockFiles.delete(this.uri); }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs/' } } };
});

const progress = (n: string) => `file:///docs/progress-photos/${n}.jpg`;
const profile = (n: string) => `file:///docs/profile-photo/${n}.jpg`;
function repo() {
  const store = new Map<string, unknown>();
  return { atomic: (f: () => unknown) => f(), localGet: (k: string) => store.get(k), localSave: (k: string, v: unknown) => store.set(k, v) } as unknown as Repository;
}
const photos = { names: photoAddresses, settle: settleReplacedPhotos };
// An older backup, saved before the second progress photo and the new profile photo, from another app folder.
const older = { format: 'insight-phone-only' as const, version: 1 as const, rows: {}, local: {
  progressPhotos: [{ id: 'p1', uri: 'file:///old-folder/Documents/progress-photos/p1.jpg' }],
  profilePhoto: 'file:///old-folder/Documents/profile-photo/a0.jpg',
} };
function phone() {
  const r = repo();
  r.localSave('progressPhotos', [{ id: 'p1', uri: progress('p1') }, { id: 'p2', uri: progress('p2') }]);
  r.localSave('profilePhoto', profile('a1'));
  for (const f of [progress('p1'), progress('p2'), profile('a1')]) mockFiles.add(f);
  return r;
}
beforeEach(() => { mockFiles.clear(); mockStuck.clear(); });

test('Replace deletes the photos the backup no longer names, and keeps the ones it still names under another folder', () => {
  const r = phone();
  restoreNativeLocal(r, older, new Set(), 'replace', photos);
  expect(mockFiles.has(progress('p2'))).toBe(false);
  expect(mockFiles.has(profile('a1'))).toBe(false);
  expect(mockFiles.has(progress('p1'))).toBe(true);
  expect(r.localGet('progressPhotosPending')).toBeUndefined();
  expect(r.localGet('profilePhotoLeftovers')).toBeUndefined();
});

test('a photo that won\'t delete keeps its address, so account deletion still finds and deletes it', () => {
  const r = phone();
  mockStuck.add(progress('p2'));
  mockStuck.add(profile('a1'));
  restoreNativeLocal(r, older, new Set(), 'replace', photos);
  expect(r.localGet('progressPhotosPending')).toEqual([progress('p2')]);
  expect(r.localGet('profilePhotoLeftovers')).toEqual([profile('a1')]);
  expect(() => eraseOwnerFiles(r)).toThrow(OwnerFilesNotErased);
  mockStuck.clear();
  eraseOwnerFiles(r);
  expect([...mockFiles]).toEqual([]);
});

test('a merge keeps the phone\'s photos and their files', () => {
  const r = phone();
  restoreNativeLocal(r, older, new Set(), 'merge', photos);
  expect([...mockFiles].sort()).toEqual([profile('a1'), progress('p1'), progress('p2')].sort());
  expect(r.localGet('profilePhoto')).toBe(profile('a1'));
});

test('the restore leaves out of an account hand-off every photo address departure looks for', () => {
  expect([...PHOTO_ADDRESS_KEYS].sort()).toEqual([PROFILE_PHOTO_KEY, PROFILE_PHOTO_LEFTOVERS_KEY, PROGRESS_PHOTOS_KEY, PROGRESS_PHOTOS_PENDING_KEY].sort());
});
