import { randomUUID } from 'node:crypto';
import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { routineTables } from '../../src/data/rows';
import { DEMO_ROUTINE_ITEMS, DEMO_ROUTINES_KEY, sampleRow, seedDemo } from '../../fixtures/demo';
import { OWNER_A } from '../../fixtures/sync';
import { promoteDemo } from '../../src/features/onboarding/demo-transfer';
import { logItem } from '../../src/features/routines/model/actions';
import { DEFAULT_BLOCK_IDS, routinePlacementId } from '../../src/features/routines/model/ids';
import { nextUpWanted, routineTile, NEXT_UP_TILE_ID } from '../../src/features/routines/model/home-tiles';
import { commitRoutineStore, readRoutineStore } from '../../src/features/routines/store';

/* The sample routine items of "Look around first". Everything is made up. */

async function demo() {
  const local = await localDatabase();
  return { ...local, demo: new Repository(local.db, 'demo', local.repo.device, randomUUID), account: new Repository(local.db, OWNER_A, local.repo.device, randomUUID) };
}
const itemIds = DEMO_ROUTINE_ITEMS.map(item => item.id);

test('looking around starts with Morning and Night and four sample checks: no amount, no unit, no compound', async () => {
  const { demo: repo, sqlite } = await demo();
  try {
    seedDemo(repo);
    expect(repo.list('daily_blocks').map(row => row.id).sort()).toEqual(Object.values(DEFAULT_BLOCK_IDS).sort());
    const items = repo.list('daily_items');
    expect(items.map(row => row.data.name).sort()).toEqual(['Lights out', 'Morning walk', 'Read a few pages', 'Stretch']);
    for (const row of items) {
      expect(row.data.kind).toBe('check');
      // Only a name, a kind and a time of day are set. Nothing a dose item carries.
      expect(Object.entries(row.data).filter(([, value]) => value !== null).map(([key]) => key).sort()).toEqual(['kind', 'name', 'time_min']);
    }
    expect(repo.list('daily_compounds')).toEqual([]);
    expect(repo.list('daily_logs')).toEqual([]);
    expect(repo.list('daily_placements')).toHaveLength(4);
    // No name holds a number, so none can read as an amount.
    expect(items.some(row => /\d/.test(String(row.data.name)))).toBe(false);
    // The rules read them as two routines of two open checks, and Home shows Next up.
    const store = readRoutineStore(repo);
    expect(store.items.every(item => item.kind === 'check' && item.compoundId === null)).toBe(true);
    expect(nextUpWanted(store)).toBe(true);
    expect(routineTile(store, NEXT_UP_TILE_ID, '2026-11-23')?.title).toBe('Stretch');
    // Demo data never waits to sync.
    expect(repo.pending()).toEqual([]);
  } finally { sqlite.close(); }
});

test('the samples are marked the way the workout samples are, and seeding twice adds nothing', async () => {
  const { demo: repo, sqlite } = await demo();
  try {
    seedDemo(repo);
    const tracked = repo.localGet<string[]>('demoSamples')!;
    for (const item of DEMO_ROUTINE_ITEMS) {
      expect(tracked).toContain(item.id);
      expect(tracked).toContain(routinePlacementId(item.block, item.id));
    }
    expect(repo.localGet(DEMO_ROUTINES_KEY)).toBe(true);
    for (const row of [...repo.list('daily_items'), ...repo.list('daily_placements')]) expect(sampleRow(row)).toBe(true);
    // Morning and Night themselves are the ordinary defaults, not samples.
    for (const row of repo.list('daily_blocks')) expect(sampleRow(row)).toBe(false);
    const before = routineTables.map(table => repo.list(table, true).length);
    seedDemo(repo);
    expect(routineTables.map(table => repo.list(table, true).length)).toEqual(before);
    expect(repo.localGet<string[]>('demoSamples')).toEqual(tracked);
  } finally { sqlite.close(); }
});

test('a sample that was removed stays removed', async () => {
  const { demo: repo, sqlite } = await demo();
  try {
    seedDemo(repo);
    for (const id of itemIds) repo.remove('daily_items', id);
    seedDemo(repo);
    expect(repo.list('daily_items')).toEqual([]);
  } finally { sqlite.close(); }
});

test('a demo that already has its own routine items gets no samples mixed in', async () => {
  const { demo: repo, sqlite } = await demo();
  try {
    seedDemo(repo);
    // As a demo from before the samples existed: workout samples tracked, one item of the person's own.
    for (const table of ['daily_items', 'daily_placements'] as const) for (const row of repo.list(table)) repo.remove(table, row.id);
    repo.localSave(DEMO_ROUTINES_KEY, false);
    const own = repo.save('daily_items', { name: 'Zzyq Own Check', kind: 'check' });
    seedDemo(repo);
    expect(repo.list('daily_items').map(row => row.id)).toEqual([own.id]);
    expect(repo.localGet(DEMO_ROUTINES_KEY)).toBe(true);
  } finally { sqlite.close(); }
});

test('a demo whose workout samples are not tracked is left alone, so it is still refused at sign-up', async () => {
  const { demo: repo, sqlite } = await demo();
  try {
    // An old, edited seed: rows with no record of which are samples.
    repo.save('routines', { name: 'Zzyq Edited', position: 0 });
    seedDemo(repo);
    expect(repo.localGet('demoSamples')).toBeUndefined();
    expect(repo.list('daily_items')).toEqual([]);
    expect(repo.localGet(DEMO_ROUTINES_KEY)).toBeUndefined();
  } finally { sqlite.close(); }
});

test('signing up leaves the samples and any tick on them behind, and keeps what the person made', async () => {
  const { demo: repo, account, sqlite } = await demo();
  try {
    seedDemo(repo);
    const store = readRoutineStore(repo);
    const now = Date.UTC(2026, 10, 23, 14);
    // A tick on a sample, and one item of the person's own in Morning.
    const ticked = logItem(store, itemIds[0], { now, day: '2026-11-23' })!;
    commitRoutineStore(repo, ticked, now);
    const own = repo.save('daily_items', { name: 'Zzyq Own Check', kind: 'check' });
    const placed = repo.save('daily_placements', { block_id: DEFAULT_BLOCK_IDS.morning, item_id: own.id, position: 9 }, routinePlacementId(DEFAULT_BLOCK_IDS.morning, own.id));
    expect(repo.list('daily_logs')).toHaveLength(1);
    promoteDemo(repo, account);
    expect(account.list('daily_items').map(row => row.id)).toEqual([own.id]);
    expect(account.list('daily_placements').map(row => row.id)).toEqual([placed.id]);
    expect(account.list('daily_logs')).toEqual([]);
    expect(account.list('daily_blocks')).toHaveLength(2);
    const carried = JSON.stringify(routineTables.flatMap(table => account.list(table, true)));
    for (const name of ['Stretch', 'Morning walk', 'Read a few pages', 'Lights out']) expect(carried).not.toContain(name);
    for (const table of routineTables) expect(repo.list(table, true)).toEqual([]);
  } finally { sqlite.close(); }
});
