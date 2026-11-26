/* The Routines store over the phone's daily_* tables, on real SQLite with the app's own migrations.
   Every name, amount and note below is made up. */
import { sql } from 'drizzle-orm';
import { DEVICE_A, OWNER_A } from '../fixtures/sync';
import { Repository } from '../src/data/repository';
import { routineTables } from '../src/data/rows';
import { addDays, clock, demoState, emptyState, nowOf, type Item, type RoutinesState } from '../src/features/routines/model';
import { routineLogId } from '../src/features/routines/model/ids';
import { blockRowId, commitRoutinesState, guardRoutinesStore, itemRowId, readRoutinesState } from '../src/features/routines/data/sqlite-store';
import { createLocalRoutinesStore, ROUTINES_KEY, type NewItem, type RoutinesStore } from '../src/features/routines/store';
import { localDatabase } from './server/sqlite';

jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener() { throw new Error('Native live queries are not used in node tests'); } }));

const TODAY = '2026-11-20';
const realNow = clock.now;
let tick = 0;
beforeEach(() => {
  tick = 0;
  // 10:00 on a Friday. Each read of the clock moves a millisecond, so the store's time-based ids never repeat.
  clock.now = () => new Date(new Date(`${TODAY}T10:00:00`).getTime() + tick++);
});
afterAll(() => { clock.now = realNow; });

async function account(owner = OWNER_A) {
  const { db, repo } = await localDatabase();
  const forOwner = owner === OWNER_A ? repo : new Repository(db, owner, DEVICE_A, () => '40000000-0000-4000-8000-000000000009');
  const count = (table: string) => db.get<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.identifier(table)} WHERE owner_id=${owner}`)?.n ?? 0;
  const live = (table: string) => db.get<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.identifier(table)} WHERE owner_id=${owner} AND deleted_at IS NULL`)?.n ?? 0;
  const outbox = () => db.get<{ n: number }>(sql`SELECT count(*) AS n FROM sync_outbox WHERE table_name LIKE 'daily_%'`)?.n ?? 0;
  return { db, repo: forOwner, count, live, outbox };
}

/** The same state the way it reads back: an empty note is no note. */
const canon = (s: RoutinesState) => JSON.parse(JSON.stringify(s, (k, v) => (k === 'note' && v === null ? undefined : v))) as RoutinesState;

/** Every field the screens keep, with odd values on purpose. */
function fixtureState(): RoutinesState {
  const s = emptyState();
  s.routines[0] = { ...s.routines[0], name: 'Fixture early', from: 5.25, to: 11, days: [1, 2, 3, 4, 5], remind: false, color: 'warning',
    pauses: [{ from: addDays(TODAY, -20), until: addDays(TODAY, -15), why: 'Fixture reason' }, { from: TODAY, until: addDays(TODAY, 4), why: null }] };
  s.routines[2] = { ...s.routines[2], from: 21.5, to: 24, days: [0, 6], color: 'training' };
  s.hidden = [{ id: 'gone', name: 'Fixture hidden', from: 15, to: 16, color: 'food', days: [0, 1, 2, 3, 4, 5, 6], remind: true, pauses: [{ from: addDays(TODAY, -3), until: addDays(TODAY, 30), why: 'Fixture away' }], sub: 'Fixture sub line' }];
  const base = { amt: null, unit: '', dose: 'Tick when done', type: 'Other', kind: 'check', days: null, created: addDays(TODAY, -40) } as const;
  s.items = [
    { ...base, id: 'fa', name: 'Fixture dose A', amt: 13.25, unit: 'zq', dose: '13¼ zq', type: 'Supplement', kind: 'dose', routines: ['morning', 'night'], h: 7.25,
      left: 41.5, perDay: 2.5, sup: 'fixture grams', note: '1 zq = 1 zq', mixed: 'Fixture mixed line', days: [1, 3, 5] },
    { ...base, id: 'fb', name: 'Fixture vial B', amt: 250, unit: 'mcg', dose: '250 mcg', type: 'Peptide', kind: 'dose', routines: ['night'], h: 22, vial: 10, left: 6, site: 'Fixture site', days: [] },
    { ...base, id: 'fc', name: 'Fixture check C', dose: '10 min', routines: ['midday'], h: 12.75, days: [0, 1, 2, 3, 4, 5, 6] },
    { ...base, id: 'fd', name: 'Fixture med D', amt: null, unit: 'mL', dose: ' mL', type: 'Medication', kind: 'dose', routines: [], h: 9 },
    { ...base, id: 'fe', name: 'Fixture enhancer E', amt: 1, unit: 'units', dose: '1 units', type: 'Enhancer', kind: 'dose', routines: ['midday', 'morning'], h: 13, created: TODAY },
  ];
  s.log = { [addDays(TODAY, -2)]: { fa: 'd', fc: 's' }, [addDays(TODAY, -1)]: { fb: 'd' }, [TODAY]: { fe: 's', fc: 'd' } };
  return s;
}

