import { localDatabase } from './sqlite';
import { Repository, wipeAllOwners } from '../../src/data/repository';
import { columns, localTables, routineTables, syncedTables, validateRow, type Row, type Table } from '../../src/data/rows';
import { DEFAULT_SYNC_FLAGS, syncFields, syncTables } from '../../src/data/sync/flags';
import { SyncEngine, type Transport } from '../../src/data/sync/engine';
import { SupabaseTransport } from '../../src/data/sync/supabase';
import { createAccountBackup, createPhoneBackup } from '../../src/phone-only/backup';
import { promoteDemo } from '../../src/features/onboarding/demo-transfer';
import { createLocalRoutinesStore } from '../../src/features/routines/store';
import { DEVICE_A, OWNER_A, OWNER_B } from '../../fixtures/sync';
import { FIXTURE_IDS, ROUTINE_SENTINELS, routineFixtureRows } from '../../fixtures/routines';

/* Synthetic routines only. Names, doses, units, notes, sites and supply are medication data. */

const uuid = () => { let n = 0; return () => `50000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; };
const repoFor = (db: Awaited<ReturnType<typeof localDatabase>>['db'], owner: string, flags = DEFAULT_SYNC_FLAGS) => new Repository(db, owner, DEVICE_A, uuid(), flags);
function seed(repo: Repository) {
  for (const row of routineFixtureRows()) repo.save(row.table, row.data, row.id, 1000);
}
const everyValue = (rows: Row[]) => JSON.stringify(rows.map(row => row.data));

test('the local migrations add the eight tables, each with exactly its catalog columns', async () => {
  const { sqlite } = await localDatabase();
  try {
    expect([...routineTables]).toEqual(['daily_blocks', 'daily_items', 'daily_placements', 'daily_compounds', 'daily_logs', 'daily_types', 'daily_prefs', 'daily_pauses']);
    for (const table of routineTables) {
      const names = sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      expect(names).toEqual(['owner_id', 'id', 'updated_at', 'deleted_at', 'device_id', ...Object.keys(columns[table])]);
    }
    const applied = sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()?.n;
    expect(applied).toBe(8);
  } finally { sqlite.close(); }
});

test('the wire catalog is unchanged: the server tables are the same 23 and none is a routine table', () => {
  expect(syncedTables).toHaveLength(23);
  expect(syncedTables.filter(table => table.startsWith('daily_'))).toEqual([]);
  expect(localTables).toEqual([...syncedTables, ...routineTables]);
  // `routines` is the workout-template table. Daily routines never reuse it.
  expect(Object.keys(columns.routines)).toEqual(['name', 'position']);
});

test('the sync gate is off by default and the v1 flag does not open it', () => {
  expect(DEFAULT_SYNC_FLAGS.dailyRoutines).toBe(false);
  for (const flags of [DEFAULT_SYNC_FLAGS, { syncedV1Columns: true }, { syncedV1Columns: true, dailyRoutines: false }]) {
    for (const table of routineTables) {
      expect(syncTables(flags)).not.toContain(table);
      expect(() => syncFields(table, flags)).toThrow('Sync feature disabled.');
    }
  }
  expect(syncTables()).toEqual(syncTables({ syncedV1Columns: false }));
  expect(syncTables({ syncedV1Columns: true, dailyRoutines: true }).filter(table => table.startsWith('daily_'))).toEqual([...routineTables]);
});

test('sign-out counts routine rows where they are stored, apart from ordinary changes that are waiting to sync', async () => {
  const local = await localDatabase();
  try {
    const repo = repoFor(local.db, OWNER_A), other = repoFor(local.db, OWNER_B);
    expect(repo.phoneOnlyRoutineCount()).toBe(0);
    seed(repo);
    const count = routineFixtureRows().length;
    expect(repo.phoneOnlyRoutineCount()).toBe(count);
    expect(repo.unsyncedCount()).toBe(0);
    repo.save('sessions', {});
    expect(repo.phoneOnlyRoutineCount()).toBe(count);
    expect(repo.unsyncedCount()).toBe(1);
    // It is this owner's count only.
    expect(other.phoneOnlyRoutineCount()).toBe(0);
    // A removed row is no longer routine data to lose. With every row gone there is nothing to warn about.
    repo.remove('daily_logs', FIXTURE_IDS.log, 5000);
    expect(repo.phoneOnlyRoutineCount()).toBe(count - 1);
    for (const table of routineTables) for (const row of repo.list(table)) repo.remove(table, row.id, 6000);
    expect(repo.phoneOnlyRoutineCount()).toBe(0);
    expect(repo.unsyncedCount()).toBe(1);
    // A demo or phone-only owner has no account to sign out of, and synced routines are not phone-only.
    for (const owner of ['guest', 'demo']) { const kept = repoFor(local.db, owner); seed(kept); expect(kept.phoneOnlyRoutineCount()).toBe(0); }
    const synced = repoFor(local.db, OWNER_B, { syncedV1Columns: false, dailyRoutines: true });
    seed(synced);
    expect(synced.phoneOnlyRoutineCount()).toBe(0);
    expect(synced.unsyncedCount()).toBe(count);
  } finally { local.sqlite.close(); }
});

test('with the gate off no routine write is queued, so turning sync on later uploads none of the history', async () => {
  const local = await localDatabase();
  try {
    const repo = repoFor(local.db, OWNER_A);
    seed(repo);
    // Every kind of write: a new row, an edit and a removal.
    repo.save('daily_items', { ...repo.get('daily_items', FIXTURE_IDS.item)!.data, on_hand: 3 }, FIXTURE_IDS.item, 2000);
    repo.remove('daily_logs', FIXTURE_IDS.log, 3000);
    const queued = () => local.sqlite.prepare("SELECT count(*) AS n FROM sync_outbox WHERE table_name LIKE 'daily!_%' ESCAPE '!'").get()?.n;
    expect(queued()).toBe(0);
    expect(repo.hasUnsynced()).toBe(false);
    expect(repo.unsyncedCount()).toBe(0);
    // An ordinary table is still queued beside them.
    repo.save('sessions', {});
    expect(local.sqlite.prepare('SELECT table_name FROM sync_outbox WHERE owner_id=?').all(OWNER_A).map(row => row.table_name)).toEqual(['sessions']);
    // The same phone with the gate turned on: nothing written before is waiting to upload.
    const later = repoFor(local.db, OWNER_A, { syncedV1Columns: false, dailyRoutines: true });
    expect(later.pending().filter(item => item.row.table.startsWith('daily_'))).toEqual([]);
    // With the gate on, a routine write is queued like any other row.
    later.save('daily_types', { name: 'Zzyq Later Type', position: 9 });
    expect(later.pending().map(item => item.row.table)).toEqual(['daily_types', 'sessions']);
    expect(queued()).toBe(1);
  } finally { local.sqlite.close(); }
});

test('with the gate off nothing is pushed, pulled or accepted, and the rows are still counted for sign-out', async () => {
  const local = await localDatabase();
  try {
    const repo = repoFor(local.db, OWNER_A);
    seed(repo);
    const count = routineFixtureRows().length;
    expect(repo.pending()).toEqual([]);
    // These rows have no copy off the phone, so signing out has to warn before it erases them.
    expect(repo.hasUnsynced()).toBe(false);
    expect(repo.phoneOnlyRoutineCount()).toBe(count);
    const pushed: Row[] = [], pulled: Table[] = [];
    const transport: Transport = { owner: OWNER_A, push: async rows => { pushed.push(...rows); }, pull: async table => { pulled.push(table); return []; } };
    const engine = new SyncEngine(repo, transport);
    await engine.sync();
    engine.close();
    expect(pushed).toEqual([]);
    expect(pulled.filter(table => table.startsWith('daily_'))).toEqual([]);
    expect(repo.phoneOnlyRoutineCount()).toBe(count);
    for (const table of routineTables) {
      expect(() => repo.applyPage(table, [], '1')).toThrow();
      expect(repo.cursor(table)).toBe('0');
    }
    expect(() => new SyncEngine(repo, { ...transport, syncFlags: { syncedV1Columns: false, dailyRoutines: true } })).toThrow('Sync feature flags must match.');
    // The real transport refuses a routine row before any request is made.
    const calls: string[] = [];
    const client = { auth: { getSession: async () => ({ data: { session: { user: { id: OWNER_A } } }, error: null }) }, rpc: (name: string) => { calls.push(name); return Promise.resolve({ data: [], error: null }); }, from: (name: string) => { calls.push(name); throw new Error('unexpected'); } };
    const real = new SupabaseTransport(client as never, OWNER_A);
    await expect(real.push([repo.list('daily_items')[0]])).rejects.toThrow();
    await expect(real.pull('daily_logs', '0', 10)).rejects.toThrow();
    expect(calls).toEqual([]);
  } finally { local.sqlite.close(); }
});

test('guest and demo routines never enter an outbox', async () => {
  const local = await localDatabase();
  try {
    for (const owner of ['guest', 'demo']) {
      const repo = repoFor(local.db, owner);
      seed(repo);
      expect(repo.list('daily_logs').length).toBeGreaterThan(0);
      expect(repo.unsyncedCount()).toBe(0);
    }
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM sync_outbox').get()?.n).toBe(0);
  } finally { local.sqlite.close(); }
});

test('rows round-trip with their values, and a deleted row keeps no name, dose, note, site or supply', async () => {
  const local = await localDatabase();
  try {
    const repo = repoFor(local.db, OWNER_A);
    seed(repo);
    const stored = routineTables.flatMap(table => repo.list(table));
    expect(stored).toHaveLength(routineFixtureRows().length);
    for (const sentinel of ROUTINE_SENTINELS) expect(everyValue(stored)).toContain(sentinel);
    for (const row of stored) repo.remove(row.table, row.id, 5000);
    const dead = routineTables.flatMap(table => repo.list(table, true));
    expect(dead).toHaveLength(stored.length);
    for (const row of dead) {
      expect(row.deleted_at).not.toBeNull();
      expect(Object.values(row.data).every(value => value === null)).toBe(true);
    }
    const dump = routineTables.map(table => JSON.stringify(local.sqlite.prepare(`SELECT * FROM ${table}`).all())).join('');
    for (const sentinel of ROUTINE_SENTINELS) expect(dump).not.toContain(sentinel);
  } finally { local.sqlite.close(); }
});

test('validation is fail-closed for routine rows', () => {
  const base = (table: Table, data: Row['data']): Row => ({ table, owner_id: OWNER_A, id: '30000000-0000-4000-8000-000000000001', updated_at: 1, deleted_at: null, device_id: DEVICE_A, data });
  for (const row of routineFixtureRows()) expect(() => validateRow({ ...base(row.table, row.data), id: row.id })).not.toThrow();
  const bad: [Table, Row['data']][] = [
    ['daily_logs', { day: '2026-11-1' }], ['daily_logs', { day: 20261119 }], ['daily_logs', { amount: '250' }], ['daily_logs', { undone: 2 }], ['daily_logs', { rest: -1 }], ['daily_logs', { on_hand_used: -1 }], ['daily_logs', { on_hand_used: 1000000 }], ['daily_logs', { on_hand_used: '1' }],
    ['daily_logs', { mood: 3 }], ['daily_items', { feeling: 'low' }], ['daily_items', { vendor: 'x' }], ['daily_items', { on_hand: 1000000 }], ['daily_items', { on_hand: -1 }], ['daily_items', { days_mask: 128 }], ['daily_items', { per_day: '2' }],
    ['daily_items', { mixed_day: 'yesterday' }], ['daily_items', { time_min: 1440 }], ['daily_blocks', { start_min: -1 }], ['daily_blocks', { days_mask: 127 }], ['daily_blocks', { days_mask: 0 }],
    ['daily_blocks', { hidden: 2 }], ['daily_blocks', { remind: 2 }], ['daily_pauses', { until_day: 'soon' }], ['daily_pauses', { reason: 'x' }], ['daily_compounds', { start_day: '2026-13' }], ['daily_compounds', { amount: Infinity }], ['daily_prefs', { day_rollover_hour: 7 }], ['daily_prefs', { setup: '{}' }],
  ];
  for (const [table, data] of bad) expect(() => validateRow(base(table, data))).toThrow('Invalid sync row.');
  expect(() => validateRow({ ...base('daily_items', {}), id: 'item_abc' })).toThrow('Invalid sync row.');
});

test.each(['sign-out and account deletion', 'demo transfer eraser', 'every-owner escape'])('%s erases every routine row for that owner and nothing of another owner', async how => {
  const local = await localDatabase();
  try {
    const leaving = repoFor(local.db, how === 'demo transfer eraser' ? 'demo' : OWNER_A), staying = repoFor(local.db, OWNER_B);
    seed(leaving); seed(staying);
    if (how === 'sign-out and account deletion') leaving.wipe();
    else if (how === 'demo transfer eraser') leaving.atomic(() => leaving.clearDemoForTransfer());
    else wipeAllOwners(local.db);
    for (const table of routineTables) {
      expect(local.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE owner_id=?`).get(leaving.owner)?.n).toBe(0);
      expect(staying.list(table).length > 0).toBe(how !== 'every-owner escape');
    }
    expect(leaving.unsyncedCount()).toBe(0);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM sync_outbox WHERE owner_id=?').get(leaving.owner)?.n).toBe(0);
  } finally { local.sqlite.close(); }
});

