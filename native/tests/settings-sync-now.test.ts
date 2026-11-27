import { syncAndSay } from '../src/features/settings/pages';
import { syncedClean, syncLineKey } from '../src/data/sync-line';
import { showToast } from '../src/features/shell/toast';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

const base = { syncStatus: 'idle' as const, pending: 0, conflicts: 0 };
beforeEach(() => jest.clearAllMocks());

describe('Sync now says what happened', () => {
  test('only a finished sync with nothing waiting says it synced', async () => {
    await syncAndSay({ ...base, syncNow: async () => ({ status: 'idle', pending: 0, conflicts: 0 }) });
    expect(showToast).toHaveBeenCalledWith('Synced just now', { color: 'success' });
  });
  test('offline, needs attention or changes still waiting is said as such, never as synced', async () => {
    await syncAndSay({ ...base, syncNow: async () => ({ status: 'offline', pending: 3, conflicts: 0 }) });
    expect(showToast).toHaveBeenLastCalledWith('Offline · changes remain on this phone', { color: 'warning' });
    await syncAndSay({ ...base, syncNow: async () => ({ status: 'attention', pending: 3, conflicts: 0 }) });
    expect(showToast).toHaveBeenLastCalledWith("Sync isn't working · changes remain on this phone", { color: 'warning' });
    await syncAndSay({ ...base, syncNow: async () => ({ status: 'idle', pending: 2, conflicts: 0 }) });
    expect(showToast).toHaveBeenLastCalledWith('Changes waiting to sync', { color: 'warning' });
    await syncAndSay({ ...base, syncNow: async () => { throw new Error('fixture: network'); } });
    expect(showToast).toHaveBeenLastCalledWith("Sync isn't working · changes remain on this phone", { color: 'warning' });
  });
  test('the status line for the profile card', () => {
    expect(syncLineKey({ status: 'syncing', pending: 1, conflicts: 0 })).toBe('syncBusy');
    expect(syncLineKey({ status: 'idle', pending: 0, conflicts: 2 })).toBe('syncConflictStatus');
    expect(syncedClean({ status: 'idle', pending: 0, conflicts: 0 })).toBe(true);
    expect(syncedClean({ status: 'offline', pending: 0, conflicts: 0 })).toBe(false);
  });
});
