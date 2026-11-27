import { eraseOwnerFiles, OwnerFilesNotErased } from '../src/core/owner-files';
import { readPhotos, takeInPhoto } from '../src/features/progress/local';
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

const URI = 'file:///docs/progress-photos/p1.jpg';
/** Local storage that can be told to refuse saving the photo list, as when the phone is out of space. */
function repo(refuse = false) {
  const store = new Map<string, unknown>();
  return { localGet: (k: string) => store.get(k),
    localSave: (k: string, v: unknown) => { if (refuse && k === 'progressPhotos') throw new Error('fixture: disk full'); store.set(k, v); } } as unknown as Repository;
}
const move = async () => { mockFiles.add(URI); return URI; };
const shot = { id: 'p1', day: '2026-11-20', kg: null, pose: 'Front' as const };

beforeEach(() => { mockFiles.clear(); mockStuck.clear(); });

describe('taking in a new progress photo', () => {
  test('saves the photo and leaves no note behind', async () => {
    const r = repo();
    await takeInPhoto(r, shot, move);
    expect(readPhotos(r).map(p => p.uri)).toEqual([URI]);
    expect(r.localGet('progressPhotosPending')).toEqual([]);
  });

  test('deletes the moved file when the photo cannot be saved', async () => {
    const r = repo(true);
    await expect(takeInPhoto(r, shot, move)).rejects.toThrow('disk full');
    expect(mockFiles.has(URI)).toBe(false);
    expect(() => eraseOwnerFiles(r)).not.toThrow();
  });

  test('keeps the file\'s address when neither the save nor the delete works, so departure still finds the file', async () => {
    const r = repo(true);
    mockStuck.add(URI);
    await expect(takeInPhoto(r, shot, move)).rejects.toThrow('disk full');
    expect(mockFiles.has(URI)).toBe(true);
    expect(() => eraseOwnerFiles(r)).toThrow(OwnerFilesNotErased);
    mockStuck.clear();
    eraseOwnerFiles(r);
    expect(mockFiles.has(URI)).toBe(false);
  });
});