test('the phone-only and account backup files hold the routine rows of that owner only, and no other format changes', async () => {
  const local = await localDatabase();
  try {
    const guest = repoFor(local.db, 'guest'), account = repoFor(local.db, OWNER_A), other = repoFor(local.db, OWNER_B);
    seed(guest); seed(account); seed(other);
    guest.remove('daily_logs', FIXTURE_IDS.skip, 9000);
    for (const [json, owner] of [[createPhoneBackup(guest), 'guest'], [createAccountBackup(account), OWNER_A]] as const) {
      const backup = JSON.parse(json);
      expect(Object.keys(backup.rows)).toEqual(syncedTables);
      expect(Object.keys(backup.dailyRoutines)).toEqual([...routineTables]);
      const rows = Object.values(backup.dailyRoutines).flat() as Row[];
      expect(rows).toHaveLength(routineFixtureRows().length);
      expect(rows.every(row => row.owner_id === owner)).toBe(true);
      for (const sentinel of ROUTINE_SENTINELS) expect(json).toContain(sentinel);
    }
    const dead = (JSON.parse(createPhoneBackup(guest)).dailyRoutines.daily_logs as Row[]).filter(row => row.deleted_at !== null);
    expect(dead).toHaveLength(1);
    expect(Object.values(dead[0].data).every(value => value === null)).toBe(true);
    expect(() => createPhoneBackup(account)).toThrow();
    expect(() => createAccountBackup(repoFor(local.db, 'demo'))).toThrow();
  } finally { local.sqlite.close(); }
});

