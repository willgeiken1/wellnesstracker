import { saveItem } from '../src/features/routines/model/actions';
import { customTypeId } from '../src/features/routines/model/ids';
import { emptyRoutineStore, projectRoutineStore, type RoutineStore } from '../src/features/routines/model/shape';
import {
  addCustomType, CUSTOM_TYPE_MAX, routineClock24, routineCustomTypes, routineDayLetters, routineDaysLabel, routineDosesLeft, routineHiddenNote, routineItemBlocks, routineItemLabel,
  routineItemTimeMin, routineItemType, routineLastTaken, routineShortName, routineTypeChoices, routineTypedItems, routineTypeName, routineTypeTabs, routineWeekTaken, routineWindowLabel,
} from '../src/features/routines/model/types';

/* Synthetic rows only. The rules follow the type parts of the web app's instrument and fixes tests. */

const DAY = '2026-11-19'; // a Thursday
const clock = (now = 1000, day = DAY) => ({ now, day });
function ids() { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [
    { id: 'b-morning', name: 'Morning routine', color: 'citrus', order: 0, startMin: 420, endMin: 600, days: [0, 1, 2, 3, 4], updatedAt: 1, deletedAt: null },
    { id: 'b-night', name: 'Night routine', color: 'pink', order: 1, updatedAt: 1, deletedAt: null },
    { id: 'b-hidden', name: 'Zzyq Old Block', color: 'pink', order: 2, hidden: true, updatedAt: 1, deletedAt: null },
  ] };
}

describe('type names and choices', () => {
  test('built-in types have one fixed name each, and a custom type keeps the name it was given', () => {
    const made = must(addCustomType(seeded(), '  Skin   care ', clock(), ids()));
    expect(made.added).toBe(true);
    expect(made.typeId).toBe(customTypeId('00000000-0000-4000-8000-000000000001'));
    expect(routineTypeName('peptide', made.store.prefs)).toBe('Peptides');
    expect(routineTypeName('peptide', made.store.prefs, false)).toBe('Peptide');
    expect(routineTypeName('other', null)).toBe('Other');
    expect(routineTypeName(made.typeId, made.store.prefs)).toBe('Skin care');
    expect(routineTypeName('type_missing', made.store.prefs)).toBe('');
    expect(routineTypeChoices(made.store.prefs).map(choice => [choice.name, choice.custom])).toEqual([
      ['Supplement', false], ['Medication', false], ['Peptide', false], ['Enhancer', false], ['Other', false], ['Skin care', true],
    ]);
  });

  test('the same name in another letter case is the type already there, and the list stops at twelve', () => {
    const newId = ids();
    let store = seeded();
    const first = must(addCustomType(store, 'Skin care', clock(10), newId));
    const again = must(addCustomType(first.store, 'SKIN CARE', clock(11), newId));
    expect(again).toMatchObject({ typeId: first.typeId, added: false });
    expect(again.store.prefs.customTypes).toHaveLength(1);
    expect(addCustomType(first.store, '   ', clock(), newId)).toBeNull();
    expect(addCustomType(first.store, 'Another', clock(), () => 'not-a-row-id')).toBeNull();
    store = first.store;
    for (let n = 1; n < CUSTOM_TYPE_MAX; n += 1) store = must(addCustomType(store, `Zzyq Type ${n}`, clock(20 + n), newId)).store;
    expect(routineCustomTypes(store.prefs)).toHaveLength(CUSTOM_TYPE_MAX);
    expect(addCustomType(store, 'One too many', clock(99), newId)).toBeNull();
    expect(store.prefs.updatedAt).toBeGreaterThan(first.store.prefs.updatedAt);
  });

  test('bad rows and repeats drop out of the custom list', () => {
    const id = customTypeId('00000000-0000-4000-8000-000000000001');
    expect(routineCustomTypes({ customTypes: [{ id, name: ' A ' }, { id, name: 'again' }, { id: 'peptide', name: 'x' }, { id: `${id}2`, name: '  ' }, null as never] })).toEqual([{ id, name: 'A' }]);
    expect(routineCustomTypes(null)).toEqual([]);
  });
});