test('every field of every routine, hidden routine, pause, item and check-off reads back as it was saved', async () => {
  const { repo, count } = await account();
  const s = fixtureState();
  commitRoutinesState(repo, s, null);
  expect(readRoutinesState(repo)).toEqual(canon(s));
  // Saving the same state again writes nothing.
  expect(commitRoutinesState(repo, s, readRoutinesState(repo))).toBe(0);
  expect(commitRoutinesState(repo, s, null)).toBe(0);
  expect(count('daily_blocks')).toBe(4);
  expect(count('daily_pauses')).toBe(3);
  // A compound for each item with a typed amount or unit; the check has none.
  expect(count('daily_compounds')).toBe(4);
  // The screens' ids stay in app_id; row ids are UUIDs.
  const fa = repo.get('daily_items', itemRowId('fa'))!;
  expect(fa.data).toMatchObject({ app_id: 'fa', type: 'supplement', time_min: 435, on_hand: 41.5, per_day: 2.5, days_mask: 1 | 4 | 16 });
  expect(repo.get('daily_compounds', String(fa.data.compound_id))!.data).toMatchObject({ amount: 13.25, unit: 'zq' });
  expect(repo.get('daily_blocks', blockRowId('morning'))!.data).toMatchObject({ app_id: 'morning', start_min: 315, end_min: 660, days_mask: 31, remind: 0 });
});

test('an item amount is kept exactly as typed and never filled in', async () => {
  const { repo } = await account();
  const s = fixtureState();
  commitRoutinesState(repo, s, null);
  const back = readRoutinesState(repo)!;
  expect(back.items.map(i => [i.id, i.amt, i.unit])).toEqual([['fa', 13.25, 'zq'], ['fb', 250, 'mcg'], ['fc', null, ''], ['fd', null, 'mL'], ['fe', 1, 'units']]);
  // Nothing is written on a check-off but that it was done or skipped.
  for (const row of repo.list('daily_logs')) expect([row.data.amount, row.data.unit, row.data.compound_id, row.data.site, row.data.note]).toEqual([null, null, null, null, null]);
});

test('a real account starts with the three empty routines and writes nothing until something changes', async () => {
  const { repo, count } = await account();
  const store = createLocalRoutinesStore(repo);
  expect(store.read()).toEqual(emptyState());
  expect(routineTables.reduce((n, t) => n + count(t), 0)).toBe(0);
  store.setRemind('night', false);
  expect(count('daily_blocks')).toBe(3);
  expect(createLocalRoutinesStore(repo).read().routines.find(r => r.id === 'night')!.remind).toBe(false);
});

test('the demo starts with the sample routines, kept in the tables, and none of it waits to upload', async () => {
  const { db, repo, live, outbox } = await account();
  const demo = new Repository(db, 'demo', DEVICE_A, () => '40000000-0000-4000-8000-000000000008');
  const store = createLocalRoutinesStore(demo);
  const n = nowOf();
  expect(store.read()).toEqual(demoState(n));
  expect(readRoutinesState(demo)).toEqual(canon(demoState(n)));
  expect(createLocalRoutinesStore(demo).read()).toEqual(canon(demoState(n)));
  expect(db.get<{ n: number }>(sql`SELECT count(*) AS n FROM daily_items WHERE owner_id='demo'`)!.n).toBe(12);
  expect(outbox()).toBe(0);
  // The real account beside it is untouched.
  expect(live('daily_items')).toBe(0);
  void repo;
});

const draft = (over: Partial<NewItem> = {}): NewItem => ({ name: 'Fixture new', type: 'Supplement', kind: 'dose', amt: 2.5, unit: 'mg', routines: ['morning'], time: 8, hand: '30', mixed: '', note: null, ...over });

