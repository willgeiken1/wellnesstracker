import { deleteItem, logItem, saveItem } from '../src/features/routines/model/actions';
import { CHART_LINES_HINT, CHART_LINES_TITLE, chartLineChoices, setCompoundChartLine, startedChartMarkers } from '../src/features/routines/model/chart-lines';
import { emptyRoutineStore, type RoutineStore } from '../src/features/routines/model/shape';

/* Synthetic compounds only. The rules follow the web app's chart line tests. */

const clock = (now: number, day: string) => ({ now, day });
function ids() { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };
const BLOCK = 'b-morning';
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [{ id: BLOCK, name: 'Morning routine', color: 'citrus', order: 0, updatedAt: 1, deletedAt: null }] };
}
function withTwo() {
  const newId = ids();
  const a = must(saveItem(seeded(), { name: 'Example  Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: [BLOCK] }, clock(10, '2026-11-04'), newId));
  const b = must(saveItem(a.store, { name: 'Example Compound B', kind: 'dose', amount: '5', unit: 'mg', blockIds: [BLOCK] }, clock(11, '2026-11-12'), newId));
  const compound = (store: RoutineStore, itemId: string) => String(store.items.find(item => item.id === itemId)?.compoundId);
  return { store: b.store, a: compound(b.store, a.itemId), b: compound(b.store, b.itemId), itemA: a.itemId, itemB: b.itemId };
}
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-11-${String(from + i).padStart(2, '0')}`);

test('the line is off by default, so a chart gets no mark', () => {
  const { store } = withTwo();
  expect(store.compounds.every(compound => compound.chartLine === false)).toBe(true);
  expect(startedChartMarkers(store, days(1, 20))).toEqual([]);
  expect(chartLineChoices(store)).toEqual([
    { compoundId: store.compounds[0].id, label: 'Started Example Compound A', startDate: '2026-11-04', on: false },
    { compoundId: store.compounds[1].id, label: 'Started Example Compound B', startDate: '2026-11-12', on: false },
  ]);
  expect(CHART_LINES_TITLE).toBe('Started lines');
  expect(CHART_LINES_HINT).toBe('Show a thin line on sleep, HRV, and weight charts. Off until you turn one on. The line is drawn on this phone.');
});

test('a start day lands on that day, and on the Monday of its week on a weekly chart', () => {
  const { store, a, b } = withTwo();
  const on = must(setCompoundChartLine(must(setCompoundChartLine(store, a, true, clock(100, '2026-11-20'))), b, true, clock(101, '2026-11-20')));
  expect(startedChartMarkers(on, days(1, 20))).toEqual([{ date: '2026-11-04', label: 'Started Example Compound A' }, { date: '2026-11-12', label: 'Started Example Compound B' }]);
  /* Sparse weigh-ins: the mark keeps its own day. */
  expect(startedChartMarkers(on, ['2026-11-01', '2026-11-09', '2026-11-20']).map(mark => mark.date)).toEqual(['2026-11-04', '2026-11-12']);
  /* Weekly points are Mondays. Nov 4 is a Wednesday in the week of Nov 2; Nov 12 is in the last week, after the last label. */
  expect(startedChartMarkers(on, ['2026-10-26', '2026-11-02', '2026-11-09'], { bucketDays: 7 })).toEqual([{ date: '2026-11-02', label: 'Started Example Compound A' }, { date: '2026-11-09', label: 'Started Example Compound B' }]);
  expect(startedChartMarkers(on, ['2026-10-19', '2026-10-26'], { bucketDays: 7 })).toEqual([]);
});

test('only an opted-in live compound inside the window is labeled', () => {
  const { store, a, itemA } = withTwo();
  const on = must(setCompoundChartLine(store, a, true, clock(100, '2026-11-20')));
  expect(startedChartMarkers(on, days(1, 20)).map(mark => mark.label)).toEqual(['Started Example Compound A']);
  expect(startedChartMarkers(on, days(5, 20))).toEqual([]);
  expect(startedChartMarkers(on, days(1, 3))).toEqual([]);
  expect(startedChartMarkers(on, [])).toEqual([]);
  expect(startedChartMarkers(on, ['nope', 7, '2026-02-30'])).toEqual([]);
  expect(startedChartMarkers(null, days(1, 20))).toEqual([]);
  /* As on the web, a compound outlives the item that used it, so its dose history stays. Its line stays until it is switched off. */
  expect(startedChartMarkers(must(deleteItem(on, itemA, clock(200, '2026-11-20'))), days(1, 20))).toHaveLength(1);
  const gone = { ...on, compounds: on.compounds.map(row => (row.id === a ? { ...row, deletedAt: 200, updatedAt: 200 } : row)) };
  expect(startedChartMarkers(gone, days(1, 20))).toEqual([]);
  expect(setCompoundChartLine(gone, a, false, clock(300, '2026-11-20'))).toBeNull();
  expect(chartLineChoices(gone).map(choice => choice.label)).toEqual(['Started Example Compound B']);
});

test('turning it on writes only the compound row', () => {
  const { store, a, itemA } = withTwo();
  const logged = must(logItem(store, itemA, clock(50, '2026-11-20')));
  const on = must(setCompoundChartLine(logged, a, true, clock(100, '2026-11-20')));
  expect(on.compounds.find(row => row.id === a)).toMatchObject({ chartLine: true, startDate: '2026-11-04', updatedAt: 100 });
  expect(on.logs).toEqual(logged.logs);
  expect(on.items).toEqual(logged.items);
  expect(on.compounds.filter(row => row.id !== a)).toEqual(logged.compounds.filter(row => row.id !== a));
  expect(chartLineChoices(on)[0].on).toBe(true);
  /* No change, no write. */
  expect(setCompoundChartLine(on, a, true, clock(101, '2026-11-20'))).toBeNull();
  expect(setCompoundChartLine(logged, a, false, clock(101, '2026-11-20'))).toBeNull();
  /* A clock that ran backwards still beats the row it replaces. */
  expect(must(setCompoundChartLine(on, a, false, clock(5, '2026-11-20'))).compounds.find(row => row.id === a)).toMatchObject({ chartLine: false, updatedAt: 101 });
});

test('a compound without a start day, a missing one and a bad clock are refused', () => {
  const { store, a } = withTwo();
  const undated = { ...store, compounds: store.compounds.map(row => (row.id === a ? { ...row, startDate: null } : row)) };
  expect(setCompoundChartLine(undated, a, true, clock(100, '2026-11-20'))).toBeNull();
  expect(chartLineChoices(undated)).toHaveLength(1);
  expect(setCompoundChartLine(store, 'missing', true, clock(100, '2026-11-20'))).toBeNull();
  expect(setCompoundChartLine(store, '', true, clock(100, '2026-11-20'))).toBeNull();
  expect(setCompoundChartLine(store, a, true, { now: NaN, day: '2026-11-20' })).toBeNull();
});

test('editing the item keeps the line', () => {
  const { store, a, itemA } = withTwo();
  const on = must(setCompoundChartLine(store, a, true, clock(100, '2026-11-20')));
  const edited = must(saveItem(on, { itemId: itemA, name: 'Example Compound A2', kind: 'dose', amount: '300', unit: 'mcg', blockIds: [BLOCK] }, clock(200, '2026-11-21'), ids())).store;
  expect(startedChartMarkers(edited, days(1, 20))).toEqual([{ date: '2026-11-04', label: 'Started Example Compound A2' }]);
});