describe('type tabs', () => {
  test('a tab shows once an item has the type or a setting turned it on, in a fixed order', () => {
    const newId = ids();
    expect(routineTypeTabs(projectRoutineStore(seeded()))).toEqual([]);
    const custom = must(addCustomType(seeded(), 'Skin care', clock(5), newId));
    let store = must(saveItem(custom.store, { name: 'Zzyq Cream', kind: 'check', type: custom.typeId }, clock(10), newId)).store;
    store = must(saveItem(store, { name: 'Zzyq Example Peptide', kind: 'dose', amount: '250', unit: 'mcg', type: 'peptide' }, clock(11), newId)).store;
    store = { ...store, prefs: { ...store.prefs, typeTabs: ['medication', 'supplement'] } };
    expect(routineTypeTabs(projectRoutineStore(store))).toEqual(['supplement', 'peptide', 'medication', custom.typeId]);
  });

  test('an item whose custom type is gone has no type and no tab', () => {
    const view = { items: [{ id: 'i1', name: 'Zzyq', type: 'type_gone', updatedAt: 1, deletedAt: null }], prefs: {} };
    expect(routineItemType(view.items[0], view.prefs)).toBe('');
    expect(routineTypeTabs(view)).toEqual([]);
  });

  test('a tab lists its items by the time they are taken, then by name', () => {
    const newId = ids();
    let store = must(saveItem(seeded(), { name: 'Zzyq C', kind: 'check', type: 'supplement' }, clock(10), newId)).store;
    store = must(saveItem(store, { name: 'Zzyq B', kind: 'check', type: 'supplement', time: '21:30' }, clock(11), newId)).store;
    store = must(saveItem(store, { name: 'Zzyq A', kind: 'check', type: 'supplement', blockIds: ['b-morning'] }, clock(12), newId)).store;
    store = must(saveItem(store, { name: 'Zzyq Elsewhere', kind: 'check', type: 'medication' }, clock(13), newId)).store;
    const view = must(projectRoutineStore(store));
    expect(routineTypedItems(view, 'supplement').map(item => item.name)).toEqual(['Zzyq A', 'Zzyq B', 'Zzyq C']);
    const [a, b, c] = routineTypedItems(view, 'supplement');
    expect(routineItemTimeMin(view, a)).toBe(420);
    expect(routineItemTimeMin(view, b)).toBe(1290);
    expect(routineItemTimeMin(view, c)).toBeNull();
    expect(routineItemLabel(view, a)).toBe('Morning · Weekdays · 07:00');
    expect(routineItemLabel(view, b)).toBe('Daily · 21:30');
    expect(routineItemLabel(view, c)).toBe('Daily');
    expect(routineItemBlocks(view, a).map(block => block.id)).toEqual(['b-morning']);
  });

  test('a hidden routine is not one of the routines an item sits in', () => {
    const store: RoutineStore = { ...seeded(),
      items: [{ id: 'i1', name: 'Zzyq', kind: 'check', compoundId: null, type: 'supplement', updatedAt: 1, deletedAt: null }],
      placements: [{ id: 'p1', blockId: 'b-hidden', itemId: 'i1', order: 0, updatedAt: 1, deletedAt: null }] };
    expect(routineItemBlocks(store, store.items[0])).toEqual([]);
    expect(routineItemBlocks(null, store.items[0])).toEqual([]);
    expect(routineHiddenNote(store, store.blocks[2])).toBe('Its item now lives on its tab');
    expect(routineHiddenNote(store, store.blocks[1])).toBe('Nothing in it');
    const untyped = { ...store, items: [{ ...store.items[0], type: undefined }, { ...store.items[0], id: 'i2' }], placements: [...store.placements, { ...store.placements[0], id: 'p2', itemId: 'i2' }] };
    expect(routineHiddenNote(untyped, store.blocks[2])).toBe('2 items');
    expect(routineHiddenNote({ ...untyped, items: untyped.items.map(item => ({ ...item, type: 'other' })) }, store.blocks[2])).toBe('Its 2 items now live on their tabs');
    expect(routineHiddenNote({ ...untyped, items: [untyped.items[0]] }, store.blocks[2])).toBe('1 item');
    expect(routineHiddenNote(null, store.blocks[2])).toBe('');
  });
});