test('routines made while looking around move to the new account on the phone only, and the demo copy is erased', async () => {
  const local = await localDatabase();
  try {
    const demo = repoFor(local.db, 'demo'), account = repoFor(local.db, OWNER_A);
    demo.localSave('demoSamples', []);
    seed(demo);
    promoteDemo(demo, account);
    for (const table of routineTables) expect([table, demo.list(table, true)]).toEqual([table, []]);
    // The person's own routines arrive in the account's tables, and none of them is queued for the server.
    expect(account.list('daily_blocks').length).toBeGreaterThan(0);
    expect(account.list('daily_items').length).toBeGreaterThan(0);
    expect(account.unsyncedCount()).toBe(0);
    expect(account.pending().filter(item => item.row.table.startsWith('daily_'))).toEqual([]);
  } finally { local.sqlite.close(); }
});

test('the sample routines of looking around stay behind when an account is made', async () => {
  const local = await localDatabase();
  try {
    const demo = repoFor(local.db, 'demo'), account = repoFor(local.db, OWNER_A);
    demo.localSave('demoSamples', []);
    // Opening the tab writes the sample state; nothing of the person's own is added.
    createLocalRoutinesStore(demo).read();
    expect(demo.list('daily_items').length).toBeGreaterThan(0);
    promoteDemo(demo, account);
    for (const table of routineTables) {
      expect([table, demo.list(table, true)]).toEqual([table, []]);
      expect([table, account.list(table, true)]).toEqual([table, []]);
    }
    expect(account.phoneOnlyRoutineCount()).toBe(0);
  } finally { local.sqlite.close(); }
});

