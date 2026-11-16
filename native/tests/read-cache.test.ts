import { cachedReads, liveReads } from '../src/data/read-cache';

test('each list or value is fetched once, and every caller gets its own copy of a list', () => {
  const rows = [{ id: 'b' }, { id: 'a' }];
  const repo = { owner: 'demo', list: jest.fn((_table: string, _deleted?: boolean) => rows), get: jest.fn((_table: string, id: string) => ({ id })), localGet: jest.fn((key: string) => key.length),
    getRevision: jest.fn(() => 7), save: jest.fn() };
  const view = cachedReads(repo);
  const first = view.list('sets'), second = view.list('sets');
  expect(repo.list).toHaveBeenCalledTimes(1);
  expect(first).toEqual(rows);
  expect(first).not.toBe(second);
  first.sort((x, y) => x.id.localeCompare(y.id));
  expect(view.list('sets').map(row => row.id)).toEqual(['b', 'a']);
  // Different arguments are different questions.
  view.list('sets', true); view.list('entries');
  expect(repo.list).toHaveBeenCalledTimes(3);
  view.get('sets', 'a'); view.get('sets', 'a'); view.localGet('draft:1'); view.localGet('draft:1');
  expect(repo.get).toHaveBeenCalledTimes(1);
  expect(repo.localGet).toHaveBeenCalledTimes(1);
  // Everything else goes straight through, every time.
  expect(view.owner).toBe('demo');
  view.getRevision(); view.getRevision();
  expect(repo.getRevision).toHaveBeenCalledTimes(2);
});

test('methods keep their own object, so a class-based repository still works through the view', () => {
  class Box { private items = [1, 2]; list() { return this.items; } size() { return this.items.length; } }
  const view = cachedReads(new Box());
  expect(view.list()).toEqual([1, 2]);
  expect(view.size()).toBe(2);
});

describe('liveReads, for a store that also saves', () => {
  function make() {
    let revision = 0, rows = [{ id: 'a' }];
    const repo = {
      list: jest.fn((_table: string) => rows),
      get: jest.fn((_table: string, id: string) => rows.find(row => row.id === id)),
      localGet: jest.fn((_key: string) => rows.length),
      getRevision: () => revision,
      subscribe: jest.fn(),
      save: jest.fn((id: string) => { rows = [...rows, { id }]; revision++; }),
      atomic<T>(work: () => T) { try { return work(); } finally { revision++; } },
      /** A writer the view never sees, like sync: only the revision tells. */
      outside(id: string) { rows = [...rows, { id }]; revision++; },
      quiet(id: string) { rows = [...rows, { id }]; },
    };
    return { repo, view: liveReads(repo) };
  }
  test('a list asked for in a loop reaches the database once', () => {
    const { repo, view } = make();
    for (let i = 0; i < 50; i++) { view.list('sets'); view.get('sets', 'a'); view.localGet('k'); }
    expect(repo.list).toHaveBeenCalledTimes(1);
    expect(repo.get).toHaveBeenCalledTimes(1);
    expect(repo.localGet).toHaveBeenCalledTimes(1);
    view.subscribe(); view.getRevision(); view.list('sets');
    expect(repo.list).toHaveBeenCalledTimes(1);
  });
  test('a save through the view is seen by the next read', () => {
    const { view } = make();
    expect(view.list('sets')).toHaveLength(1);
    view.save('b');
    expect(view.list('sets')).toHaveLength(2);
    expect(view.get('sets', 'b')).toEqual({ id: 'b' });
  });
  test('a change by another writer is seen as soon as the revision moves', () => {
    const { repo, view } = make();
    expect(view.list('sets')).toHaveLength(1);
    repo.outside('b');
    expect(view.list('sets')).toHaveLength(2);
  });
  test('saves inside an open atomic block are seen at once, before the revision moves', () => {
    const { repo, view } = make();
    view.list('sets');
    const inside = view.atomic(() => { view.quiet('b'); return view.list('sets').length; });
    expect(inside).toBe(2);
    expect(repo.list).toHaveBeenCalledTimes(2);
  });
  test('what was read inside a block that failed is forgotten, even though the revision never moved', () => {
    const { repo } = make();
    const still = { ...repo, getRevision: () => 0 };
    const view = liveReads(still);
    expect(() => view.atomic(() => { view.list('sets'); throw new Error('rolled back'); })).toThrow('rolled back');
    view.list('sets');
    expect(repo.list).toHaveBeenCalledTimes(2);
  });
});
