import { render, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';
import Settings from '../src/app/settings/[section]';
import { ThemeProvider } from '../src/design/theme-provider';
let mockSection = 'health';
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { phoneOnly: true } } } }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { navigate: jest.fn() }, useLocalSearchParams: () => ({ section: mockSection }) }));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
// The phone-only build keeps the Connections and Reminders layouts but offers nothing it cannot do (was a single
// "Not part of this version yet." card before the pages matched the design).
test('free build connections say Apple Health comes later and offer no reads, even without an auth/native provider', async () => {
  mockSection = 'health';
  await render(<ThemeProvider><Settings /></ThemeProvider>);
  expect(screen.getByText('Comes in a later version')).toBeTruthy();
  expect(screen.getByText(/^In a later version, Insight reads these from Health/)).toBeTruthy();
  expect(screen.queryByText('Read Apple Health now')).toBeNull();
  expect(screen.queryByText('Tell me')).toBeNull();
  expect(screen.queryByText('Not part of this version yet.')).toBeNull();
});
test('free build reminders are all off and cannot be switched on, even without an auth/native provider', async () => {
  mockSection = 'notifications';
  await render(<ThemeProvider><Settings /></ThemeProvider>);
  expect(screen.getByText('Reminders arrive with notifications in a later version. Nothing here is sent yet.')).toBeTruthy();
  const switches = screen.getAllByRole('switch');
  expect(switches.length).toBeGreaterThan(4);
  for (const s of switches) {
    expect(s.props.accessibilityState).toEqual(expect.objectContaining({ checked: false, disabled: true }));
  }
  expect(screen.queryByText('iOS notifications')).toBeNull();
});
test('default settings remain available independently of an auth provider', async () => {
  Constants.expoConfig!.extra!.phoneOnly = false;
  mockSection = 'health';
  await render(<ThemeProvider><Settings /></ThemeProvider>);
  expect(screen.queryByText('Comes in a later version')).toBeNull();
  expect(screen.getByText('Choose what Insight reads')).toBeTruthy();
});