/** A second store on the same rows, as after the app is opened again. */
const reopened = (repo: Repository) => createLocalRoutinesStore(repo).read();

describe('each store method writes the rows the next open reads back', () => {
  let repo: Repository, store: RoutinesStore, tools: Awaited<ReturnType<typeof account>>;
  beforeEach(async () => {
    tools = await account();
    repo = tools.repo;
    commitRoutinesState(repo, fixtureState(), null);
    store = createLocalRoutinesStore(repo);
  });
  const same = () => expect(reopened(repo)).toEqual(canon(store.read()));

  test('toggleDone ticks and unticks, keeps on hand in step, and keeps an untick as an undone row', () => {
    store.toggleDone('fa');
    expect(store.read().log[TODAY].fa).toBe('d');
    expect(store.read().items[0].left).toBe(40.5);
    same();
    const id = routineLogId(itemRowId('fa'), TODAY);
    expect(repo.get('daily_logs', id)!.data).toMatchObject({ status: 'done', undone: 0, day: TODAY });
    store.toggleDone('fa');
    expect(store.read().log[TODAY]?.fa).toBeUndefined();
    expect(store.read().items[0].left).toBe(41.5);
    expect(repo.get('daily_logs', id)!.data).toMatchObject({ status: 'done', undone: 1 });
    same();
    store.toggleDone('fa');
    expect(repo.get('daily_logs', id)!.data).toMatchObject({ status: 'done', undone: 0 });
    same();
  });

  test('toggleSkip marks and clears a skip, for today or a day given', () => {
    store.toggleSkip('fb');
    store.toggleSkip('fc', addDays(TODAY, -3));
    expect(store.read().log[addDays(TODAY, -3)]).toEqual({ fc: 's' });
    same();
    store.toggleSkip('fb');
    expect(store.read().log[TODAY].fb).toBeUndefined();
    same();
  });

  test('addItem writes the item, its typed amount and its place; undo takes all of them away', () => {
    const { item, undo } = store.addItem(draft({ routines: ['night', 'morning'] }));
    expect(item).toMatchObject({ amt: 2.5, unit: 'mg', left: 30, perDay: 1, routines: ['night', 'morning'] });
    same();
    expect(reopened(repo).items.at(-1)!.routines).toEqual(['night', 'morning']);
    const row = itemRowId(item.id);
    expect(tools.live('daily_placements')).toBe(6 + 2);
    undo();
    expect(store.read().items.some(i => i.id === item.id)).toBe(false);
    expect(repo.get('daily_items', row)!.deleted_at).not.toBeNull();
    expect(repo.get('daily_items', row)!.data.name).toBeNull();
    expect(tools.live('daily_compounds')).toBe(4);
    expect(tools.live('daily_placements')).toBe(6);
    same();
    // Undo pressed again changes nothing.
    undo();
    same();
  });

  test('a check item keeps no amount', () => {
    const { item } = store.addItem(draft({ kind: 'check', amt: 400, unit: 'mg', hand: '' }));
    expect(item).toMatchObject({ amt: null, unit: '', dose: 'Tick when done' });
    expect(reopened(repo).items.at(-1)).toMatchObject({ amt: null, unit: '' });
    expect(repo.get('daily_items', itemRowId(item.id))!.data.compound_id).toBeNull();
  });

  test('addRoutine writes the routine and puts the items picked in it', () => {
    const r = store.addRoutine({ name: 'Fixture new routine', from: 14, to: 15.5, days: [2, 4], color: 'recovery', items: ['fc'] });
    same();
    expect(reopened(repo).routines.at(-1)).toEqual(r);
    expect(reopened(repo).items.find(i => i.id === 'fc')!.routines).toEqual(['midday', r.id]);
  });

  test('reorder moves the routines and the new order is kept', () => {
    store.reorder(['night', 'morning']);
    expect(reopened(repo).routines.map(r => r.id)).toEqual(['night', 'morning', 'midday']);
  });

  test('restore brings a hidden routine back; undo hides it again, and a second undo does nothing', () => {
    const undo = store.restore('gone');
    expect(reopened(repo).hidden).toEqual([]);
    expect(reopened(repo).routines.at(-1)!.id).toBe('gone');
    expect(repo.get('daily_blocks', blockRowId('gone'))!.data.hidden).toBe(0);
    undo();
    expect(reopened(repo).hidden.map(r => [r.id, r.sub])).toEqual([['gone', 'Fixture sub line']]);
    undo();
    same();
    // Restoring a routine that is not hidden changes nothing.
    store.restore('morning');
    same();
  });

  test('pause and resume keep their days, and undo of a pause resumes', () => {
    const undo = store.pause('midday', addDays(TODAY, 7), 'Fixture trip');
    expect(reopened(repo).routines[1].pauses).toEqual([{ from: TODAY, until: addDays(TODAY, 7), why: 'Fixture trip' }]);
    undo();
    expect(reopened(repo).routines[1].pauses).toEqual([]);
    // A pause that started earlier ends today when resumed; its past days stay paused.
    store.resume('gone');
    same();
    store.resume('morning');
    expect(reopened(repo).routines[0].pauses).toEqual([{ from: addDays(TODAY, -20), until: addDays(TODAY, -15), why: 'Fixture reason' }]);
    expect(tools.live('daily_pauses')).toBe(2);
  });

  test('setRemind turns reminders on and off', () => {
    store.setRemind('morning', true);
    expect(reopened(repo).routines[0].remind).toBe(true);
    store.setRemind('morning', false);
    expect(reopened(repo).routines[0].remind).toBe(false);
  });

  test('Save pressed twice adds one item and one routine; once undone, the same add can be made again', () => {
    const first = store.addItem(draft());
    expect(store.addItem(draft())).toBe(first);
    expect(store.read().items.filter(i => i.name === 'Fixture new')).toHaveLength(1);
    first.undo();
    const again = store.addItem(draft());
    expect(again.item.id).not.toBe(first.item.id);
    expect(reopened(repo).items.filter(i => i.name === 'Fixture new')).toHaveLength(1);
    // A different draft is a different add.
    store.addItem(draft({ name: 'Fixture other' }));
    expect(reopened(repo).items.filter(i => i.name.startsWith('Fixture new') || i.name === 'Fixture other')).toHaveLength(2);
    const r = store.addRoutine({ name: 'Fixture twice', from: 6, to: 7, days: [], color: 'sleep', items: [] });
    expect(store.addRoutine({ name: 'Fixture twice', from: 6, to: 7, days: [], color: 'sleep', items: [] })).toBe(r);
    expect(reopened(repo).routines.filter(x => x.name === 'Fixture twice')).toHaveLength(1);
  });

  test('the store tells its readers when another writer changes the rows', () => {
    const seen = jest.fn();
    store.subscribe(seen);
    store.read();
    repo.remove('daily_logs', routineLogId(itemRowId('fc'), TODAY));
    expect(seen).toHaveBeenCalled();
    expect(store.read().log[TODAY].fc).toBeUndefined();
    // A write of the store's own does not make it read everything again.
    seen.mockClear();
    store.toggleDone('fb');
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

test('a guard over any store lets a second Save through once the double tap has passed', () => {
  let t = 0;
  const items: Item[] = [];
  const base = { read: () => ({ ...emptyState(), items }), addItem: jest.fn((d: NewItem) => { const item = { id: `x${items.length}`, name: d.name } as Item; items.push(item); return { item, undo: () => {} }; }) };
  const store = guardRoutinesStore(base as unknown as RoutinesStore, () => t);
  store.addItem(draft());
  t = 1000; store.addItem(draft());
  expect(base.addItem).toHaveBeenCalledTimes(1);
  t = 3000; store.addItem(draft());
  expect(base.addItem).toHaveBeenCalledTimes(2);
});

describe('the document an earlier build kept under the routines key', () => {
  test('is taken into the tables once, then cleared and never read again', async () => {
    const { repo, live } = await account();
    const s = fixtureState();
    repo.localSave(ROUTINES_KEY, s);
    const store = createLocalRoutinesStore(repo);
    expect(store.read()).toEqual(canon(s));
    expect(repo.localGet(ROUTINES_KEY)).toBeNull();
    expect(live('daily_items')).toBe(5);
    // Changes after the import go to the tables, and a later open reads the tables.
    store.toggleDone('fb');
    expect(reopened(repo).log[TODAY].fb).toBe('d');
  });

  test('a bad document is cleared without touching the tables', async () => {
    const { repo, count } = await account();
    repo.localSave(ROUTINES_KEY, { v: 1, routines: 'not a list' });
    expect(createLocalRoutinesStore(repo).read()).toEqual(emptyState());
    expect(repo.localGet(ROUTINES_KEY)).toBeNull();
    expect(count('daily_blocks')).toBe(0);
  });

  test('a document written while the store is open (as setup writes its routine windows) is taken in and shown', async () => {
    const { repo } = await account();
    const store = createLocalRoutinesStore(repo);
    const r = store.addRoutine({ name: 'Fixture setup', from: 6, to: 9, days: [], color: 'warning', items: [] });
    store.addItem({ ...draft(), kind: 'check', amt: null, unit: '', hand: '', routines: [r.id] });
    const seen = jest.fn();
    store.subscribe(seen);
    const s = store.read();
    repo.localSave(ROUTINES_KEY, { ...s, routines: s.routines.map(x => (x.id === r.id ? { ...x, from: 6.5, to: 10, remind: false } : x)) });
    expect(seen).toHaveBeenCalled();
    expect(store.read().routines.find(x => x.id === r.id)).toMatchObject({ from: 6.5, to: 10, remind: false });
    expect(repo.localGet(ROUTINES_KEY)).toBeNull();
    expect(reopened(repo).routines.find(x => x.id === r.id)).toMatchObject({ from: 6.5, to: 10, remind: false });
  });
});

describe('days', () => {
  test('a check-off is kept on the day the screens show, at any hour', async () => {
    const { repo } = await account();
    commitRoutinesState(repo, fixtureState(), null);
    clock.now = () => new Date(`${TODAY}T01:30:00`);
    const late = createLocalRoutinesStore(repo);
    late.toggleDone('fb');
    expect(repo.get('daily_logs', routineLogId(itemRowId('fb'), TODAY))!.data).toMatchObject({ day: TODAY, status: 'done', undone: 0 });
    expect(reopened(repo).log[TODAY].fb).toBe('d');
  });

  test('history older than the store keeps is removed and keeps no values; a recent untick stays as an undone row', async () => {
    const { repo } = await account();
    const s = fixtureState();
    const old = addDays(TODAY, -200);
    s.log[old] = { fa: 'd' };
    commitRoutinesState(repo, s, null);
    const oldRow = routineLogId(itemRowId('fa'), old);
    expect(repo.get('daily_logs', oldRow)!.data.status).toBe('done');
    // The store drops days older than its history on its next write.
    createLocalRoutinesStore(repo).toggleSkip('fb');
    expect(repo.get('daily_logs', oldRow)!.deleted_at).not.toBeNull();
    expect(repo.get('daily_logs', oldRow)!.data.status).toBeNull();
    expect(reopened(repo).log[old]).toBeUndefined();
  });
});

test('signing out erases every routine row and the old document, and the next account starts empty', async () => {
  const { repo, count } = await account();
  commitRoutinesState(repo, fixtureState(), null);
  repo.localSave(ROUTINES_KEY, fixtureState());
  expect(count('daily_pauses')).toBeGreaterThan(0);
  repo.wipe();
  for (const table of routineTables) expect([table, count(table)]).toEqual([table, 0]);
  expect(repo.localGet(ROUTINES_KEY)).toBeUndefined();
  expect(createLocalRoutinesStore(repo).read()).toEqual(emptyState());
});

test('nothing a signed-in account does in Routines is queued for upload while routine sync is off', async () => {
  const { repo, outbox } = await account();
  repo.localSave(ROUTINES_KEY, fixtureState());
  const store = createLocalRoutinesStore(repo);
  store.read();
  store.toggleDone('fa');
  store.toggleSkip('fc');
  const { undo } = store.addItem(draft());
  undo();
  store.addRoutine({ name: 'Fixture queued', from: 6, to: 7, days: [], color: 'sleep', items: ['fa'] });
  store.pause('night', addDays(TODAY, 3), null);
  store.resume('night');
  store.restore('gone');
  store.reorder(['night']);
  store.setRemind('morning', true);
  expect(outbox()).toBe(0);
  expect(repo.pending().filter(p => p.row.table.startsWith('daily_'))).toEqual([]);
  expect(repo.hasUnsynced()).toBe(false);
  // The rows are there, counted as kept on this phone alone.
  expect(repo.phoneOnlyRoutineCount()).toBeGreaterThan(0);
});

test('rows written before the store kept app_id still read, and the column step keeps them when it runs again', async () => {
  const { db, repo } = await account();
  // This branch's earlier row shape: no app_id, a colour and type the screens do not use, one log.
  const { routineFixtureRows, FIXTURE_IDS } = jest.requireActual('../fixtures/routines') as typeof import('../fixtures/routines');
  for (const row of routineFixtureRows()) repo.save(row.table, row.data, row.id, 1000);
  const before = readRoutinesState(repo)!;
  expect(before.routines).toEqual([expect.objectContaining({ id: FIXTURE_IDS.block, name: 'Zzyq Evening Block', color: 'sleep', from: 21, to: 23, days: [1, 2, 3, 4, 5] })]);
  expect(before.items.find(i => i.id === FIXTURE_IDS.item)).toMatchObject({ type: 'Peptide', kind: 'dose', amt: 13.25, unit: 'zq-unit', routines: [FIXTURE_IDS.block], h: 21.25, left: 4417 });
  expect(before.log['2026-11-19']).toEqual({ [FIXTURE_IDS.item]: 'd', [FIXTURE_IDS.check]: 's' });
  // Saved back through the store, the rows keep their ids and the columns this store does not speak for.
  commitRoutinesState(repo, before, null);
  expect(repo.get('daily_items', FIXTURE_IDS.item)!.data).toMatchObject({ calc_vial: 5, calc_water: 2, on_hand_day: '2026-11-18', compound_id: FIXTURE_IDS.compound, app_id: FIXTURE_IDS.item });
  expect(readRoutinesState(repo)).toEqual(before);
  // Run the column step again, as on a database that had it before: every row is still there.
  const { migrate } = jest.requireActual('drizzle-orm/expo-sqlite/migrator') as typeof import('drizzle-orm/expo-sqlite/migrator');
  const migrations = (jest.requireActual('../src/data/migrations') as typeof import('../src/data/migrations')).default;
  db.run(sql`DELETE FROM __drizzle_migrations WHERE created_at>=1792238400006`);
  await migrate(db, migrations);
  expect(readRoutinesState(repo)!.items.map(i => i.id).sort()).toEqual(before.items.map(i => i.id).sort());
  expect(repo.get('daily_blocks', FIXTURE_IDS.block)!.data.name).toBe('Zzyq Evening Block');
});

describe('a value out of the range its column takes', () => {
  test('is kept inside it, so one big on-hand count does not stop the saves after it', async () => {
    const { repo } = await account();
    const store = createLocalRoutinesStore(repo);
    const good = store.addItem(draft({ name: 'Fixture good' })).item;
    const big = store.addItem(draft({ name: 'Fixture big', hand: '1000000' })).item;
    expect(repo.get('daily_items', itemRowId(big.id))!.data.on_hand).toBe(999999);
    store.toggleDone(good.id);
    expect(repo.get('daily_logs', routineLogId(itemRowId(good.id), TODAY))!.data).toMatchObject({ status: 'done', undone: 0 });
    const back = reopened(repo);
    expect(back.items.map(i => i.name)).toEqual(['Fixture good', 'Fixture big']);
    expect(back.items.find(i => i.id === big.id)!.left).toBe(999999);
    expect(back.items.find(i => i.id === good.id)!.left).toBe(29);
    expect(back.log[TODAY]).toEqual({ [good.id]: 'd' });
    // Ticking the big one saves too.
    store.toggleDone(big.id);
    expect(reopened(repo).log[TODAY]).toEqual({ [good.id]: 'd', [big.id]: 'd' });
  });

  test('every number is clamped to its column and a number that is not finite is kept as none', async () => {
    const { repo } = await account();
    const s = fixtureState();
    Object.assign(s.routines[0], { from: -3, to: 99 });
    Object.assign(s.routines[1], { from: NaN, to: Infinity });
    Object.assign(s.items[0], { left: 5e9, perDay: -2, vial: Infinity, h: 30, amt: NaN });
    Object.assign(s.items[1], { left: NaN, h: -1 });
    Object.assign(s.items[2], { h: NaN });
    expect(() => commitRoutinesState(repo, s, null)).not.toThrow();
    expect(repo.get('daily_blocks', blockRowId(s.routines[0].id))!.data).toMatchObject({ start_min: 0, end_min: 2879 });
    expect(repo.get('daily_blocks', blockRowId(s.routines[1].id))!.data).toMatchObject({ start_min: null, end_min: null });
    expect(repo.get('daily_items', itemRowId('fa'))!.data).toMatchObject({ on_hand: 999999, per_day: 0, vial: null, time_min: 1439 });
    expect(repo.get('daily_items', itemRowId('fb'))!.data).toMatchObject({ on_hand: null, time_min: 0 });
    expect(repo.get('daily_items', itemRowId('fc'))!.data.time_min).toBeNull();
    const back = readRoutinesState(repo)!;
    expect(back.items.find(i => i.id === 'fa')).toMatchObject({ left: 999999, perDay: 0, amt: null, h: 23 + 59 / 60 });
    expect(back.items.find(i => i.id === 'fa')!.vial).toBeUndefined();
    expect(back.items.find(i => i.id === 'fb')!.left).toBeUndefined();
    // An item with no time takes its routine's start, as one saved before times were kept.
    expect(back.items.find(i => i.id === 'fc')!.h).toBe(back.routines.find(r => r.id === 'midday')!.from);
    expect(back.routines[1]).toMatchObject({ from: 8, to: 9 });
  });

  test('an old document with values out of range, of the wrong kind or missing is taken in, and opens every time', async () => {
    const { repo, live } = await account();
    const s = fixtureState() as unknown as Record<string, unknown> & { routines: Record<string, unknown>[]; items: Record<string, unknown>[]; log: Record<string, unknown> };
    Object.assign(s.routines[0], { from: '6', to: null, days: 'weekdays', pauses: [{ from: 'soon', until: TODAY }, null], color: 7, remind: 'yes' });
    Object.assign(s.items[0], { left: 1e12, perDay: 'two', vial: -5, h: '7', amt: Infinity, unit: 4, created: 'long ago', days: [1, 9, 2.5, '3'] });
    Object.assign(s.items[1], { type: 'constructor', kind: 'other', note: 12, dose: undefined, routines: ['night', 5, null] });
    s.log = { ...s.log, 'not a day': { fa: 'd' }, [addDays(TODAY, -5)]: null, [addDays(TODAY, -6)]: { fa: 'x', fb: 's' } };
    repo.localSave(ROUTINES_KEY, s);
    const store = createLocalRoutinesStore(repo);
    const read = store.read();
    expect(repo.localGet(ROUTINES_KEY)).toBeNull();
    expect(live('daily_items')).toBe(5);
    expect(read.items.find(i => i.id === 'fa')).toMatchObject({ left: 999999, vial: 0, amt: null, unit: '', days: [1] });
    expect(read.items.find(i => i.id === 'fa')!.perDay).toBeUndefined();
    expect(read.items.find(i => i.id === 'fb')).toMatchObject({ type: 'Other', kind: 'check', routines: ['night'] });
    expect(read.routines[0]).toMatchObject({ color: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], pauses: [] });
    expect(read.log['not a day']).toBeUndefined();
    expect(read.log[addDays(TODAY, -6)]).toEqual({ fb: 's' });
    // The store goes on saving, and the next open reads what it saved.
    store.toggleDone('fa');
    expect(reopened(repo).log[TODAY]).toEqual({ fa: 'd', fc: 'd', fe: 's' });
  });
});

test('a check-off for another day is stamped at noon of that day, so deleting a day takes only its own', async () => {
  const { repo } = await account();
  commitRoutinesState(repo, fixtureState(), null);
  const store = createLocalRoutinesStore(repo);
  const past = addDays(TODAY, -3);
  store.toggleDone('fc', past);
  store.toggleSkip('fb', past);
  store.toggleDone('fa');
  const noon = new Date(`${past}T12:00:00`).getTime();
  expect(repo.get('daily_logs', routineLogId(itemRowId('fc'), past))!.data.at).toBe(noon);
  expect(repo.get('daily_logs', routineLogId(itemRowId('fb'), past))!.data.at).toBe(noon);
  // Today's keeps the moment it was made.
  const today = repo.get('daily_logs', routineLogId(itemRowId('fa'), TODAY))!.data.at as number;
  expect(Math.abs(today - Date.now())).toBeLessThan(60000);
});
