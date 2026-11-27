import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ActionSheetIOS } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthContext, type AuthState } from '../src/auth/provider';
import Section from '../src/app/settings/[section]';

/* Settings, Account and sync: the sign-out confirmation says what goes with this phone's copy, and Sign out still signs out. */
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
function auth(): AuthState {
  // Everything synced: Sign out goes straight through, with no second question about lost changes.
  const repository = Object.assign(memoryRepository(), { unsyncedCount: () => 0 });
  return { session, demo: false, ready: true, configured: true, configError: null, repository, pending: 0, conflicts: 0,
    syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null), createAccount: jest.fn(async () => null),
    signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}), prepareSignOut: jest.fn(async () => {}) } as AuthState;
}

test('the sign-out question says routines on this iPhone are erased for good, and Sign out still signs out', async () => {
  const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
  const a = auth();
  await render(<AuthContext.Provider value={a}><ThemeProvider><Section /></ThemeProvider></AuthContext.Provider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(sheet).toHaveBeenCalledTimes(1);
  const [options, choose] = sheet.mock.calls[0];
  expect(options.title).toBe('Sign out of Insight?');
  expect(options.message).toContain('This iPhone’s copy is removed until you sign in again.');
  expect(options.message).toContain('Routines are kept only on this iPhone, so signing out erases them, and a backup can’t bring them back.');
  expect(options.options).toEqual(['Sign out', 'Cancel']);
  // Choosing Sign out syncs first and then signs out, as before.
  await act(async () => { choose(0); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  expect(a.prepareSignOut).toHaveBeenCalledTimes(1);
  expect(a.signOut).toHaveBeenCalledTimes(1);
  expect(sheet).toHaveBeenCalledTimes(1);
  sheet.mockRestore();
});
