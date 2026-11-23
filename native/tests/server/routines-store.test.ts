import { localDatabase } from './sqlite';
import { Repository } from '../../src/data/repository';
import { DEVICE_A, OWNER_A, OWNER_B } from '../../fixtures/sync';
import { FIXTURE_IDS, ROUTINE_SENTINELS, routineFixtureRows } from '../../fixtures/routines';
import { commitRoutineStore, readRoutineStore, removedDefaultRoutines, seedDefaultRoutines } from '../../src/features/routines/store';
import { addBlock, moveBlock, saveBlock, blockDraft } from '../../src/features/routines/model/blocks';
import { editLog } from '../../src/features/routines/model/edit-log';
import { addRoutinePart, saveSetup } from '../../src/features/routines/model/setup';
import { addCustomType } from '../../src/features/routines/model/types';
import { deleteItem, logItem, restoreLog, saveItem, saveItemNote, setDayRollover, undoLog } from '../../src/features/routines/model/actions';
import { customTypeId, DEFAULT_BLOCK_IDS, isRoutineRowId, ROUTINE_PREFS_ID, routineLogId, routinePlacementId, routineUuid } from '../../src/features/routines/model/ids';
import { projectRoutineStore, type RoutineStore } from '../../src/features/routines/model/shape';
import { routineSupplyView } from '../../src/features/routines/model/supply';

/* Synthetic routines only. Rows in, the logic's shape out, and only the difference written back. */

