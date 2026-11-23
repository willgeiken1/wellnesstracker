import { logItem, saveItem, skipItem, undoLog } from '../src/features/routines/model/actions';
import { hideBlock, saveBlock, blockDraft, toggleCollapsed } from '../src/features/routines/model/blocks';
import {
  addRoutineTile, clampRoutineTileStack, isRoutineTileId, NEXT_UP_TILE_ID, nextUpWanted, normalizeTileGate, parseClockMinutes, revealRoutineJump, ROUTINE_TILE_STACK_CAP,
  ROUTINE_TILE_TEXT, routineBlockTileId, routineDefaultSize, routineGateRefresh, routineGateSignature, routineItemTileId, routineTile, routineTileJump, routineTileOnNow,
  routineTileTarget, routineTrayEntries, sanitizeRoutineGates, setNextUpHidden, tileGateVisible,
} from '../src/features/routines/model/home-tiles';
import { routineLogId } from '../src/features/routines/model/ids';
import { emptyRoutineStore, liveOf, projectRoutineStore, type RoutineStore } from '../src/features/routines/model/shape';

/* Synthetic rows only. The rules follow the web app's Home tile tests for routines. */

const DAY = '2026-11-19'; /* a Thursday */
const clock = (now = 1000, day = DAY) => ({ now, day });
function ids(prefix = 0) { let n = 0; return () => `0000000${prefix}-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };
const at = (hour: number, minute = 0) => new Date(2026, 10, 19, hour, minute);
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [
    { id: 'b-morning', name: 'Morning routine', color: 'citrus', order: 0, updatedAt: 1, deletedAt: null },
    { id: 'b-night', name: 'Night routine', color: 'pink', order: 1, updatedAt: 1, deletedAt: null },
  ] };
}
function filled() {
  const newId = ids();
  /* Saved night first, so page order has to come from the routines, not from when a row was made. */
  const n = must(saveItem(seeded(), { name: 'Example Check Night', kind: 'check', blockIds: ['b-night'] }, clock(10), newId));
  const a = must(saveItem(n.store, { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: ['b-morning'] }, clock(11), newId));
  const b = must(saveItem(a.store, { name: 'Example Check', kind: 'check', blockIds: ['b-morning', 'b-night'] }, clock(12), newId));
  const loose = must(saveItem(b.store, { name: 'Example Compound Loose', kind: 'dose', amount: '0.5', unit: 'mL', type: 'supplement', blockIds: [] }, clock(13), newId));
  return { store: loose.store, n: n.itemId, a: a.itemId, b: b.itemId, loose: loose.itemId, newId };
}

describe('tile ids', () => {
  test('three kinds of id, and nothing else', () => {
    expect(NEXT_UP_TILE_ID).toBe('routine-next');
    expect(routineBlockTileId('b-morning')).toBe('routine-block:b-morning');
    expect(routineItemTileId('i-1')).toBe('routine-item:i-1');
    expect(routineBlockTileId('')).toBe('');
    expect(routineItemTileId('x'.repeat(81))).toBe('');
    expect(routineItemTileId(7)).toBe('');
    for (const id of ['routine-next', 'routine-block:b', 'routine-item:i']) expect(isRoutineTileId(id)).toBe(true);
    for (const id of ['routine-block:', 'routine-item:', 'routine', 'weight', '', null, 5]) expect(isRoutineTileId(id)).toBe(false);
    expect(routineTileTarget('routine-next')).toEqual({ kind: 'next' });
    expect(routineTileTarget('routine-block:b-night')).toEqual({ kind: 'block', blockId: 'b-night' });
    expect(routineTileTarget('routine-item:i-1')).toEqual({ kind: 'item', itemId: 'i-1' });
    expect(routineTileTarget('weight')).toBeNull();
  });

  test('an item tile starts small, the others big, and a stack stops at five', () => {
    expect(routineDefaultSize('routine-item:i-1')).toBe('small');
    expect(routineDefaultSize('routine-block:b')).toBe('medium');
    expect(routineDefaultSize(NEXT_UP_TILE_ID)).toBe('medium');
    expect(ROUTINE_TILE_STACK_CAP).toBe(5);
    expect(clampRoutineTileStack(['a', 'b', 'a', '', 4, 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(clampRoutineTileStack(null)).toEqual([]);
  });
});

describe('clock windows', () => {
  test('a window needs two different clock times', () => {
    expect(parseClockMinutes('05:30')).toBe(330);
    expect(parseClockMinutes(' 5:30 ')).toBe(330);
    for (const bad of ['24:00', '12:60', '5', '5:3', 'noon', 530, null]) expect(parseClockMinutes(bad)).toBeNull();
    expect(normalizeTileGate({ start: '5:30', end: '06:30' })).toEqual({ start: '05:30', end: '06:30' });
    expect(normalizeTileGate({ start: '05:30', end: '05:30' })).toBeNull();
    expect(normalizeTileGate({ start: '05:30' })).toBeNull();
    expect(normalizeTileGate(['05:30', '06:30'])).toBeNull();
    expect(sanitizeRoutineGates({ 'routine-next': { start: '5:30', end: '6:30' }, weight: { start: '05:30', end: '06:30' }, 'routine-item:i': { start: 'x', end: 'y' } })).toEqual({ 'routine-next': { start: '05:30', end: '06:30' } });
    expect(sanitizeRoutineGates({ weight: { start: '05:30', end: '06:30' } })).toBeNull();
    expect(sanitizeRoutineGates(null)).toBeNull();
  });

  test('the end is exclusive, a window wraps past midnight, and no window is always on', () => {
    const gate = { start: '05:30', end: '06:30' };
    expect(tileGateVisible(gate, at(5, 29))).toBe(false);
    expect(tileGateVisible(gate, at(5, 30))).toBe(true);
    expect(tileGateVisible(gate, at(6, 29))).toBe(true);
    expect(tileGateVisible(gate, at(6, 30))).toBe(false);
    const night = { start: '22:00', end: '02:00' };
    expect(tileGateVisible(night, at(23))).toBe(true);
    expect(tileGateVisible(night, at(1, 59))).toBe(true);
    expect(tileGateVisible(night, at(2))).toBe(false);
    expect(tileGateVisible(night, at(12))).toBe(false);
    expect(tileGateVisible(null, at(12))).toBe(true);
    expect(tileGateVisible({ start: 'x', end: 'y' }, at(12))).toBe(true);
    expect(routineTileOnNow('weight', {}, at(12))).toBe(false);
    expect(routineTileOnNow('routine-next', { routineGates: { 'routine-next': gate } }, at(6))).toBe(true);
    expect(routineTileOnNow('routine-next', { routineGates: { 'routine-next': gate } }, at(7))).toBe(false);
  });

  test('Home redraws only when a window opens or closes', () => {
    const layout = { items: ['weight', 'routine-next', 'routine-block:b-night', 'routine-item:i-1'], hidden: ['routine-item:i-1'], routineGates: { 'routine-next': { start: '05:30', end: '06:30' }, 'routine-item:i-1': { start: '05:00', end: '09:00' } } };
    expect(routineGateSignature(layout, at(5))).toBe('');
    expect(routineGateSignature(layout, at(6))).toBe('routine-next');
    const first = routineGateRefresh(null, layout, at(5));
    expect(first).toEqual({ signature: '', changed: false });
    expect(routineGateRefresh(first.signature, layout, at(5, 10)).changed).toBe(false);
    const open = routineGateRefresh(first.signature, layout, at(5, 30));
    expect(open).toEqual({ signature: 'routine-next', changed: true });
    expect(routineGateRefresh(open.signature, layout, at(6, 30))).toEqual({ signature: '', changed: true });
    expect(routineGateSignature(null, at(6))).toBe('');
  });
});

describe('what a tile shows', () => {
  test('Next up is the first open row in page order, with the amount the user saved', () => {
    const { store, a, b, n, loose } = filled();
    expect(routineTile(store, NEXT_UP_TILE_ID, DAY)).toEqual({ id: NEXT_UP_TILE_ID, size: 'medium', kicker: 'Next up', title: 'Example Compound A · 250 mcg', rows: [{ itemId: a, label: 'Example Compound A · 250 mcg', canLog: true }], more: '', empty: 'All done today', when: '' });
    const one = must(logItem(store, a, clock(100)));
    expect(routineTile(one, NEXT_UP_TILE_ID, DAY)?.title).toBe('Example Check');
    /* A skip covers the row too, and an undone log opens it again. */
    const two = must(skipItem(one, b, clock(101)));
    expect(routineTile(two, NEXT_UP_TILE_ID, DAY)?.rows[0].itemId).toBe(n);
    expect(routineTile(must(undoLog(two, routineLogId(b, DAY), clock(102))), NEXT_UP_TILE_ID, DAY)?.rows[0].itemId).toBe(b);
    /* After the routines come typed items that sit in no routine. */
    const three = must(logItem(two, n, clock(103)));
    expect(routineTile(three, NEXT_UP_TILE_ID, DAY)?.rows).toEqual([{ itemId: loose, label: 'Example Compound Loose · 0.5 mL', canLog: true }]);
    const all = must(logItem(three, loose, clock(104)));
    expect(routineTile(all, NEXT_UP_TILE_ID, DAY)).toMatchObject({ title: 'All done today', rows: [], empty: 'All done today' });
    expect(routineTile(all, NEXT_UP_TILE_ID, '2026-11-20')?.rows[0].itemId).toBe(a);
    expect(routineTile(emptyRoutineStore(), NEXT_UP_TILE_ID, DAY)).toMatchObject({ title: 'All done today', rows: [] });
  });

  test('a routine tile lists up to four open rows, then how many more', () => {
    const { store, a, b, newId } = filled();
    const id = routineBlockTileId('b-morning');
    expect(routineTile(store, id, DAY)).toMatchObject({ kicker: 'Morning routine', title: 'Morning routine', rows: [{ itemId: a, label: 'Example Compound A · 250 mcg', canLog: true }, { itemId: b, label: 'Example Check', canLog: true }], more: '' });
    expect(routineTile(store, id, DAY, { size: 'small' })).toMatchObject({ size: 'small', kicker: 'Routine', title: 'Morning routine' });
    let many = store;
    for (const name of ['Zzyq C', 'Zzyq D', 'Zzyq E', 'Zzyq F']) many = must(saveItem(many, { name, kind: 'check', blockIds: ['b-morning'] }, clock(20), newId)).store;
    expect(routineTile(many, id, DAY)).toMatchObject({ more: '2 more' });
    expect(routineTile(many, id, DAY)?.rows).toHaveLength(4);
    const done = must(logItem(must(logItem(store, a, clock(100))), b, clock(101)));
    expect(routineTile(done, id, DAY)).toMatchObject({ rows: [], empty: 'All done today' });
    expect(routineTile(store, routineBlockTileId('missing'), DAY)).toMatchObject({ kicker: 'Routine', title: 'Routine', rows: [] });
  });

  test('a routine that does not run today shows no row, and its items are not next', () => {
    const { store, a } = filled();
    const draft = { ...must(blockDraft(projectRoutineStore(store), 'b-morning')), days: [0] };
    const mondays = must(saveBlock(store, draft, clock(50), ids(1))).store;
    expect(routineTile(mondays, routineBlockTileId('b-morning'), DAY)?.rows).toEqual([]);
    expect(routineTile(mondays, NEXT_UP_TILE_ID, DAY)?.title).toBe('Example Check Night');
    expect(routineTile(mondays, routineItemTileId(a), DAY)?.rows).toEqual([{ itemId: a, label: 'Example Compound A · 250 mcg', canLog: false }]);
    expect(routineTile(mondays, NEXT_UP_TILE_ID, '2026-11-23')?.title).toBe('Example Compound A · 250 mcg');
  });

  test('an item tile can be logged until it is, and a removed one has nothing to show', () => {
    const { store, a, loose } = filled();
    const id = routineItemTileId(a);
    expect(routineTile(store, id, DAY)).toMatchObject({ size: 'small', kicker: 'Routine', title: 'Example Compound A · 250 mcg', rows: [{ itemId: a, canLog: true }] });
    expect(routineTile(must(logItem(store, a, clock(100))), id, DAY)?.rows[0].canLog).toBe(false);
    expect(routineTile(store, routineItemTileId(loose), DAY)?.rows[0].canLog).toBe(true);
    expect(routineTile(store, routineItemTileId('missing'), DAY)).toMatchObject({ title: 'Item', rows: [], empty: 'Nothing to show yet' });
    expect(routineTile(store, 'weight', DAY)).toBeNull();
    expect(routineTile(store, id, 'nope')).toBeNull();
    expect(routineTile(store, id, DAY, { layout: { routineGates: { [id]: { start: '5:30', end: '6:30' } } } })?.when).toBe('05:30–06:30');
  });

  test('a tile only reads: nothing is written and no amount is worked out', () => {
    const { store, a } = filled();
    const before = JSON.stringify(store);
    routineTile(store, NEXT_UP_TILE_ID, DAY);
    routineTile(store, routineItemTileId(a), DAY);
    routineTrayEntries(store, [], 'x');
    expect(JSON.stringify(store)).toBe(before);
    expect(JSON.stringify(ROUTINE_TILE_TEXT)).not.toMatch(/recommended dose|should take|prescrib|typical dose|suggested dose|you should/i);
    expect(ROUTINE_TILE_TEXT).toMatchObject({ next: 'Next up', allDone: 'All done today', nothing: 'Nothing to show yet', log: 'Log', open: 'Open', remove: 'Remove from Home' });
  });
});

describe('Next up on Home', () => {
  test('it shows once there is an item, and Remove sticks', () => {
    const { store } = filled();
    expect(nextUpWanted(seeded())).toBe(false);
    expect(nextUpWanted(null)).toBe(false);
    expect(nextUpWanted(store)).toBe(true);
    expect(nextUpWanted(store, { items: ['weight'], hidden: [] })).toBe(true);
    expect(nextUpWanted(store, { items: [NEXT_UP_TILE_ID] })).toBe(false);
    expect(nextUpWanted(store, { hidden: [NEXT_UP_TILE_ID] })).toBe(false);
    const hidden = must(setNextUpHidden(store, true, clock(500)));
    expect(hidden.prefs).toMatchObject({ homeNextHidden: true, updatedAt: 500 });
    expect(nextUpWanted(hidden)).toBe(false);
    expect(liveOf(hidden.items)).toHaveLength(4);
    expect(setNextUpHidden(hidden, true, clock(501))).toBeNull();
    const back = must(setNextUpHidden(hidden, false, clock(400)));
    expect(back.prefs.homeNextHidden).toBeUndefined();
    expect(back.prefs.updatedAt).toBe(501);
    expect(setNextUpHidden(store, true, { now: NaN, day: DAY })).toBeNull();
  });
});

describe('the tile picker', () => {
  test('Next up, each shown routine, then each item once, searched by title only', () => {
    const { store, a, b, n, loose } = filled();
    const hidden = must(hideBlock(store, 'b-night', clock(50)));
    expect(routineTrayEntries(store, []).map(row => row.title)).toEqual(['Next up', 'Morning routine', 'Night routine', 'Example Compound A', 'Example Check', 'Example Check Night', 'Example Compound Loose']);
    expect(routineTrayEntries(store, []).map(row => row.id).slice(3)).toEqual([a, b, n, loose].map(routineItemTileId));
    expect(routineTrayEntries(hidden, []).map(row => row.title)).toEqual(['Next up', 'Morning routine', 'Example Compound A', 'Example Check', 'Example Compound Loose']);
    expect(routineTrayEntries(store, [NEXT_UP_TILE_ID, routineItemTileId(a)]).map(row => row.title)).not.toEqual(expect.arrayContaining(['Next up', 'Example Compound A']));
    expect(routineTrayEntries(store, [], '  COMPOUND ').map(row => row.title)).toEqual(['Example Compound A', 'Example Compound Loose']);
    expect(routineTrayEntries(store, [], '250')).toEqual([]);
    expect(routineTrayEntries(store, [], 'mcg')).toEqual([]);
    expect(routineTrayEntries(null, [])).toEqual([{ id: NEXT_UP_TILE_ID, title: 'Next up' }]);
  });

  test('adding puts the tile on the draft with its size and window', () => {
    const draft = { items: ['weight'], hidden: ['routine-item:i-1', 'steps'], sizes: {}, gates: {} };
    const added = addRoutineTile(draft, 'routine-item:i-1', 'medium', { start: '5:30', end: '6:30' });
    expect(added).toEqual({ items: ['weight', 'routine-item:i-1'], hidden: ['steps'], sizes: { 'routine-item:i-1': 'medium' }, gates: { 'routine-item:i-1': { start: '05:30', end: '06:30' } } });
    expect(draft.items).toEqual(['weight']);
    expect(addRoutineTile(added, 'routine-item:i-1', 'small')).toEqual(added);
    expect(addRoutineTile(added, 'weight2')).toEqual(added);
    const plain = addRoutineTile(added, NEXT_UP_TILE_ID, 'medium', { start: 'x', end: 'y' });
    expect(plain.sizes).toEqual({ 'routine-item:i-1': 'medium' });
    expect(plain.gates[NEXT_UP_TILE_ID]).toBeUndefined();
    /* A Home made only of routine tiles is a real layout. */
    expect(addRoutineTile(null, 'routine-block:b-night', 'small')).toEqual({ items: ['routine-block:b-night'], hidden: [], sizes: { 'routine-block:b-night': 'small' }, gates: {} });
  });
});

describe('tapping a tile', () => {
  test('a tap goes to the routine, the item, or what is next', () => {
    const { store, a, b, loose } = filled();
    expect(routineTileJump(store, routineBlockTileId('b-night'), DAY)).toEqual({ kind: 'block', blockId: 'b-night', itemId: '', view: 'routines' });
    expect(routineTileJump(store, routineItemTileId(b), DAY)).toEqual({ kind: 'item', blockId: 'b-morning', itemId: b, view: 'routines' });
    expect(routineTileJump(store, NEXT_UP_TILE_ID, DAY)).toEqual({ kind: 'item', blockId: 'b-morning', itemId: a, view: 'routines' });
    /* An item in no routine opens on its type tab. */
    expect(routineTileJump(store, routineItemTileId(loose), DAY)).toEqual({ kind: 'item', blockId: '', itemId: loose, view: 'supplement' });
    let all = store;
    for (const id of liveOf(store.items).map(item => item.id)) all = must(logItem(all, id, clock(100)));
    expect(routineTileJump(all, NEXT_UP_TILE_ID, DAY)).toEqual({ kind: 'next', blockId: '', itemId: '', view: 'routines' });
    expect(routineTileJump(store, 'weight', DAY)).toBeNull();
  });

  test('a jump opens a folded routine, and reveals it when the item is already logged', () => {
    const { store, n } = filled();
    const folded = must(toggleCollapsed(store, 'b-night', clock(50)));
    expect(folded.prefs.collapsedBlocks).toEqual(['b-night']);
    const open = must(revealRoutineJump(folded, { blockId: 'b-night' }, clock(60)));
    expect(open.prefs.collapsedBlocks).toBeUndefined();
    expect(open.prefs.revealBlocks).toBeUndefined();
    expect(open.prefs.updatedAt).toBe(60);
    const logged = must(logItem(folded, n, clock(55)));
    const shown = must(revealRoutineJump(logged, { itemId: n }, clock(60)));
    expect(shown.prefs.collapsedBlocks).toBeUndefined();
    expect(shown.prefs.revealBlocks).toEqual(['b-night']);
    /* Nothing to open, nothing written. */
    expect(revealRoutineJump(store, { blockId: 'b-night' }, clock(60))).toBeNull();
    expect(revealRoutineJump(shown, { itemId: n }, clock(61))).toBeNull();
    expect(revealRoutineJump(folded, { blockId: 'missing' }, clock(60))).toBeNull();
    expect(revealRoutineJump(folded, null, clock(60))).toBeNull();
    expect(revealRoutineJump(folded, { blockId: 'b-night' }, { now: NaN, day: DAY })).toBeNull();
  });
});
