import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deleteItem, logItem, renameItem, saveItem, skipItem } from '../src/features/routines/model/actions';
import {
  longRoutineDay, rememberGraphTab, ROUTINE_GRAPH_TABS, routineGraphTab, routineHistoryCursor, routineHistoryView, routineMarkIcon, shiftRoutineMonth, shortRoutineDay,
} from '../src/features/routines/model/history';
import { routineLogId } from '../src/features/routines/model/ids';
import { emptyRoutineStore, normalizeRoutineStore, projectRoutineStore, type RoutineLog, type RoutineStore } from '../src/features/routines/model/shape';

/* Synthetic routines only. History places a log on the day string it keeps.
   The graph counts logs and does not add amounts. The cases follow the web app's history tests. */

const TODAY = '2026-11-19'; // a Thursday
const clock = (now = 1000, day = TODAY) => ({ now, day });
function ids() { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [
    { id: 'b-morning', name: 'Morning routine', color: 'citrus', order: 0, updatedAt: 1, deletedAt: null },
    { id: 'b-night', name: 'Night routine', color: 'pink', order: 1, updatedAt: 1, deletedAt: null },
  ] };
}
function withDose(name = 'Example Compound A', amount = '250', unit = 'mcg', day = '2026-11-01', from: RoutineStore = seeded(), newId = ids()) {
  const saved = must(saveItem(from, { name, kind: 'dose', amount, unit, blockIds: ['b-morning'] }, clock(10, day), newId));
  return { store: saved.store, itemId: saved.itemId, newId };
}
const log = (itemId: string | null, day: string, extra: Partial<RoutineLog> = {}): RoutineLog => ({
  id: routineLogId(itemId, day), itemId, compoundId: null, day, status: 'done', amount: null, unit: '', at: 500, updatedAt: 500, deletedAt: null, ...extra,
});
const view = (store: RoutineStore, day = TODAY, tab = 'logged', today = TODAY) => routineHistoryView(projectRoutineStore(store), { month: day.slice(0, 7), day, today, tab });
const dayOf = (store: RoutineStore, day: string, today = TODAY) => must(view(store, day, 'logged', today).days.find(row => row.day === day) ?? null);

