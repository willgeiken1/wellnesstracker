import { localDatabase } from './sqlite';
import { SyncEngine } from '../../src/data/sync/engine';
import { SyncAttention } from '../../src/data/sync/conflict';
import { OWNER_A, syntheticRow } from '../../fixtures/sync';

/* Review of #70: not every sync failure is being offline. One a reconnect won't fix says so. */
const transport = (push: () => Promise<never>, pull = async () => []) => ({ owner: OWNER_A, push: jest.fn(push), pull: jest.fn(pull) });

test('a lost connection reads as offline and a refusal that will repeat reads as needing attention; changes stay queued either way', async () => {
  const local = await localDatabase();
  try {
    local.repo.putLocal(syntheticRow());
    const offline = new SyncEngine(local.repo, transport(async () => { throw new Error('Sync unavailable.'); }));
    await offline.sync();
    expect(offline.status).toBe('offline'); offline.close();
    const refused = new SyncEngine(local.repo, transport(async () => { throw new SyncAttention(); }));
    await refused.sync();
    expect(refused.status).toBe('attention'); refused.close();
    expect(local.repo.pending()).toHaveLength(1);
  } finally { local.sqlite.close(); }
});

test('a page the server sent out of order needs attention, not a reconnect', async () => {
  const local = await localDatabase();
  try {
    const row = syntheticRow();
    const engine = new SyncEngine(local.repo, transport(async () => { throw new Error('unused'); }, async () => [{ row, server_seq: '5' }, { row, server_seq: '5' }] as never));
    await engine.sync();
    expect(engine.status).toBe('attention'); engine.close();
  } finally { local.sqlite.close(); }
});
