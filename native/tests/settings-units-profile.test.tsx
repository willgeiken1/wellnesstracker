import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthContext, type AuthState } from '../src/auth/provider';
import Section from '../src/app/settings/[section]';
import { readProfile, saveProfileUnit } from '../src/features/onboarding/model';
import { WorkoutStore } from '../src/data/workout/store';
import { loadSettingsPrefs } from '../src/features/settings/prefs';
import { readWater, setWaterUnit } from '../src/features/food/water';

/* Settings, Units: the weight unit Progress, Body and Training read from the profile follows the Units choice. */
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { phoneOnly: false } } } }));
jest.mock('expo-router', () => {
  const Stack = function Stack({ children }: { children: React.ReactNode }) { return children; };
  Stack.Screen = function Screen() { return null; };
  return { Stack, router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ section: 'units' }) };
});
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));

const session = { user: { id: '10000000-0000-4000-8000-000000000001', email: 'fixture@example.test' } } as Session;
function auth(repository: ReturnType<typeof memoryRepository>): AuthState {
  return { session, demo: false, ready: true, configured: true, configError: null, repository: Object.assign(repository, { unsyncedCount: () => 0 }), pending: 0, conflicts: 0,
    syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null), createAccount: jest.fn(async () => null),
    signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}), prepareSignOut: jest.fn(async () => {}) } as AuthState;
}

test('choosing kg in Units changes the profile unit that Progress and new workout entries read', async () => {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sam', dob: '1990-01-01', weight_unit: 'lb', height_m: 1.8 });
  await render(<AuthContext.Provider value={auth(repo)}><ThemeProvider><Section /></ThemeProvider></AuthContext.Provider>);
  await fireEvent.press(screen.getByText('kg'));
  expect(loadSettingsPrefs(repo).units.weight).toBe('kg');
  expect(readProfile(repo).unit).toBe('kg');
  expect(new WorkoutStore(repo).unit()).toBe('kg');
  expect(repo.list('profile')[0].data).toEqual({ name: 'Sam', dob: '1990-01-01', weight_unit: 'kg', height_m: 1.8 });
  await fireEvent.press(screen.getByText('lb'));
  expect(readProfile(repo).unit).toBe('lb');
});

test('without a profile row the unit change writes no profile', () => {
  const repo = memoryRepository();
  saveProfileUnit(repo, 'kg');
  expect(repo.list('profile')).toHaveLength(0);
});

test('choosing mL in Units is the unit water is logged in, and the water sheet\'s choice shows in Units', async () => {
  const repo = memoryRepository();
  await render(<AuthContext.Provider value={auth(repo)}><ThemeProvider><Section /></ThemeProvider></AuthContext.Provider>);
  expect(readWater(repo).unit).toBe('oz');
  await fireEvent.press(screen.getByText('mL'));
  expect(readWater(repo).unit).toBe('ml');
  expect(loadSettingsPrefs(repo).units.water).toBe('ml');
  setWaterUnit(repo, 'oz');
  expect(loadSettingsPrefs(repo).units.water).toBe('floz');
  await fireEvent.press(screen.getByText('mL'));
  expect(readWater(repo).unit).toBe('ml');
});
