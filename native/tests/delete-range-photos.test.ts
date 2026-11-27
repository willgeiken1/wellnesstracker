import { memoryRepository } from './workout-repository';
import { deleteDateRange, runDateRangeDelete } from '../src/features/settings/delete-range';
import { addPhoto, removePhoto } from '../src/features/progress/local';
import type { Repository } from '../src/data/repository';

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
  return { Directory, File, Paths: { document: { uri: 'file:///docs/' }, cache: { uri: 'file:///caches/' } } };
});

const uri = (name: string) => `file:///docs/progress-photos/${name}.jpg`;
const photo = (id: string, day: string) => ({ id, day, kg: null, uri: uri(id), pose: 'Front' as const });
const kept = (repo: Repository) => (repo.localGet<{ id: string }[]>('progressPhotos') ?? []).map(p => p.id);

beforeEach(() => { mockFiles.clear(); mockStuck.clear(); for (const id of ['in1', 'in2', 'out1']) mockFiles.add(uri(id)); });

describe('Deleting progress photos deletes their files', () => {
  test('a date range deletes the files of the photos in it, and keeps the rest', () => {
    const repo = memoryRepository() as unknown as Repository;
    repo.localSave('progressPhotos', [photo('in1', '2026-11-18'), photo('in2', '2026-11-20'), photo('out1', '2026-10-01')]);
    expect(deleteDateRange(repo, '2026-11-16', '2026-11-22', ['photos'])).toBe(2);
    expect(kept(repo)).toEqual(['out1']);
    expect([...mockFiles]).toEqual([uri('out1')]);
  });
  test('a photo whose file cannot be deleted keeps its address, so a later delete can try again', () => {
    const repo = memoryRepository() as unknown as Repository;
    repo.localSave('progressPhotos', [photo('in1', '2026-11-18'), photo('in2', '2026-11-20')]);
    mockStuck.add(uri('in2'));
    expect(deleteDateRange(repo, '2026-11-16', '2026-11-22', ['photos'])).toBe(1);
    expect(kept(repo)).toEqual(['in2']);
    mockStuck.clear();
    expect(deleteDateRange(repo, '2026-11-16', '2026-11-22', ['photos'])).toBe(1);
    expect(kept(repo)).toEqual([]);
    expect(mockFiles.has(uri('in2'))).toBe(false);
  });
  test("the sheet's delete reports photos it couldn't delete, so it never says the range went", () => {
    const repo = memoryRepository() as unknown as Repository;
    repo.localSave('progressPhotos', [photo('in1', '2026-11-18'), photo('in2', '2026-11-20'), photo('out1', '2026-10-01')]);
    mockStuck.add(uri('in1')); mockStuck.add(uri('in2'));
    expect(runDateRangeDelete(repo, '2026-11-16', '2026-11-22', ['photos'])).toEqual({ outcome: 'photosKept', kept: 2 });
    expect(kept(repo)).toEqual(['in1', 'in2', 'out1']);
    mockStuck.delete(uri('in1'));
    expect(runDateRangeDelete(repo, '2026-11-16', '2026-11-22', ['photos'])).toEqual({ outcome: 'photosKept', kept: 1 });
    mockStuck.clear();
    expect(runDateRangeDelete(repo, '2026-11-16', '2026-11-22', ['photos'])).toEqual({ outcome: 'deleted', kept: 0 });
    expect(kept(repo)).toEqual(['out1']);
  });
  test("a stuck photo outside the picked kinds doesn't stop the rest from reading as deleted", () => {
    const repo = memoryRepository() as unknown as Repository;
    repo.localSave('progressPhotos', [photo('in1', '2026-11-18')]);
    mockStuck.add(uri('in1'));
    expect(runDateRangeDelete(repo, '2026-11-16', '2026-11-22', ['food'])).toEqual({ outcome: 'deleted', kept: 0 });
  });
  test('removing one photo deletes its file first', () => {
    const repo = memoryRepository() as unknown as Repository;
    addPhoto(repo, photo('in1', '2026-11-18'));
    addPhoto(repo, photo('out1', '2026-10-01'));
    removePhoto(repo, 'in1');
    expect(kept(repo)).toEqual(['out1']);
    expect(mockFiles.has(uri('in1'))).toBe(false);
    mockStuck.add(uri('out1'));
    removePhoto(repo, 'out1');
    expect(kept(repo)).toEqual(['out1']);
  });
});
