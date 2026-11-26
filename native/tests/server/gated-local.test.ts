import { Repository } from '../../src/data/repository';
import { SyncEngine } from '../../src/data/sync/engine';
import { gatedColumns, hasGatedColumns, syncTables } from '../../src/data/sync/flags';
import { OWNER_A, DEVICE_A, syntheticRow } from '../../fixtures/sync';
import { syncedV1Examples as examples } from '../../fixtures/synced-v1';
import { localDatabase } from './sqlite';
import { serverDatabase, testTransport } from './pglite';

// Every table with gated columns that an OFF (default) device syncs: food fiber, sugar and sodium,
// set tags, rep ranges, superset groups, machine notes and rest settings.
const gated = examples.filter(([table]) => hasGatedColumns(table) && syncTables().includes(table));
const values: Record<string, Record<string, string | number>> = {
  sets: { tag: 'warmup' }, routine_exercises: { rep_min: 6, rep_max: 10, superset_group: 'fixture' }, entries: { superset_group: 'fixture' },
  machine_notes: { step: 5, bar_weight: 20, unit_override: 'kg' },
  settings: { plate_set: '[20,10,5]', rest_per_exercise: '{"Fixture lift":90}', rest_style: 'countdown' },
  food_entries: { fiber_g: 3, sugar_g: 4, sodium_mg: 20 }, saved_foods: { fiber_g: 1, sugar_g: 0, sodium_mg: 5 },
};
const filled = (table: string) => values[table];

test('the default flag is still off', () => {
  const local = new Repository({} as never, OWNER_A, DEVICE_A, () => syntheticRow().id);
  expect(local.syncFlags.syncedV1Columns).toBe(false);
});

test.each(gated)('%s OFF local saves keep gated columns on the phone and drop them from sync payloads', async table => {
  const local = await localDatabase();
  try {
    const data = filled(table);
    expect(Object.keys(data).sort()).toEqual([...gatedColumns(table)].sort());
    const saved = local.repo.save(table, data);
    expect(local.repo.get(table, saved.id)?.data).toMatchObject(data);
    // A later edit of the same row keeps them too.
    local.repo.save(table, { ...local.repo.get(table, saved.id)!.data }, saved.id, saved.updated_at + 10);
    expect(local.repo.get(table, saved.id)?.data).toMatchObject(data);
    // They survive a restart of the repository.
    const restarted = new Repository(local.db, OWNER_A, DEVICE_A, () => syntheticRow().id);
    expect(restarted.get(table, saved.id)?.data).toMatchObject(data);
    const [pending] = restarted.pending();
    expect(pending.row.id).toBe(saved.id);
    for (const key of gatedColumns(table)) expect(pending.row.data).not.toHaveProperty(key);
    // A delete still wipes them.
    restarted.remove(table, saved.id, saved.updated_at + 20);
    for (const key of gatedColumns(table)) expect(restarted.get(table, saved.id)?.data[key]).toBeNull();
  } finally { local.sqlite.close(); }
});

test('OFF food entry keeps fiber, sugar and sodium through a full sync, and the server never receives them', async () => {
  const server = await serverDatabase(), local = await localDatabase();
  const transport = testTransport(server, OWNER_A);
  const push = jest.fn(transport.push), engine = new SyncEngine(local.repo, { ...transport, push });
  try {
    const saved = local.repo.save('food_entries', { name: 'Fixture oats', day: '2026-10-01', energy_kj: 1000, fiber_g: 8, sugar_g: 2, sodium_mg: 140 });
    await engine.sync();
    expect(engine.status).toBe('idle');
    expect(push).toHaveBeenCalledTimes(1);
    const sent = push.mock.calls[0][0][0];
    for (const key of ['fiber_g', 'sugar_g', 'sodium_mg']) expect(sent.data).not.toHaveProperty(key);
    expect(local.repo.get('food_entries', saved.id)?.data).toMatchObject({ fiber_g: 8, sugar_g: 2, sodium_mg: 140 });
    expect(local.repo.pending()).toEqual([]);
    const enabled = testTransport(server, OWNER_A, { syncedV1Columns: true });
    const [remote] = await enabled.pull('food_entries', '0', 100);
    expect(remote.row.data).toMatchObject({ name: 'Fixture oats', fiber_g: null, sugar_g: null, sodium_mg: null });
  } finally { engine.close(); local.sqlite.close(); await server.close(); }
});