const uuid = () => { let n = 0; return () => `50000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; };
const open = async (owner = OWNER_A) => { const local = await localDatabase(); return { ...local, repo: new Repository(local.db, owner, DEVICE_A, uuid()) }; };
const clock = (now: number, day = '2026-11-19') => ({ now, day });
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };

test('ids are row ids, the same parts give the same id, and nothing about the parts can be read back', () => {
  expect(isRoutineRowId(routineLogId('item-a', '2026-11-19'))).toBe(true);
  expect(routineLogId('item-a', '2026-11-19')).toBe(routineLogId('item-a', '2026-11-19'));
  expect(routineLogId('item-a', '2026-11-19')).not.toBe(routineLogId('item-a', '2026-11-20'));
  expect(routineLogId(null, '2026-11-19')).not.toBe(routineLogId('item-a', '2026-11-19'));
  expect(routineUuid('a', 'bc')).not.toBe(routineUuid('ab', 'c'));
  expect(routinePlacementId('b', 'i')).not.toBe(routinePlacementId('i', 'b'));
  expect(routineLogId('Zzyq Example Compound', '2026-11-19')).not.toMatch(/Zzyq|2026/);
  // sha256("insight-daily-routines\0prefs") shaped as a v4 id: stable across phones and builds.
  expect(ROUTINE_PREFS_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(DEFAULT_BLOCK_IDS.morning).not.toBe(DEFAULT_BLOCK_IDS.night);
});

test('every fixture value reads into the shape and writes back without a change', async () => {
  const { repo, sqlite } = await open();
  try {
    for (const row of routineFixtureRows()) repo.save(row.table, row.data, row.id, 1000);
    const store = readRoutineStore(repo);
    const json = JSON.stringify(store);
    for (const sentinel of ROUTINE_SENTINELS) expect(json).toContain(sentinel);
    expect(store.blocks[0]).toMatchObject({ id: FIXTURE_IDS.block, name: 'Zzyq Evening Block', startMin: 1260, endMin: 1380, days: [0, 1, 2, 3, 4] });
    expect(store.items.find(item => item.id === FIXTURE_IDS.item)).toMatchObject({ kind: 'dose', type: 'peptide', compoundId: FIXTURE_IDS.compound, note: 'qq4419-scribble-text', onHand: 4417, timeMin: 1275 });
    expect(store.compounds[0]).toMatchObject({ amount: 13.25, unit: 'zq-unit', chartLine: true });
    expect(store.logs.find(log => log.id === FIXTURE_IDS.log)).toMatchObject({ amount: 13.25, unit: 'zq-unit', site: 'right-thigh', status: 'done', deletedAt: null });
    expect(store.prefs.customTypes).toEqual([{ id: customTypeId(FIXTURE_IDS.type), name: 'Zzyq Custom Type' }]);
    expect(store.prefs.setup).toMatchObject({ status: 'done', answers: { goals: 'enhancers', inject: 'yes' } });
    expect(store.settings.dayRolloverHour).toBe(4);
    const before = repo.unsyncedCount();
    expect(commitRoutineStore(repo, store, 2000)).toBe(0);
    expect(repo.unsyncedCount()).toBe(before);
    expect(readRoutineStore(repo)).toEqual(store);
    expect(routineSupplyView({ item: store.items.find(item => item.id === FIXTURE_IDS.item), logs: store.logs, today: '2026-11-19' }).text).toContain('4417 on hand');
  } finally { sqlite.close(); }
});

test('the two default routines are seeded once, with fixed ids, and a deleted default stays deleted', async () => {
  const { repo, sqlite } = await open();
  try {
    expect(seedDefaultRoutines(repo)).toBe(2);
    expect(seedDefaultRoutines(repo)).toBe(0);
    const view = projectRoutineStore(readRoutineStore(repo));
    expect(view?.blocks.map(block => [block.id, block.name, block.color, block.order])).toEqual([[DEFAULT_BLOCK_IDS.morning, 'Morning routine', 'citrus', 0], [DEFAULT_BLOCK_IDS.night, 'Night routine', 'pink', 1]]);
    expect(repo.get('daily_blocks', DEFAULT_BLOCK_IDS.morning)?.updated_at).toBe(1);
    repo.remove('daily_blocks', DEFAULT_BLOCK_IDS.morning, 500);
    repo.remove('daily_blocks', DEFAULT_BLOCK_IDS.night, 500);
    expect(seedDefaultRoutines(repo)).toBe(0);
    expect(readRoutineStore(repo).blocks).toEqual([]);
  } finally { sqlite.close(); }
});

test('adding, logging, undoing and restoring write only the rows that changed', async () => {
  const { repo, sqlite } = await open();
  try {
    seedDefaultRoutines(repo);
    const newId = uuid();
    const added = must(saveItem(readRoutineStore(repo), { name: 'Zzyq Example Compound', kind: 'dose', amount: '13.25', unit: 'mg', blockIds: [DEFAULT_BLOCK_IDS.morning], onHand: '8' }, clock(1000), newId));
    expect(commitRoutineStore(repo, added.store, 1000)).toBe(3);
    expect(repo.list('daily_items')[0].data).toMatchObject({ name: 'Zzyq Example Compound', kind: 'dose', on_hand: 8, on_hand_day: '2026-11-19', start_day: '2026-11-19' });
    expect(repo.list('daily_compounds')[0].data).toMatchObject({ amount: 13.25, unit: 'mg', chart_line: 0 });
    expect(repo.get('daily_prefs', ROUTINE_PREFS_ID)).toBeUndefined();

    const logged = must(logItem(readRoutineStore(repo), added.itemId, clock(2000)));
    expect(commitRoutineStore(repo, logged, 2000)).toBe(1);
    const logId = routineLogId(added.itemId, '2026-11-19');
    expect(repo.get('daily_logs', logId)?.data).toMatchObject({ item_id: added.itemId, day: '2026-11-19', status: 'done', amount: 13.25, unit: 'mg', at: 2000, rest: 0, undone: 0 });
    expect(logItem(readRoutineStore(repo), added.itemId, clock(2001))).toBeNull();

    expect(commitRoutineStore(repo, must(undoLog(readRoutineStore(repo), logId, clock(3000))), 3000)).toBe(1);
    const undone = repo.get('daily_logs', logId);
    expect(undone?.deleted_at).toBeNull();
    expect(undone?.data).toMatchObject({ undone: 1, amount: 13.25, unit: 'mg' });
    expect(projectRoutineStore(readRoutineStore(repo))?.logs).toEqual([]);
    expect(commitRoutineStore(repo, must(restoreLog(readRoutineStore(repo), logId, clock(4000))), 4000)).toBe(1);
    expect(repo.get('daily_logs', logId)?.data).toMatchObject({ undone: 0, amount: 13.25, unit: 'mg', at: 2000 });
    expect(projectRoutineStore(readRoutineStore(repo))?.logs).toHaveLength(1);

    expect(commitRoutineStore(repo, must(saveItemNote(readRoutineStore(repo), added.itemId, 'qq4419-scribble-text', clock(5000), { vialAmount: 5, waterMl: 2, vialUnit: 'mg' })), 5000)).toBe(1);
    expect(repo.get('daily_items', added.itemId)?.data).toMatchObject({ note: 'qq4419-scribble-text', calc_vial: 5, calc_water: 2, calc_vial_unit: 'mg' });
    expect(commitRoutineStore(repo, must(setDayRollover(readRoutineStore(repo), 6, clock(6000))), 6000)).toBe(1);
    expect(readRoutineStore(repo).settings.dayRolloverHour).toBe(6);
    expect(repo.get('daily_logs', logId)?.data.day).toBe('2026-11-19');
  } finally { sqlite.close(); }
});

test('a deleted item keeps no values on the phone, and its logs stay', async () => {
  const { repo, sqlite } = await open();
  try {
    seedDefaultRoutines(repo);
    const added = must(saveItem(readRoutineStore(repo), { name: 'Zzyq Example Compound', kind: 'dose', amount: '13.25', unit: 'mg', blockIds: [DEFAULT_BLOCK_IDS.morning] }, clock(1000), uuid()));
    commitRoutineStore(repo, must(logItem(added.store, added.itemId, clock(1500))), 1500);
    const deleted = must(deleteItem(readRoutineStore(repo), added.itemId, clock(2000)));
    expect(commitRoutineStore(repo, deleted, 2000)).toBe(2);
    const gone = repo.get('daily_items', added.itemId);
    expect(gone?.deleted_at).not.toBeNull();
    expect(Object.values(gone?.data ?? {}).every(value => value === null)).toBe(true);
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM daily_items').all())).not.toContain('Zzyq');
    expect(readRoutineStore(repo).items).toEqual([]);
    expect(readRoutineStore(repo).logs).toHaveLength(1);
    expect(commitRoutineStore(repo, deleted, 2500)).toBe(0);
  } finally { sqlite.close(); }
});

test('a save is all or nothing, refuses an id that is not a row id, and never touches another owner', async () => {
  const { repo, db, sqlite } = await open();
  try {
    seedDefaultRoutines(repo);
    const other = new Repository(db, OWNER_B, DEVICE_A, uuid());
    seedDefaultRoutines(other);
    const store = readRoutineStore(repo);
    const bad: RoutineStore = { ...store, blocks: [...store.blocks.map(block => ({ ...block, name: 'Zzyq Evening Block' })), { id: 'not-a-row-id', name: 'x', color: 'pink', order: 5, updatedAt: 1, deletedAt: null }] };
    expect(() => commitRoutineStore(repo, bad, 1000)).toThrow('Local data is unavailable.');
    expect(readRoutineStore(repo)).toEqual(store);
    const renamed: RoutineStore = { ...store, blocks: store.blocks.map(block => ({ ...block, name: 'Zzyq Evening Block', days: [0, 6], startMin: 600, endMin: 660, hidden: true })) };
    expect(commitRoutineStore(repo, renamed, 1000)).toBe(2);
    expect(readRoutineStore(repo).blocks[0]).toMatchObject({ name: 'Zzyq Evening Block', days: [0, 6], startMin: 600, endMin: 660, hidden: true });
    expect(repo.get('daily_blocks', DEFAULT_BLOCK_IDS.morning)?.data.days_mask).toBe(65);
    expect(readRoutineStore(other).blocks.map(block => block.name)).toEqual(['Morning routine', 'Night routine']);
  } finally { sqlite.close(); }
});

test('a setup, a new routine, a move, a custom type and a log edit all save as rows and read back', async () => {
  const { repo, sqlite } = await open();
  try {
    seedDefaultRoutines(repo);
    const newId = uuid();
    const at = new Date(2026, 10, 19, 8, 15);
    const answers = { goals: ['supplements'], track: ['supplements'], enhancers: 'no', wake: '6-8', sleep: '10-12', count: '9+', feel: 'next' };
    let store = must(saveSetup(readRoutineStore(repo), { status: 'done', answers, removed: removedDefaultRoutines(repo) }, clock(1000), at));
    commitRoutineStore(repo, store, 1000);
    store = readRoutineStore(repo);
    expect(store.prefs).toMatchObject({ focusMode: true, typeTabs: ['supplement'], collapsedBlocks: [DEFAULT_BLOCK_IDS.night], setup: { status: 'done', answers } });
    expect(store.blocks.map(block => [block.name, block.startMin, block.endMin])).toEqual([['Morning routine', 360, 720], ['Night routine', 1260, 1380]]);

    const added = must(addBlock(store, 'Zzyq Midday Block', clock(1100), newId));
    const sheet = must(saveBlock(added.store, { ...must(blockDraft(projectRoutineStore(added.store))), name: 'Zzyq Evening Block', startMin: '18:00', endMin: '20:00' }, clock(1101), newId));
    const moved = must(moveBlock(sheet.store, sheet.blockId, -1, clock(1102)));
    const typed = must(addCustomType(moved, 'Zzyq Type', clock(1103), newId));
    const item = must(saveItem(typed.store, { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: [sheet.blockId], type: typed.typeId }, clock(1104), newId));
    const logged = must(logItem(item.store, item.itemId, clock(1105)));
    const logId = routineLogId(item.itemId, '2026-11-19');
    const edited = must(editLog(logged, logId, { amount: '300', day: '2026-11-18', note: 'Zzyq note' }, clock(1106)));
    commitRoutineStore(repo, edited.store, 1106);

    const back = readRoutineStore(repo);
    expect(projectRoutineStore(back)?.blocks.map(block => block.name)).toEqual(['Morning routine', 'Night routine', 'Zzyq Evening Block', 'Zzyq Midday Block']);
    expect(back.prefs.customTypes).toEqual([{ id: typed.typeId, name: 'Zzyq Type' }]);
    expect(back.items[0]).toMatchObject({ name: 'Example Compound A', type: typed.typeId });
    expect(back.logs).toHaveLength(1);
    expect(back.logs[0]).toMatchObject({ id: edited.logId, day: '2026-11-18', amount: 300, note: 'Zzyq note' });
    expect(edited.logId).toBe(routineLogId(item.itemId, '2026-11-18'));
    expect(repo.get('daily_logs', logId)?.deleted_at).not.toBeNull();
  } finally { sqlite.close(); }
});

test('a setup leaves a deleted default deleted, and settings can add it back empty', async () => {
  const { repo, sqlite } = await open();
  try {
    seedDefaultRoutines(repo);
    repo.remove('daily_blocks', DEFAULT_BLOCK_IDS.night, 500);
    expect(removedDefaultRoutines(repo)).toEqual([DEFAULT_BLOCK_IDS.night]);
    const store = must(saveSetup(readRoutineStore(repo), { status: 'done', answers: { goals: ['habits'] }, removed: removedDefaultRoutines(repo) }, clock(1000), new Date(2026, 10, 19, 8, 15)));
    commitRoutineStore(repo, store, 1000);
    expect(readRoutineStore(repo).blocks.map(block => block.name)).toEqual(['Morning routine']);
    commitRoutineStore(repo, must(addRoutinePart(readRoutineStore(repo), 'night', clock(1100))), 1100);
    expect(readRoutineStore(repo).blocks.map(block => block.name)).toEqual(['Morning routine', 'Night routine']);
    expect(removedDefaultRoutines(repo)).toEqual([]);
  } finally { sqlite.close(); }
});
