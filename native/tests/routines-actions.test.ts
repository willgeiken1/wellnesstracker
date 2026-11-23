import {
  deleteItem, logAllInBlock, logItem, logRest, renameItem, restoreItem, restoreLog, saveItem, saveItemNote, setDayRollover, skipItem, undoLog,
} from '../src/features/routines/model/actions';
import { reconstitutionNoteText, reconstitutionResult } from '../src/features/routines/model/calculator';
import { coveringLog, routineRestLog, routineStreak } from '../src/features/routines/model/day';
import { routineLogId, routinePlacementId } from '../src/features/routines/model/ids';
import { emptyRoutineStore, isLive, liveOf, projectRoutineStore, type RoutineStore } from '../src/features/routines/model/shape';

/* Synthetic rows only. The rules follow the web app's check-off, log-all, rest, dose and calculator tests. */

const DAY = '2026-11-19';
const clock = (now = 1000, day = DAY) => ({ now, day });
const LOG_NOTE = 'qq4419-scribble-text';
function ids() { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [
    { id: 'b-morning', name: 'Morning routine', color: 'citrus', order: 0, updatedAt: 1, deletedAt: null },
    { id: 'b-night', name: 'Night routine', color: 'pink', order: 1, updatedAt: 1, deletedAt: null },
  ] };
}
function withItems() {
  const newId = ids();
  const dose = saveItem(seeded(), { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: ['b-morning'] }, clock(10), newId);
  if (!dose) throw new Error('dose');
  const check = saveItem(dose.store, { name: 'Example Check', kind: 'check', blockIds: ['b-morning'] }, clock(11), newId);
  if (!check) throw new Error('check');
  return { store: check.store, doseId: dose.itemId, checkId: check.itemId, newId };
}
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };

describe('adding and editing an item', () => {
  test('a dose keeps the typed amount and unit on its compound, and a check keeps none', () => {
    const { store, doseId, checkId } = withItems();
    const dose = store.items.find(item => item.id === doseId);
    expect(dose).toMatchObject({ name: 'Example Compound A', kind: 'dose', startDate: DAY });
    expect(store.compounds).toHaveLength(1);
    expect(store.compounds[0]).toMatchObject({ id: dose?.compoundId, name: 'Example Compound A', amount: 250, unit: 'mcg', startDate: DAY, chartLine: false });
    expect(store.items.find(item => item.id === checkId)).toMatchObject({ kind: 'check', compoundId: null });
    expect(store.placements.map(row => [row.id, row.order])).toEqual([[routinePlacementId('b-morning', doseId), 0], [routinePlacementId('b-morning', checkId), 1]]);
  });

  test('a blank name, a missing amount, an unknown unit, a bad time or no routine is refused', () => {
    const newId = ids();
    const base = { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: ['b-morning'] };
    expect(saveItem(seeded(), { ...base, name: '   ' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, amount: '' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, amount: '-1' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, unit: 'spoons' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, kind: 'other' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, time: '25:00' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, blockIds: [] }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, blockIds: ['b-missing'] }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, onHand: '1.5' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, itemId: 'missing' }, clock(), newId)).toBeNull();
    expect(saveItem(seeded(), base, { now: 1, day: 'bad' }, newId)).toBeNull();
    expect(saveItem(seeded(), { ...base, blockIds: [], type: 'peptide', time: '21:15', onHand: '4', mixedOn: DAY }, clock(50), newId)?.store.items[0])
      .toMatchObject({ type: 'peptide', timeMin: 1275, onHand: 4, onHandDay: DAY, onHandAt: 50, mixedOn: DAY });
  });

  test('an edit keeps the compound and its start day, moves routines, and does not touch logs', () => {
    const { store, doseId, newId } = withItems();
    const logged = must(logItem(store, doseId, clock(100)));
    const edited = must(saveItem(logged, { itemId: doseId, name: 'Example Compound B', kind: 'dose', amount: '1/2', unit: 'mg', blockIds: ['b-night'] }, clock(200, '2026-11-25'), newId));
    expect(edited.itemId).toBe(doseId);
    expect(edited.store.compounds).toHaveLength(1);
    expect(edited.store.compounds[0]).toMatchObject({ name: 'Example Compound B', amount: 0.5, unit: 'mg', startDate: DAY });
    expect(liveOf(edited.store.placements).filter(row => row.itemId === doseId).map(row => row.blockId)).toEqual(['b-night']);
    expect(edited.store.logs).toEqual(logged.logs);
    expect(edited.store.logs[0]).toMatchObject({ amount: 250, unit: 'mcg' });
    const asCheck = must(saveItem(edited.store, { itemId: doseId, name: 'Example Compound B', kind: 'check', blockIds: ['b-night'] }, clock(300), newId)).store;
    expect(asCheck.items.find(item => item.id === doseId)?.compoundId).toBeNull();
    const back = must(saveItem(asCheck, { itemId: doseId, name: 'Example Compound B', kind: 'dose', amount: '2', unit: 'mg', blockIds: ['b-night'] }, clock(400), newId)).store;
    expect(back.compounds).toHaveLength(1);
    expect(back.items.find(item => item.id === doseId)?.compoundId).toBe(edited.store.compounds[0].id);
  });
});