describe('date-range delete', () => {
  const marker = (from: string, to: string, cutoff: number, tz = 'America/Chicago'): Row => ({ table: 'purges', owner_id: OWNER_A, id: '60000000-0000-4000-8000-000000000001', updated_at: cutoff, deleted_at: null, device_id: DEVICE_A, data: { from_day: from, to_day: to, cutoff_ms: cutoff, tz } });
  const logRow = (n: number, data: Row['data']) => ({ id: `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`, data: { item_id: '71000000-0000-4000-8000-000000000001', status: 'done', amount: 250, unit: 'mcg', note: 'qq4419-scribble-text', site: 'left-belly', ...data } });
  // 2026-11-19 01:30 in Chicago (CST, UTC-6): stored on routine day 11-18 because the day rolls at 4.
  const earlyAt = Date.UTC(2026, 10, 19, 7, 30);
  const rows = [
    logRow(1, { day: '2026-11-18', at: Date.UTC(2026, 10, 18, 15, 0) }),
    logRow(2, { day: '2026-11-18', at: earlyAt }),
    logRow(3, { day: '2026-11-19', at: Date.UTC(2026, 10, 19, 15, 0) }),
    logRow(4, { day: '2026-11-20', at: Date.UTC(2026, 10, 20, 15, 0) }),
    logRow(5, { day: '2026-11-21', at: Date.UTC(2026, 10, 21, 15, 0) }),
    logRow(6, { day: '2026-11-18', at: null }),
    logRow(7, { day: '2026-11-19', at: Date.UTC(2026, 10, 19, 15, 0), undone: 1 }),
  ];
  async function purged(tz?: string) {
    const local = await localDatabase();
    const repo = repoFor(local.db, OWNER_A);
    for (const row of routineFixtureRows().filter(row => row.table !== 'daily_logs')) repo.save(row.table, row.data, row.id, 1000);
    for (const row of rows) repo.save('daily_logs', row.data, row.id, 1000);
    repo.applyPage('purges', [{ row: marker('2026-11-19', '2026-11-20', 50_000, tz), server_seq: '1' }], '1');
    return { ...local, repo };
  }
  const live = (repo: Repository) => repo.list('daily_logs').map(row => Number(row.id.slice(-1)));

  test('logs inside the days go, with the early-morning dose stored on the day before, and the plan stays', async () => {
    const { repo, sqlite } = await purged();
    try {
      expect(live(repo)).toEqual([1, 5, 6]);
      const dead = repo.list('daily_logs', true).filter(row => row.deleted_at !== null);
      expect(dead.map(row => Number(row.id.slice(-1)))).toEqual([2, 3, 4, 7]);
      for (const row of dead) expect(Object.values(row.data).every(value => value === null)).toBe(true);
      for (const table of routineTables.filter(table => table !== 'daily_logs')) {
        expect(repo.list(table).length).toBe(routineFixtureRows().filter(row => row.table === table).length);
      }
    } finally { sqlite.close(); }
  });

  test('a log written after the delete was made stays, and an older copy written back is deleted again', async () => {
    const { repo, sqlite } = await purged();
    try {
      const later = repo.save('daily_logs', rows[2].data, '70000000-0000-4000-8000-000000000008', 60_000);
      expect(repo.get('daily_logs', later.id)?.deleted_at).toBeNull();
      repo.putLocal({ table: 'daily_logs', owner_id: OWNER_A, device_id: DEVICE_A, id: '70000000-0000-4000-8000-000000000009', updated_at: 40_000, deleted_at: null, data: rows[2].data });
      const stale = repo.get('daily_logs', '70000000-0000-4000-8000-000000000009');
      expect(stale?.deleted_at).toBe(50_000);
      expect(stale?.data.amount).toBeNull();
      expect(stale?.data.note).toBeNull();
    } finally { sqlite.close(); }
  });

  test('the early window follows the zone the delete was made in', async () => {
    // In UTC the same moment is 07:30 on 11-19, still that calendar day, so it goes.
    const utc = await purged('UTC');
    try { expect(live(utc.repo)).toEqual([1, 5, 6]); } finally { utc.sqlite.close(); }
    // In Honolulu (UTC-10) it is 21:30 on 11-18: not the first deleted day, so the dose stays.
    const west = await purged('Pacific/Honolulu');
    try { expect(live(west.repo)).toEqual([1, 2, 5, 6]); } finally { west.sqlite.close(); }
  });

  test('another owner with the same rows is untouched', async () => {
    const { db, sqlite } = await purged();
    try {
      const other = repoFor(db, OWNER_B);
      for (const row of rows) other.save('daily_logs', row.data, row.id, 1000);
      other.save('daily_logs', rows[2].data, rows[2].id, 2000);
      expect(other.list('daily_logs')).toHaveLength(rows.length);
    } finally { sqlite.close(); }
  });
});
