import { renderHook } from '@testing-library/react-native';
import { useAuth } from '../src/auth/provider';
import { WorkoutStore } from '../src/data/workout/store';
import { buildProgress } from '../src/features/progress/source';
import { useDataActions } from '../src/features/settings/data-actions';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs';
import { exportAccountBackup, exportPhoneBackup } from '../src/phone-only/export';
import { memoryRepository } from './workout-repository';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/phone-only/export', () => ({ exportPhoneBackup: jest.fn(() => Promise.resolve()), exportAccountBackup: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn(), useOptionalAuth: jest.fn() }));

const NOW = new Date(2026, 10, 11, 12);
beforeEach(() => { jest.mocked(exportPhoneBackup).mockClear(); jest.mocked(exportAccountBackup).mockClear(); });

async function backupAs(owner: string, phoneOnly = false) {
  const repo = Object.assign(memoryRepository(), { owner });
  jest.mocked(useAuth).mockReturnValue({ repository: repo, demo: false, phoneOnly } as unknown as ReturnType<typeof useAuth>);
  (await renderHook(() => useDataActions())).result.current.backup!();
}

test('a guest in the account build backs up with the phone backup, which takes guest data', async () => {
  await backupAs('guest');
  expect(exportPhoneBackup).toHaveBeenCalledTimes(1);
  expect(exportAccountBackup).not.toHaveBeenCalled();
});

test('a signed-in account still takes the account backup, and the phone-only build the phone backup', async () => {
  await backupAs('user-1');
  expect(exportAccountBackup).toHaveBeenCalledTimes(1);
  await backupAs('guest', true);
  expect(exportPhoneBackup).toHaveBeenCalledTimes(1);
});

test('Progress measures sleep against the goal chosen in Settings, or eight hours', () => {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
  const build = (sleepGoalMin?: number) => buildProgress({ store: new WorkoutStore(repo), now: NOW, demo: false, health: null, recovery: null, ring: null, sleepGoalMin });
  expect(build().sleepGoalMin).toBe(480);
  repo.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'goals.sleep', 450));
  expect(build().sleepGoalMin).toBe(450);
  expect(build(420).sleepGoalMin).toBe(420);
});