describe('logging', () => {
  test('a log copies the saved amount and unit, one per item and day, and a skip keeps no amount', () => {
    const { store, doseId, checkId } = withItems();
    const logged = must(logItem(store, doseId, clock(100)));
    const row = logged.logs[0];
    expect(row).toEqual({ id: routineLogId(doseId, DAY), itemId: doseId, compoundId: store.compounds[0].id, day: DAY, status: 'done', amount: 250, unit: 'mcg', at: 100, updatedAt: 100, deletedAt: null });
    expect(logItem(logged, doseId, clock(101))).toBeNull();
    expect(skipItem(logged, doseId, clock(101))).toBeNull();
    expect(logItem(logged, 'missing', clock(101))).toBeNull();
    expect(logItem(logged, doseId, { now: 101, day: 'bad' })).toBeNull();
    const skipped = must(skipItem(logged, checkId, clock(102)));
    expect(skipped.logs[1]).toMatchObject({ itemId: checkId, status: 'skipped', amount: null, unit: '', compoundId: null });
    const check = must(logItem(store, checkId, clock(100)));
    expect(check.logs[0]).toMatchObject({ amount: null, unit: '', compoundId: null, status: 'done' });
    const nextDay = must(logItem(logged, doseId, clock(200, '2026-11-20')));
    expect(nextDay.logs).toHaveLength(2);
  });

  test('an undo keeps the amount, unit and note, and a restore brings them back', () => {
    const { store, doseId } = withItems();
    const logged = must(logItem(store, doseId, clock(100)));
    const noted: RoutineStore = { ...logged, logs: logged.logs.map(row => ({ ...row, amount: 13.25, note: LOG_NOTE, site: 'right-thigh' })) };
    const id = noted.logs[0].id;
    const undone = must(undoLog(noted, id, clock(150)));
    expect(undone.logs[0]).toMatchObject({ id, amount: 13.25, unit: 'mcg', note: LOG_NOTE, undone: true, deletedAt: 150, updatedAt: 150 });
    expect(isLive(undone.logs[0])).toBe(false);
    expect(coveringLog(projectRoutineStore(undone)?.logs, doseId, DAY)).toBeNull();
    expect(routineStreak(undone.logs, DAY)).toBe(0);
    expect(undoLog(undone, id, clock(160))).toBeNull();
    const restored = must(restoreLog(undone, id, clock(170)));
    expect(restored.logs[0]).toEqual({ id, itemId: doseId, compoundId: store.compounds[0].id, day: DAY, status: 'done', amount: 13.25, unit: 'mcg', at: 100, note: LOG_NOTE, site: 'right-thigh', updatedAt: 170, deletedAt: null });
    expect(restoreLog(restored, id, clock(180))).toBeNull();
    // An undo at an older clock still lands after the log it removes.
    expect(must(undoLog(noted, id, clock(5))).logs[0].updatedAt).toBe(101);
    // A day logged again after the undo is not overwritten by a restore of the old one.
    const again = must(logItem(undone, doseId, clock(190)));
    expect(isLive(again.logs[0])).toBe(true);
    expect(restoreLog(again, id, clock(200))).toBeNull();
  });

  test('a restore is refused when another live log already covers that item and day', () => {
    const { store, doseId } = withItems();
    const logged = must(logItem(store, doseId, clock(100)));
    const id = logged.logs[0].id;
    const undone = must(undoLog(logged, id, clock(150)));
    // A second copy of the same check-off, under another id, as a merge from another phone leaves it.
    const copy = { ...logged.logs[0], id: 'log-merged-copy', at: 160, updatedAt: 160, deletedAt: null };
    const covered: RoutineStore = { ...undone, logs: [...undone.logs, copy] };
    expect(coveringLog(projectRoutineStore(covered)?.logs, doseId, DAY)?.id).toBe('log-merged-copy');
    expect(restoreLog(covered, id, clock(170))).toBeNull();
    // The same copy on another day covers nothing here, so the restore goes through.
    const elsewhere: RoutineStore = { ...undone, logs: [...undone.logs, { ...copy, day: '2026-11-18' }] };
    expect(liveOf(must(restoreLog(elsewhere, id, clock(170))).logs).map(row => row.id).sort()).toEqual([id, 'log-merged-copy'].sort());
  });

  test('an undo takes every live copy of the same check-off, and leaves other items and days alone', () => {
    const { store, doseId, checkId } = withItems();
    const logged = must(logItem(must(logItem(store, doseId, clock(100))), checkId, clock(101)));
    const id = routineLogId(doseId, DAY);
    const first = logged.logs.find(row => row.id === id)!;
    // Two live copies of one check-off after a merge, and the same item logged on the day before.
    const merged: RoutineStore = { ...logged, logs: [...logged.logs,
      { ...first, id: 'log-merged-copy', at: 120, updatedAt: 120 },
      { ...first, id: routineLogId(doseId, '2026-11-18'), day: '2026-11-18', at: 50, updatedAt: 50 }] };
    const undone = must(undoLog(merged, id, clock(200)));
    const gone = undone.logs.filter(row => row.undone === true).map(row => row.id).sort();
    expect(gone).toEqual([id, 'log-merged-copy'].sort());
    for (const row of undone.logs.filter(row => row.undone === true)) expect(row).toMatchObject({ deletedAt: 200, updatedAt: 200 });
    expect(coveringLog(projectRoutineStore(undone)?.logs, doseId, DAY)).toBeNull();
    expect(liveOf(undone.logs).map(row => row.id).sort()).toEqual([routineLogId(checkId, DAY), routineLogId(doseId, '2026-11-18')].sort());
    // Undoing the copy takes the first one with it too.
    expect(coveringLog(projectRoutineStore(must(undoLog(merged, 'log-merged-copy', clock(200))))?.logs, doseId, DAY)).toBeNull();
  });

  test('log all writes one done log per open item, and a rest day writes none', () => {
    const { store, doseId, checkId } = withItems();
    const skipped = must(skipItem(store, checkId, clock(90)));
    const all = must(logAllInBlock(skipped, 'b-morning', clock(100)));
    expect(all.logIds).toEqual([routineLogId(doseId, DAY)]);
    expect(liveOf(all.store.logs)).toHaveLength(2);
    expect(logAllInBlock(all.store, 'b-morning', clock(110))).toBeNull();
    expect(logAllInBlock(store, 'b-night', clock(110))).toBeNull();
    expect(logAllInBlock(store, 'b-missing', clock(110))).toBeNull();
    const rested = must(logRest(store, clock(100)));
    expect(rested.logs[0]).toMatchObject({ id: routineLogId(null, DAY), rest: true, itemId: null, amount: null, status: 'done' });
    expect(logRest(rested, clock(101))).toBeNull();
    expect(logAllInBlock(rested, 'b-morning', clock(110))).toBeNull();
    const restId = rested.logs[0].id;
    const unrested = must(undoLog(rested, restId, clock(120)));
    expect(routineRestLog(projectRoutineStore(unrested)?.logs, DAY)).toBeNull();
    expect(must(restoreLog(unrested, restId, clock(130))).logs[0]).toMatchObject({ rest: true, deletedAt: null });
  });

  test('the day rollover hour is 0 to 6 and does not rewrite stored days', () => {
    const { store, doseId } = withItems();
    const logged = must(logItem(store, doseId, clock(100)));
    const next = must(setDayRollover(logged, 6, clock(200)));
    expect(next.settings).toEqual({ dayRolloverHour: 6, updatedAt: 200 });
    expect(next.logs).toEqual(logged.logs);
    for (const bad of [7, -1, 4.5, '4', null]) expect(setDayRollover(logged, bad, clock(200))).toBeNull();
  });
});

