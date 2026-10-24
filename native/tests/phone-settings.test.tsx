import { render, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';
import Settings from '../src/app/settings/[section]';
import { ThemeProvider } from '../src/design/theme-provider';
let mockSection = 'health';
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { phoneOnly: true } } } }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { navigate: jest.fn() }, useLocalSearchParams: () => ({ section: mockSection }) }));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
test.each(['health', 'notifications'])('free build %s setting is calm without an auth/native provider', async section => {
  mockSection = section;
  await render(<ThemeProvider><Settings /></ThemeProvider>);
  expect(screen.getByText('Not in this build.')).toBeTruthy();
});
test('default settings remain available independently of an auth provider', async () => {
  Constants.expoConfig!.extra!.phoneOnly = false;
  mockSection = 'health';
  await render(<ThemeProvider><Settings /></ThemeProvider>);
  expect(screen.queryByText('Not in this build.')).toBeNull();
});
