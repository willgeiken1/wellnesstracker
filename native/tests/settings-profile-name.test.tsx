import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthContext, type AuthState } from '../src/auth/provider';
import Section from '../src/app/settings/[section]';
import { saveProfile, saveProfileName, readProfile } from '../src/features/onboarding/model';

/* Settings, Account and sync: renaming keeps the rest of the profile, including one saved by setup with no birth date. */
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { phoneOnly: false } } } }));
jest.mock('expo-router', () => {
  const Stack = function Stack({ children }: { children: React.ReactNode }) { return children; };
  Stack.Screen = function Screen() { return null; };
  return { Stack, router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ section: 'account' }) };
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
const profile = (repo: ReturnType<typeof memoryRepository>) => repo.list('profile')[0]?.data;

async function rename(repo: ReturnType<typeof memoryRepository>, name: string) {
  await render(<AuthContext.Provider value={auth(repo)}><ThemeProvider><Section /></ThemeProvider></AuthContext.Provider>);
  const field = screen.getByTestId('settings-name');
  await fireEvent.changeText(field, name);
  await fireEvent(field, 'blur');
}

test('a profile from setup with About you skipped can be renamed, and nothing else changes', async () => {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sam' });
  await rename(repo, '  Alex ');
  expect(profile(repo)).toEqual({ name: 'Alex' });
});

test('a profile with no birth date keeps its units and height when renamed', async () => {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sam', dob: null, weight_unit: 'kg', height_m: 1.8 });
  await rename(repo, 'Alex');
  expect(profile(repo)).toEqual({ name: 'Alex', dob: null, weight_unit: 'kg', height_m: 1.8 });
});

test('a full profile keeps its birth date, units and height when renamed', async () => {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sam', dob: '1990-01-01', weight_unit: 'lb', height_m: 1.7777 });
  await rename(repo, 'Alex');
  expect(profile(repo)).toEqual({ name: 'Alex', dob: '1990-01-01', weight_unit: 'lb', height_m: 1.7777 });
});

test('the name-only save never makes a profile, and the full About you save still needs a valid birth date', () => {
  const repo = memoryRepository();
  saveProfileName(repo, 'Alex');
  expect(repo.list('profile')).toHaveLength(0);
  repo.save('profile', { name: 'Sam' });
  expect(() => saveProfile(repo, { ...readProfile(repo), name: 'Alex' })).toThrow('Invalid profile.');
  expect(() => saveProfile(repo, { ...readProfile(repo), dob: '2020-01-01' }, '2026-11-27')).toThrow('Invalid profile.');
  expect(profile(repo)).toEqual({ name: 'Sam' });
});