describe('notes, renames and deletes', () => {
  test('save as note writes the item and does not log', () => {
    const { store, doseId, checkId } = withItems();
    const result = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: 'mg', doseUnit: 'mcg' });
    const noted = must(saveItemNote(store, doseId, reconstitutionNoteText(result), clock(100), { vialAmount: 5, waterMl: 2, vialUnit: 'mg' }));
    const item = noted.items.find(row => row.id === doseId);
    expect(item?.note).toBe('0.1 mL · 10 U-100 units. What you entered. Not a recommendation.');
    expect(item).toMatchObject({ calcVial: 5, calcWater: 2, calcVialUnit: 'mg' });
    expect(noted.logs).toHaveLength(0);
    expect(saveItemNote(store, checkId, '1 < 2', clock(100))).toBeNull();
    expect(saveItemNote(store, doseId, 10, clock(100))).toBeNull();
    const typed = must(saveItemNote(noted, doseId, '  1 < 2 & 3  ', clock(110)));
    expect(typed.items.find(row => row.id === doseId)?.note).toBe('1 < 2 & 3');
    expect(typed.items.find(row => row.id === doseId)?.calcVial).toBeUndefined();
    const long = must(saveItemNote(noted, doseId, `${'q'.repeat(500)}TRAILING`, clock(120)));
    expect(long.items.find(row => row.id === doseId)?.note).toHaveLength(500);
    const blank = must(saveItemNote(noted, doseId, '   ', clock(130)));
    expect(blank.items.find(row => row.id === doseId)?.note).toBeUndefined();
  });

  test('a rename keeps the note and renames the compound, and a delete then restore keeps both', () => {
    const { store, doseId } = withItems();
    const noted = must(saveItemNote(store, doseId, 'kept note', clock(100)));
    const logged = must(logItem(noted, doseId, clock(105)));
    const renamed = must(renameItem(logged, doseId, '  Example Compound B  ', clock(110)));
    expect(renamed.items.find(row => row.id === doseId)).toMatchObject({ name: 'Example Compound B', note: 'kept note' });
    expect(renamed.compounds[0].name).toBe('Example Compound B');
    expect(renameItem(logged, doseId, '   ', clock(110))).toBeNull();
    const deleted = must(deleteItem(renamed, doseId, clock(120)));
    expect(isLive(deleted.items.find(row => row.id === doseId))).toBe(false);
    expect(liveOf(deleted.placements).some(row => row.itemId === doseId)).toBe(false);
    expect(deleted.logs).toEqual(renamed.logs);
    expect(projectRoutineStore(deleted)?.items.some(row => row.id === doseId)).toBe(false);
    expect(deleteItem(deleted, doseId, clock(121))).toBeNull();
    const restored = must(restoreItem(deleted, doseId, clock(130)));
    expect(restored.items.find(row => row.id === doseId)).toMatchObject({ name: 'Example Compound B', note: 'kept note', deletedAt: null });
    expect(liveOf(restored.placements).filter(row => row.itemId === doseId)).toHaveLength(1);
    expect(restoreItem(restored, doseId, clock(140))).toBeNull();
  });
});
