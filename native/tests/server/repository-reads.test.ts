import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../src/data/migrations';
import { Repository, forgetReads } from '../../src/data/repository';
import { sqliteClient } from './sqlite';
import { OWNER_A, OWNER_B, DEVICE_A } from '../../fixtures/sync';

/** A real database whose statements are counted, so a test can see when the repository asks again. */
async function counted() {
  const sqlite = new DatabaseSync(':memory:');
  const client = sqliteClient(sqlite);
  let queries = 0;
  const prepare = client.prepareSync.bind(client);
  client.prepareSync = ((query: string) => { queries++; return prepare(query); }) as typeof client.prepareSync;
  const db = drizzle(client);
  await migrate(db, migrations);
  const repo = new Repository(db, OWNER_A, DEVICE_A, randomUUID);
  return { sqlite, db, repo, queries: () => queries };
}

test('the same list, row and local value are read from the database once until something changes', async () => {
  const { repo, queries } = await counted();
  const saved = repo.save('sessions', { origin: 'blank', routine_id: null, name: 'Push', day: '2026-11-20', started_at: 1, finished_at: 2, duration_ms: 1, notes: null });
  repo.localSave('draft:x', [{ weight: '50', reps: '5' }]);
  repo.list('sessions'); repo.get('sessions', saved.id); repo.localGet('draft:x');
  const before = queries();
  for (let i = 0; i < 20; i++) {
    expect(repo.list('sessions')).toHaveLength(1);
    expect(repo.get('sessions', saved.id)?.data.name).toBe('Push');
    expect(repo.localGet('draft:x')).toEqual([{ weight: '50', reps: '5' }]);
    expect(repo.localGet('draft:missing')).toBeUndefined();
  }
  expect(queries()).toBe(before);
});

test('a save, a rolled-back batch and a change from elsewhere are all seen at once', async () => {
  const { sqlite, db, repo } = await counted();
  const first = repo.save('sessions', { origin: 'blank', routine_id: null, name: 'Push', day: '2026-11-20', started_at: 1, finished_at: 2, duration_ms: 1, notes: null });
  expect(repo.list('sessions')).toHaveLength(1);
  repo.save('sessions', { ...first.data, name: 'Pull' });
  expect(repo.list('sessions')).toHaveLength(2);
  // Inside a batch, before anyone is told, the batch's own reads see its writes.
  repo.atomic(() => {
    repo.localSave('draft:y', 'one');
    expect(repo.localGet('draft:y')).toBe('one');
    repo.save('sessions', { ...first.data, name: 'Legs' });
    expect(repo.list('sessions')).toHaveLength(3);
  });
  expect(() => repo.atomic(() => {
    repo.save('sessions', { ...first.data, name: 'Rolled back' });
    expect(repo.list('sessions')).toHaveLength(4);
    throw new Error('stop');
  })).toThrow();
  expect(repo.list('sessions')).toHaveLength(3);
  // Another account on the same database neither sees nor hides these.
  const other = new Repository(db, OWNER_B, DEVICE_A, randomUUID);
  expect(other.list('sessions')).toEqual([]);
  other.save('sessions', { ...first.data, name: 'Theirs' });
  expect(repo.list('sessions')).toHaveLength(3);
  sqlite.exec(`DELETE FROM sessions WHERE owner_id='${OWNER_A}'`);
  forgetReads(db);
  expect(repo.list('sessions')).toEqual([]);
  expect(repo.get('sessions', first.id)).toBeUndefined();
});

test('callers get their own list and their own local value to change', async () => {
  const { repo } = await counted();
  repo.save('sessions', { origin: 'blank', routine_id: null, name: 'Push', day: '2026-11-20', started_at: 1, finished_at: 2, duration_ms: 1, notes: null });
  repo.localSave('draft:z', [{ weight: '', reps: '' }]);
  repo.list('sessions').pop();
  expect(repo.list('sessions')).toHaveLength(1);
  repo.localGet<{ weight: string }[]>('draft:z')![0].weight = '99';
  expect(repo.localGet('draft:z')).toEqual([{ weight: '', reps: '' }]);
  // A shared row cannot be changed in place.
  const row = repo.list('sessions')[0];
  expect(Object.isFrozen(row) && Object.isFrozen(row.data)).toBe(true);
});