describe('labels', () => {
  test('clock, weekdays, short names and windows read the same as on the web', () => {
    expect(routineClock24(465)).toBe('07:45');
    expect(routineClock24(1440 + 30)).toBe('00:30');
    expect(routineClock24(-30)).toBe('23:30');
    expect(routineClock24(NaN)).toBe('');
    expect(routineDaysLabel(null)).toBe('Daily');
    expect(routineDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Daily');
    expect(routineDaysLabel([4, 3, 2, 1, 0])).toBe('Weekdays');
    expect(routineDaysLabel([5, 6])).toBe('Weekends');
    expect(routineDaysLabel([0, 2, 4, 4])).toBe('Mon Wed Fri');
    expect(routineDayLetters()).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(routineShortName({ name: 'Wind-down routine' })).toBe('Wind-down');
    expect(routineShortName({ name: 'Zzyq Evening Block' })).toBe('Zzyq Evening Block');
    expect(routineShortName(null)).toBe('');
    expect(routineWindowLabel({ startMin: 300, endMin: 660 })).toBe('05:00–11:00');
    expect(routineWindowLabel({ startMin: 1320, endMin: 1500 })).toBe('22:00–01:00');
    expect(routineWindowLabel({ name: 'Night routine' })).toBe('17:00–23:00');
    expect(routineWindowLabel({ name: 'Zzyq Evening Block' })).toBe('');
  });
});

describe('what is left, this week, and the last taken log', () => {
  const log = (day: string, at: number, extra: object = {}) => ({ id: `l-${day}-${at}`, itemId: 'i1', day, status: 'done', at, updatedAt: at, deletedAt: null, amount: 250, unit: 'mcg', ...extra });

  test('the count goes down by logged days, never by amounts', () => {
    const item = { id: 'i1', onHand: 10, onHandDay: '2026-11-17', onHandAt: 500 };
    const logs = [
      log('2026-11-16', 100), // before the count
      log('2026-11-17', 400), // the day of the count, before it was typed
      log('2026-11-17', 600), // the day of the count, after it was typed
      log('2026-11-18', 700, { amount: 5000 }),
      log('2026-11-18', 701), // a second log the same day is one day
      log('2026-11-19', 800, { status: 'skipped' }),
      log('2026-11-19', 801, { rest: true }),
      log('2026-11-19', 802, { deletedAt: 900, undone: true }),
      log('2026-11-19', 803, { itemId: 'other' }),
      log('2026-11-19', 804, { status: 'partial' }),
    ];
    expect(routineDosesLeft(item, logs)).toEqual({ left: 7, total: 10 });
    expect(routineDosesLeft({ ...item, onHandAt: undefined }, logs)).toEqual({ left: 8, total: 10 });
    expect(routineDosesLeft({ id: 'i1', onHand: 1 }, logs)).toEqual({ left: 0, total: 1 });
    expect(routineDosesLeft({ id: 'i1', onHand: 0 }, [])).toEqual({ left: 0, total: 0 });
    expect(routineDosesLeft({ id: 'i1' }, logs)).toBeNull();
    expect(routineDosesLeft({ id: 'i1', onHand: 1.5 }, logs)).toBeNull();
    expect(routineDosesLeft(null, logs)).toBeNull();
    expect(routineDosesLeft(item, null)).toEqual({ left: 10, total: 10 });
  });

  test('the week runs Monday to Sunday and marks the days with a taken log', () => {
    const logs = [log('2026-11-16', 1), log('2026-11-18', 2, { status: 'partial' }), log('2026-11-19', 3, { status: 'skipped' }), log('2026-11-15', 4), log('2026-11-22', 5)];
    expect(routineWeekTaken(logs, 'i1', DAY)).toEqual({ days: [true, false, true, false, false, false, true], today: 3 });
    expect(routineWeekTaken(logs, 'i1', 'bad')).toEqual({ days: [], today: -1 });
    expect(routineWeekTaken(null, 'i1', DAY).days).toEqual([false, false, false, false, false, false, false]);
  });

  test('the last taken log is the newest done or partial one', () => {
    const logs = [log('2026-11-16', 10), log('2026-11-18', 30, { site: 'left-thigh' }), log('2026-11-19', 40, { status: 'skipped' }), log('2026-11-19', 50, { deletedAt: 60 })];
    expect(routineLastTaken(logs, 'i1')).toMatchObject({ at: 30, site: 'left-thigh' });
    expect(routineLastTaken(logs, 'other')).toBeNull();
    expect(routineLastTaken(null, 'i1')).toBeNull();
  });
});
