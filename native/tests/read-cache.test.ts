import { cachedReads } from '../src/data/read-cache';

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
