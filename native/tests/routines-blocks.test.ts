import { logItem, saveItem } from '../src/features/routines/model/actions';
import {
  addBlock, blockDraft, blockMoves, deleteBlock, duplicateBlock, hideBlock, moveBlock, movePlacement, rememberBlock, renameBlock, reorderBlocks, reorderPlacements, restoreBlock,
  ROUTINE_BLOCK_COLORS, routineDraftWindow, saveBlock, setBlockColor, showBlock, toggleCollapsed, toggleDraftDay, toggleDraftItem, toggleReveal,
} from '../src/features/routines/model/blocks';
import { placedItems } from '../src/features/routines/model/day';
import { routinePlacementId } from '../src/features/routines/model/ids';
import { emptyRoutineStore, isLive, liveOf, projectRoutineStore, type RoutineStore } from '../src/features/routines/model/shape';

/* Synthetic rows only. The rules follow the web app's edit and instrument tests for routines. */

const DAY = '2026-11-19';
const clock = (now = 1000, day = DAY) => ({ now, day });
function ids(prefix = 0) { let n = 0; return () => `0000000${prefix}-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [
    { id: 'b-morning', name: 'Morning routine', color: 'citrus', order: 0, updatedAt: 1, deletedAt: null },
    { id: 'b-night', name: 'Night routine', color: 'pink', order: 1, updatedAt: 1, deletedAt: null },
  ] };
}
function withItems() {
  const newId = ids();
  const a = must(saveItem(seeded(), { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: ['b-morning'] }, clock(10), newId));
  const b = must(saveItem(a.store, { name: 'Example Check', kind: 'check', blockIds: ['b-morning', 'b-night'] }, clock(11), newId));
  const c = must(saveItem(b.store, { name: 'Example Check Two', kind: 'check', blockIds: ['b-morning'] }, clock(12), newId));
  return { store: c.store, a: a.itemId, b: b.itemId, c: c.itemId, newId };
}
const order = (store: RoutineStore) => must(projectRoutineStore(store)).blocks.map(block => block.name);
const rows = (store: RoutineStore, blockId: string) => must(projectRoutineStore(store)).placements.filter(row => row.blockId === blockId).sort((x, y) => x.order - y.order).map(row => row.itemId);

describe('a new routine', () => {
  test('a name is enough, and it goes last with the next colour', () => {
    const added = must(addBlock(seeded(), '  Zzyq Midday Block  ', clock(50), ids(1)));
    const block = added.store.blocks.find(row => row.id === added.blockId);
    expect(block).toMatchObject({ name: 'Zzyq Midday Block', color: 'pink', order: 2, updatedAt: 50, deletedAt: null });
    expect(added.store.prefs.lastBlockId).toBe(added.blockId);
    expect(order(added.store)).toEqual(['Morning routine', 'Night routine', 'Zzyq Midday Block']);
    expect(addBlock(seeded(), '   ', clock(), ids(1))).toBeNull();
    expect(addBlock(seeded(), 'Zzyq', clock(), () => 'b-morning')).toBeNull();
    expect(addBlock(seeded(), 'Zzyq', { now: NaN, day: DAY }, ids(1))).toBeNull();
    expect(must(addBlock(seeded(), 'x'.repeat(200), clock(), ids(1))).store.blocks[2].name).toHaveLength(80);
  });

  test('the sheet saves a name, a window, days, a colour and the items in it', () => {
    const { store, a, b } = withItems();
    const draft = must(blockDraft(projectRoutineStore(store)));
    expect(draft).toEqual({ blockId: null, name: '', startMin: 720, endMin: 840, days: [0, 1, 2, 3, 4, 5, 6], color: 'lavender', itemIds: [] });
    const saved = must(saveBlock(store, { ...draft, name: 'Zzyq Evening Block', startMin: '21:00', endMin: '23:00', days: [4, 0, 2, 2], itemIds: [b, a, 'missing'] }, clock(100), ids(1)));
    const block = saved.store.blocks.find(row => row.id === saved.blockId);
    expect(block).toMatchObject({ name: 'Zzyq Evening Block', color: 'lavender', startMin: 1260, endMin: 1380, days: [0, 2, 4], order: 2 });
    expect(rows(saved.store, saved.blockId)).toEqual([b, a]);
    expect(saved.store.placements.find(row => row.blockId === saved.blockId && row.itemId === a)?.id).toBe(routinePlacementId(saved.blockId, a));
    expect(saved.store.logs).toEqual([]);
  });

  test('a missing name or time is refused, and an end at or before the start runs past midnight', () => {
    const base = { name: 'Zzyq Evening Block', startMin: 1260, endMin: 1380 };
    expect(saveBlock(seeded(), { ...base, name: ' ' }, clock(), ids(1))).toBeNull();
    expect(saveBlock(seeded(), { ...base, startMin: '' }, clock(), ids(1))).toBeNull();
    expect(saveBlock(seeded(), { ...base, endMin: '24:10' }, clock(), ids(1))).toBeNull();
    expect(saveBlock(seeded(), { ...base, blockId: 'b-missing' }, clock(), ids(1))).toBeNull();
    expect(saveBlock(seeded(), null, clock(), ids(1))).toBeNull();
    expect(routineDraftWindow('22:00', '01:30')).toEqual({ startMin: 1320, endMin: 1530 });
    expect(routineDraftWindow(600, 600)).toEqual({ startMin: 600, endMin: 2040 });
    expect(routineDraftWindow('7:05', '9:00')).toEqual({ startMin: 425, endMin: 540 });
    expect(routineDraftWindow('7:5', '9:00')).toBeNull();
    expect(routineDraftWindow(null, 600)).toBeNull();
    const overnight = must(saveBlock(seeded(), { name: 'Zzyq Late Block', startMin: '22:00', endMin: '01:30', days: [] }, clock(), ids(1)));
    expect(overnight.store.blocks[2]).toMatchObject({ startMin: 1320, endMin: 1530 });
    expect(overnight.store.blocks[2].days).toBeUndefined(); // every day
  });

  test('a routine runs at least one day', () => {
    expect(toggleDraftDay([0, 1], 1)).toEqual([0]);
    expect(toggleDraftDay([0], 3)).toEqual([0, 3]);
    expect(toggleDraftDay([0], 0)).toBeNull();
    expect(toggleDraftDay([0], 7)).toBeNull();
    expect(toggleDraftItem(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleDraftItem(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleDraftItem(['a'], '')).toBeNull();
  });
});

describe('editing a routine', () => {
  test('rename and recolour change only that routine', () => {
    const { store } = withItems();
    const renamed = must(renameBlock(store, 'b-night', 'Zzyq Evening Block', clock(200)));
    expect(renamed.blocks.find(row => row.id === 'b-night')).toMatchObject({ name: 'Zzyq Evening Block', updatedAt: 200 });
    expect(renamed.blocks.find(row => row.id === 'b-morning')).toEqual(store.blocks.find(row => row.id === 'b-morning'));
    expect(renamed.placements).toEqual(store.placements);
    expect(renamed.prefs.lastBlockId).toBe('b-night');
    expect(renameBlock(store, 'b-night', '  ', clock())).toBeNull();
    expect(renameBlock(store, 'b-missing', 'Zzyq', clock())).toBeNull();
    expect(ROUTINE_BLOCK_COLORS).toEqual(['citrus', 'lavender', 'pink']);
    expect(must(setBlockColor(store, 'b-night', 'lavender', clock(201))).blocks[1].color).toBe('lavender');
    expect(setBlockColor(store, 'b-night', 'red', clock())).toBeNull();
    // A stamp never goes backwards, even when the phone's clock does.
    expect(must(renameBlock(renamed, 'b-night', 'Zzyq Again', clock(5))).blocks[1].updatedAt).toBe(201);
  });

  test('the edit sheet opens with what the routine has and saves what changed', () => {
    const { store, a, b, c, newId } = withItems();
    const logged = must(logItem(store, c, clock(300)));
    const draft = must(blockDraft(projectRoutineStore(logged), 'b-morning'));
    expect(draft).toEqual({ blockId: 'b-morning', name: 'Morning routine', startMin: 300, endMin: 660, days: [0, 1, 2, 3, 4, 5, 6], color: 'citrus', itemIds: [a, b, c] });
    expect(blockDraft(projectRoutineStore(logged), 'b-missing')).toBeNull();
    const saved = must(saveBlock(logged, { ...draft, name: 'Zzyq First Block', startMin: 360, endMin: 480, days: [0, 1, 2, 3, 4], color: 'pink', itemIds: [a] }, clock(400), newId));
    expect(saved.blockId).toBe('b-morning');
    expect(saved.store.blocks[0]).toMatchObject({ name: 'Zzyq First Block', startMin: 360, endMin: 480, days: [0, 1, 2, 3, 4], color: 'pink', order: 0 });
    expect(rows(saved.store, 'b-morning')).toEqual([a]);
    // b still sits in Night. c was only here and had no type, so it moves to the Other tab.
    expect(saved.store.items.find(item => item.id === b)?.type).toBeUndefined();
    expect(saved.store.items.find(item => item.id === c)).toMatchObject({ type: 'other', deletedAt: null });
    expect(placedItems(projectRoutineStore(saved.store), DAY).map(item => item.id)).toEqual([a, b, c]);
    expect(liveOf(saved.store.logs)).toEqual(liveOf(logged.logs));
  });

  test('an item taken out of its last shown routine is not lost when its other routine is hidden', () => {
    const { store, b, newId } = withItems();
    const hidden = must(hideBlock(store, 'b-night', clock(300)));
    const draft = must(blockDraft(projectRoutineStore(hidden), 'b-morning'));
    const saved = must(saveBlock(hidden, { ...draft, itemIds: draft.itemIds.filter(id => id !== b) }, clock(400), newId));
    expect(saved.store.items.find(item => item.id === b)?.type).toBe('other');
    expect(saved.store.placements.find(row => row.blockId === 'b-night' && row.itemId === b && isLive(row))).toBeTruthy();
  });

  test('up and down move a routine one place and stop at the ends', () => {
    const { store } = withItems();
    const three = must(addBlock(store, 'Zzyq Midday Block', clock(50), ids(1))).store;
    expect(blockMoves(projectRoutineStore(three), 'b-morning')).toEqual({ up: false, down: true });
    expect(blockMoves(projectRoutineStore(three), 'b-night')).toEqual({ up: true, down: true });
    expect(blockMoves(projectRoutineStore(three), 'b-missing')).toEqual({ up: false, down: false });
    expect(moveBlock(three, 'b-morning', -1, clock())).toBeNull();
    expect(moveBlock(three, 'b-morning', 2, clock())).toBeNull();
    expect(moveBlock(three, 'b-missing', 1, clock())).toBeNull();
    const down = must(moveBlock(three, 'b-morning', 1, clock(500)));
    expect(order(down)).toEqual(['Night routine', 'Morning routine', 'Zzyq Midday Block']);
    expect(down.prefs.lastBlockId).toBe('b-morning');
    // Only the two routines that changed place are written.
    expect(down.blocks.filter(row => row.updatedAt === 500).map(row => row.id).sort()).toEqual(['b-morning', 'b-night']);
    const last = must(moveBlock(down, 'b-morning', 1, clock(501)));
    expect(order(last)).toEqual(['Night routine', 'Zzyq Midday Block', 'Morning routine']);
    expect(moveBlock(last, 'b-morning', 1, clock())).toBeNull();
    expect(order(must(moveBlock(last, 'b-morning', -1, clock(502))))).toEqual(order(down));
    expect(last.placements).toEqual(three.placements);
    expect(last.logs).toEqual(three.logs);
  });

  test('a new order has to name every routine on the page exactly once', () => {
    const { store } = withItems();
    expect(reorderBlocks(store, ['b-morning', 'b-night'], clock())).toBeNull(); // unchanged
    expect(reorderBlocks(store, ['b-night'], clock())).toBeNull();
    expect(reorderBlocks(store, ['b-night', 'b-night'], clock())).toBeNull();
    expect(reorderBlocks(store, ['b-night', 'b-other'], clock())).toBeNull();
    expect(reorderBlocks(store, 'b-night', clock())).toBeNull();
    expect(order(must(reorderBlocks(store, ['b-night', 'b-morning'], clock(600))))).toEqual(['Night routine', 'Morning routine']);
  });

  test('items move up and down inside their routine', () => {
    const { store, a, b, c } = withItems();
    expect(rows(store, 'b-morning')).toEqual([a, b, c]);
    const first = routinePlacementId('b-morning', a);
    const down = must(movePlacement(store, 'b-morning', first, 1, clock(700)));
    expect(rows(down, 'b-morning')).toEqual([b, a, c]);
    expect(rows(down, 'b-night')).toEqual([b]);
    expect(movePlacement(store, 'b-morning', first, -1, clock())).toBeNull();
    expect(movePlacement(store, 'b-morning', routinePlacementId('b-morning', c), 1, clock())).toBeNull();
    expect(movePlacement(store, 'b-night', first, 1, clock())).toBeNull();
    const ordered = [c, b, a].map(itemId => routinePlacementId('b-morning', itemId));
    expect(rows(must(reorderPlacements(store, 'b-morning', ordered, clock(701))), 'b-morning')).toEqual([c, b, a]);
    expect(reorderPlacements(store, 'b-morning', ordered.slice(1), clock())).toBeNull();
    expect(reorderPlacements(store, 'b-missing', ordered, clock())).toBeNull();
    expect(down.logs).toEqual(store.logs);
    expect(down.items).toEqual(store.items);
  });
});

describe('hiding, restoring, duplicating and deleting', () => {
  test('hide keeps every placement and log, and makes nothing due', () => {
    const { store, a, b, c } = withItems();
    const logged = must(logItem(store, a, clock(300)));
    const hidden = must(hideBlock(logged, 'b-morning', clock(400)));
    const view = must(projectRoutineStore(hidden));
    expect(view.blocks.map(block => block.id)).toEqual(['b-night']);
    expect(view.hiddenBlocks.map(block => block.id)).toEqual(['b-morning']);
    expect(liveOf(hidden.placements)).toHaveLength(4);
    expect(liveOf(hidden.logs)).toHaveLength(1);
    expect(placedItems(view, DAY).map(item => item.id)).toEqual([b]);
    expect(hideBlock(hidden, 'b-morning', clock())).toBeNull();
    expect(hidden.prefs.lastBlockId).toBe('b-night');
    expect(showBlock(hidden, 'b-night', clock())).toBeNull();
    const back = must(showBlock(hidden, 'b-morning', clock(500)));
    expect(order(back)).toEqual(['Night routine', 'Morning routine']); // a restored routine goes last
    expect(rows(back, 'b-morning')).toEqual([a, b, c]);
    expect(back.blocks.find(row => row.id === 'b-morning')?.hidden).toBeUndefined();
    expect(back.prefs.lastBlockId).toBe('b-morning');
  });

  test('delete takes the placements with it, leaves items and logs, and can be put back', () => {
    const { store, a, b, c } = withItems();
    const logged = must(logItem(store, a, clock(300)));
    const gone = must(deleteBlock(logged, 'b-morning', clock(400)));
    expect(order(gone)).toEqual(['Night routine']);
    expect(liveOf(gone.placements).map(row => row.blockId)).toEqual(['b-night']);
    expect(liveOf(gone.items)).toHaveLength(3);
    expect(liveOf(gone.logs)).toHaveLength(1);
    expect(gone.prefs.lastBlockId).toBe('b-night');
    expect(deleteBlock(gone, 'b-morning', clock())).toBeNull();
    const back = must(restoreBlock(gone, 'b-morning', clock(500)));
    expect(order(back)).toEqual(['Night routine', 'Morning routine']);
    expect(rows(back, 'b-morning')).toEqual([a, b, c]);
    expect(restoreBlock(back, 'b-morning', clock())).toBeNull();
    expect(restoreBlock(gone, 'b-missing', clock())).toBeNull();
    // Once the removal is saved the row keeps no name, so there is nothing to put back.
    expect(restoreBlock({ ...gone, blocks: gone.blocks.map(row => (row.id === 'b-morning' ? { ...row, name: '' } : row)) }, 'b-morning', clock())).toBeNull();
  });

  test('a placement removed before the routine was deleted stays removed', () => {
    const { store, a, c, newId } = withItems();
    const draft = must(blockDraft(projectRoutineStore(store), 'b-morning'));
    const trimmed = must(saveBlock(store, { ...draft, itemIds: [a] }, clock(300), newId)).store;
    const gone = must(deleteBlock(trimmed, 'b-morning', clock(400)));
    const back = must(restoreBlock(gone, 'b-morning', clock(500)));
    expect(rows(back, 'b-morning')).toEqual([a]);
    expect(back.items.find(item => item.id === c)?.type).toBe('other');
  });

  test('a copy shares the items, keeps the window and days, and writes no logs', () => {
    const { store, a, b, c, newId } = withItems();
    const timed = must(saveBlock(store, { ...must(blockDraft(projectRoutineStore(store), 'b-morning')), startMin: 360, endMin: 480, days: [0, 1, 2, 3, 4] }, clock(300), newId)).store;
    const copy = must(duplicateBlock(timed, 'b-morning', clock(400), ids(1)));
    const block = copy.store.blocks.find(row => row.id === copy.blockId);
    expect(block).toMatchObject({ name: 'Morning routine copy', color: 'citrus', startMin: 360, endMin: 480, days: [0, 1, 2, 3, 4], order: 2 });
    expect(rows(copy.store, copy.blockId)).toEqual([a, b, c]);
    expect(liveOf(copy.store.items)).toHaveLength(3);
    expect(copy.store.logs).toEqual([]);
    expect(duplicateBlock(timed, 'b-missing', clock(), ids(1))).toBeNull();
    const long = must(renameBlock(timed, 'b-night', 'n'.repeat(80), clock(401)));
    expect(must(duplicateBlock(long, 'b-night', clock(402), ids(2))).store.blocks.at(-1)?.name).toBe(`${'n'.repeat(75)} copy`);
  });
});

describe('what the page remembers', () => {
  test('the last routine, folded routines and revealed rows are stored', () => {
    const { store } = withItems();
    const remembered = must(rememberBlock(store, 'b-night', clock(100)));
    expect(remembered.prefs.lastBlockId).toBe('b-night');
    expect(rememberBlock(remembered, 'b-night', clock())).toBeNull();
    expect(rememberBlock(store, 'b-missing', clock())).toBeNull();
    const folded = must(toggleCollapsed(store, 'b-night', clock(200)));
    expect(folded.prefs.collapsedBlocks).toEqual(['b-night']);
    expect(must(toggleCollapsed(folded, 'b-night', clock(201))).prefs.collapsedBlocks).toBeUndefined();
    expect(toggleCollapsed(store, 'b-missing', clock())).toBeNull();
    const revealed = must(toggleReveal(folded, 'b-morning', clock(202)));
    expect(revealed.prefs).toMatchObject({ collapsedBlocks: ['b-night'], revealBlocks: ['b-morning'] });
    expect(must(toggleReveal(revealed, 'b-morning', clock(203))).prefs.revealBlocks).toBeUndefined();
    expect(revealed.blocks).toEqual(store.blocks);
  });
});