describe('routine history, calendar, and graph', () => {
  test('a backdated log shows on the day it keeps, with the amount stored on it', () => {
    const { store, itemId } = withDose();
    const moved = { ...store, logs: [log(itemId, '2026-11-15', { status: 'partial', amount: 0.25, unit: 'mcg' })] };
    const day = dayOf(moved, '2026-11-15');
    expect(day.marks).toEqual(['partial']);
    expect(day.mark).toBe('partial');
    expect(day.items).toEqual([{ itemId, name: 'Example Compound A', mark: 'partial', log: { id: routineLogId(itemId, '2026-11-15'), status: 'partial', amount: 0.25, unit: 'mcg', rest: false } }]);
    // Today is still open. An open day has no mark on the calendar.
    expect(dayOf(moved, TODAY)).toMatchObject({ marks: [], mark: 'open', items: [{ mark: 'open', log: null }] });
  });

  test('missed is an empty ring, skipped is a dash, and rest is a moon', () => {
    expect(routineMarkIcon('missed')).toEqual({ mark: 'missed', label: 'Missed', icon: 'ring' });
    expect(routineMarkIcon('skipped')).toEqual({ mark: 'skipped', label: 'Skipped', icon: 'dash' });
    expect(routineMarkIcon('rest')).toEqual({ mark: 'rest', label: 'Rest', icon: 'moon' });
    expect(routineMarkIcon('logged')).toEqual({ mark: 'logged', label: 'Logged', icon: 'filled' });
    expect(routineMarkIcon('partial')).toEqual({ mark: 'partial', label: 'Partial', icon: 'filled' });
    expect(routineMarkIcon('open')).toEqual({ mark: 'open', label: 'Open', icon: 'none' });
    expect(routineMarkIcon('other')).toEqual({ mark: 'open', label: '', icon: 'none', unexpected: 'other' });

    const { store, itemId } = withDose('Example Compound A', '250', 'mcg', '2026-11-17');
    const marked = { ...store, logs: [log(itemId, '2026-11-18', { status: 'skipped' }), log(null, '2026-11-16', { rest: true })] };
    const month = view(marked);
    const marks = (day: string) => must(month.days.find(row => row.day === day) ?? null).marks;
    expect(marks('2026-11-17')).toEqual(['missed']);
    expect(marks('2026-11-18')).toEqual(['skipped']);
    expect(marks('2026-11-16')).toEqual(['rest']);
    expect(marks('2026-11-15')).toEqual([]);
    expect(month.cards.map(card => card.day)).toEqual([TODAY, '2026-11-18', '2026-11-17', '2026-11-16']);

    const rested = routineHistoryView({
      blocks: [{ id: 'b', name: 'Morning routine', order: 0 }],
      items: [{ id: 'i', name: 'Example Check', kind: 'check' }],
      placements: [{ id: 'p', blockId: 'b', itemId: 'i', order: 0 }],
      compounds: [],
      logs: [{ id: 'r', day: '2026-11-18', status: 'rest', itemId: null }],
      prefs: {},
    }, { month: '2026-11', day: '2026-11-18', today: TODAY, tab: 'logged' });
    const day = must(rested.days.find(row => row.day === '2026-11-18') ?? null);
    expect(day.rest).toBe(true);
    expect(day.marks).toEqual(['rest']);
    expect(day.items.some(row => row.mark === 'missed')).toBe(false);
    expect(rested.graph.points.find(point => point.day === '2026-11-18')?.count).toBe(0);
  });

  test('the graph counts logs and does not add compound amounts', () => {
    const first = withDose('Example Compound A', '250', 'mcg');
    const second = withDose('Example Compound B', '500', 'mg', '2026-11-01', first.store, first.newId);
    const store = { ...second.store, logs: [
      log(first.itemId, '2026-11-15', { amount: 250, unit: 'mcg' }),
      log(second.itemId, '2026-11-15', { amount: 500, unit: 'mg' }),
      log(null, '2026-11-15', { rest: true }),
    ] };
    const logged = view(store, '2026-11-15');
    const point = must(logged.graph.points.find(row => row.day === '2026-11-15') ?? null);
    expect(point).toEqual({ day: '2026-11-15', count: 2 });
    expect(logged.graph).toMatchObject({ tab: 'logged', unit: 'count', selectedCount: 2, selectedLabel: 'Nov 15 · 2 logs' });
    const text = JSON.stringify(logged.graph);
    for (const needle of ['amount', '250', '500', '750', 'mcg', 'mg']) expect(text.includes(needle)).toBe(false);
    const skipped = view(store, '2026-11-15', 'skipped');
    expect(skipped.graph.points.find(row => row.day === '2026-11-15')?.count).toBe(0);
    expect(skipped.graph.selectedLabel).toBe('Nov 15 · 0 skips');
    expect(logged.days.find(row => row.day === '2026-11-15')?.items.map(row => [row.log?.amount, row.log?.unit])).toEqual([[250, 'mcg'], [500, 'mg']]);
    const src = readFileSync(join(__dirname, '../src/features/routines/model/history.ts'), 'utf8');
    expect(src).not.toMatch(/\+=\s*(?:log|row)\.amount|reduce\([^)]*amount/);
  });

  test('a skip and a log count once each, and an item both skipped and logged counts as logged', () => {
    const first = withDose('Example Compound A');
    const second = withDose('Example Compound B', '500', 'mg', '2026-11-01', first.store, first.newId);
    const store = { ...second.store, logs: [
      log(first.itemId, '2026-11-18', { status: 'skipped' }),
      log(second.itemId, '2026-11-18', { status: 'skipped' }),
      log(second.itemId, '2026-11-18', { id: 'extra', status: 'done', updatedAt: 600 }),
    ] };
    expect(view(store, '2026-11-18', 'skipped').graph.selectedLabel).toBe('Nov 18 · 1 skip');
    expect(view(store, '2026-11-18', 'logged').graph.selectedLabel).toBe('Nov 18 · 1 log');
    expect(dayOf(store, '2026-11-18').mark).toBe('logged');
    expect(dayOf(store, '2026-11-18').marks).toEqual(['skipped', 'logged']);
  });

  test('the last graph tab is remembered', () => {
    const { store } = withDose();
    expect(ROUTINE_GRAPH_TABS.map(tab => [tab.id, tab.label])).toEqual([['logged', 'Logged'], ['skipped', 'Skipped']]);
    expect(routineGraphTab(store.prefs)).toBe('logged');
    expect(rememberGraphTab(store, 'amounts', clock())).toBeNull();
    expect(rememberGraphTab(store, 'total', clock())).toBeNull();
    const next = must(rememberGraphTab(store, 'skipped', clock(2000)));
    expect(next.prefs.historyGraph).toBe('skipped');
    expect(next.prefs.updatedAt).toBe(2000);
    expect(next.logs).toEqual(store.logs);
    expect(rememberGraphTab(next, 'skipped', clock(2001))).toBeNull();
    expect(routineGraphTab(must(normalizeRoutineStore(JSON.parse(JSON.stringify(next)))).prefs)).toBe('skipped');
    expect(must(rememberGraphTab(next, 'logged', clock(1))).prefs).toMatchObject({ historyGraph: 'logged', updatedAt: 2001 });
  });

  test('the calendar starts on Monday, stops at today, and cannot go past this month', () => {
    const { store } = withDose();
    const november = view(store);
    expect(november.monthLabel).toBe('November 2026');
    expect(november.nextMonth).toBe(false);
    expect(november.cells.filter(cell => cell.kind === 'pad')).toHaveLength(6); // Nov 1, 2026 is a Sunday
    expect(november.cells.filter(cell => cell.kind === 'day')).toHaveLength(30);
    expect(november.cells.filter(cell => cell.kind === 'day' && cell.future)).toHaveLength(11);
    expect(november.cells.filter(cell => cell.kind === 'day' && cell.today).map(cell => (cell.kind === 'day' ? cell.day : ''))).toEqual([TODAY]);
    expect(november.days).toHaveLength(19);

    expect(routineHistoryCursor({}, TODAY, {})).toEqual({ month: '2026-11', day: TODAY });
    expect(routineHistoryCursor({ month: '2026-11', day: TODAY }, TODAY, { monthDelta: 1 })).toEqual({ month: '2026-11', day: TODAY });
    expect(routineHistoryCursor({ month: '2026-11', day: TODAY }, TODAY, { monthDelta: -1 })).toEqual({ month: '2026-10', day: '2026-10-31' });
    expect(routineHistoryCursor({ month: '2026-10', day: '2026-10-31' }, TODAY, { day: '2026-10-04' })).toEqual({ month: '2026-10', day: '2026-10-04' });
    expect(routineHistoryCursor({ month: '2026-10', day: '2026-10-04' }, TODAY, { monthDelta: 1 })).toEqual({ month: '2026-11', day: TODAY });
    expect(routineHistoryCursor({ month: '2026-11' }, TODAY, { day: '2026-11-25' })).toEqual({ month: '2026-11', day: TODAY });
    expect(routineHistoryCursor({ month: '2026-13' }, TODAY, {})).toEqual({ month: '2026-11', day: TODAY });
    expect(routineHistoryCursor({}, 'bad', {})).toEqual({ month: '', day: '' });
    expect(routineHistoryView(null, { today: 'bad' })).toMatchObject({ month: '', cells: [], days: [], cards: [], graph: { points: [], selectedLabel: '' } });

    const october = routineHistoryView(projectRoutineStore(store), { month: '2026-10', today: TODAY });
    expect(october).toMatchObject({ monthLabel: 'October 2026', day: '2026-10-31', nextMonth: true });
    expect(october.days).toHaveLength(31);
    expect(shiftRoutineMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftRoutineMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftRoutineMonth('2026-1', 1)).toBe('');
    expect(shortRoutineDay('2026-11-05')).toBe('Nov 5');
    expect(longRoutineDay('2026-11-05')).toBe('November 5');
    expect(shortRoutineDay('2026-02-30')).toBe('');
  });

  test('history keeps to the calendar, the day cards and one count graph', () => {
    const src = readFileSync(join(__dirname, '../src/features/routines/model/history.ts'), 'utf8');
    expect(src).not.toMatch(/week-strip|weekStrip|adherence|constellation|rising tide|orbit dial/);
    expect(Object.keys(view(withDose().store)).sort()).toEqual(['cards', 'cells', 'day', 'days', 'graph', 'month', 'monthLabel', 'nextMonth', 'tab', 'today']);
  });

  test("a removed item's log stays on its day", () => {
    const { store, itemId } = withDose();
    const logged = must(logItem(store, itemId, clock(600, '2026-11-15')));
    const removed = must(deleteItem(logged, itemId, clock(700)));
    const month = view(removed, '2026-11-15');
    const day = must(month.days.find(row => row.day === '2026-11-15') ?? null);
    expect(day.items).toEqual([{ itemId, name: 'Example Compound A', mark: 'logged', log: { id: routineLogId(itemId, '2026-11-15'), status: 'done', amount: 250, unit: 'mcg', rest: false } }]);
    expect(month.graph.points.find(row => row.day === '2026-11-15')?.count).toBe(1);
    expect(dayOf(removed, '2026-11-16').items).toEqual([]);
    // A removed item keeps no values on the phone. The name comes from the compound its log names.
    expect(must(projectRoutineStore(removed)).items).toEqual([]);
    expect(dayOf({ ...removed, compounds: [] }, '2026-11-15').items[0]).toMatchObject({ name: 'Item', mark: 'logged' });
    const beforeSave = routineHistoryView(removed, { month: '2026-11', day: '2026-11-15', today: TODAY });
    expect(beforeSave.days.find(row => row.day === '2026-11-15')?.items[0]).toMatchObject({ name: 'Example Compound A', mark: 'logged' });
  });

  test('a new check keeps the day it was added', () => {
    const added = must(saveItem(seeded(), { name: 'Example Check', kind: 'check', blockIds: ['b-morning'] }, clock(10, '2026-11-16'), ids()));
    const renamed = must(renameItem(added.store, added.itemId, 'Example Check', clock(20, '2026-11-17')));
    expect(renamed.items[0].startDate).toBe('2026-11-16');
    const month = view(renamed, '2026-11-18', 'logged', '2026-11-18');
    const marks = (day: string) => must(month.days.find(row => row.day === day) ?? null).marks;
    expect(marks('2026-11-15')).toEqual([]);
    expect(marks('2026-11-16')).toEqual(['missed']);
    expect(marks('2026-11-17')).toEqual(['missed']);
    expect(marks('2026-11-18')).toEqual([]);
    expect(renamed.logs).toEqual([]);
  });

  test('an item is due only on the days its routine runs, and a hidden routine makes nothing due', () => {
    const base = seeded();
    const weekdays = { ...base, blocks: [{ ...base.blocks[0], days: [0, 1, 2, 3, 4] }, base.blocks[1]] };
    const added = must(saveItem(weekdays, { name: 'Example Check', kind: 'check', blockIds: ['b-morning'] }, clock(10, '2026-11-09'), ids()));
    const month = view(added.store);
    const marks = (day: string) => must(month.days.find(row => row.day === day) ?? null).marks;
    expect(marks('2026-11-13')).toEqual(['missed']); // Friday
    expect(marks('2026-11-14')).toEqual([]); // Saturday
    expect(marks('2026-11-15')).toEqual([]); // Sunday
    expect(marks('2026-11-16')).toEqual(['missed']); // Monday
    const weekendLog = { ...added.store, logs: [log(added.itemId, '2026-11-14')] };
    expect(dayOf(weekendLog, '2026-11-14').marks).toEqual(['logged']);
    const hidden = { ...weekendLog, blocks: weekendLog.blocks.map(block => (block.id === 'b-morning' ? { ...block, hidden: true } : block)) };
    expect(dayOf(hidden, '2026-11-13').marks).toEqual([]);
    expect(dayOf(hidden, '2026-11-14').items).toEqual([expect.objectContaining({ name: 'Example Check', mark: 'logged' })]);
  });

  test('a typed item in no routine is due every day from its start', () => {
    const added = must(saveItem(seeded(), { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', type: 'peptide' }, clock(10, '2026-11-16'), ids()));
    const skipped = must(skipItem(added.store, added.itemId, clock(20, '2026-11-17')));
    const month = view(skipped);
    const marks = (day: string) => must(month.days.find(row => row.day === day) ?? null).marks;
    expect(marks('2026-11-15')).toEqual([]);
    expect(marks('2026-11-16')).toEqual(['missed']);
    expect(marks('2026-11-17')).toEqual(['skipped']);
    expect(marks('2026-11-18')).toEqual(['missed']);
    expect(dayOf(skipped, '2026-11-17').mark).toBe('skipped');
    const untyped = { ...skipped, items: skipped.items.map(item => ({ ...item, type: undefined })) };
    expect(dayOf(untyped, '2026-11-16').marks).toEqual([]);
    expect(dayOf(untyped, '2026-11-17').marks).toEqual(['skipped']);
  });

  test('an undone log is not on the calendar', () => {
    const { store, itemId } = withDose();
    const undone = { ...store, logs: [log(itemId, '2026-11-15', { deletedAt: 600, updatedAt: 600, undone: true, amount: 250, unit: 'mcg' })] };
    expect(dayOf(undone, '2026-11-15').marks).toEqual(['missed']);
    expect(view(undone, '2026-11-15').graph.selectedCount).toBe(0);
  });
});
