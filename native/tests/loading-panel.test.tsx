import { act, render, screen } from '@testing-library/react-native';
import Food from '../src/app/(tabs)/food';
import { ThemeProvider } from '../src/design/theme-provider';

// No account repository yet: the moment between opening the app and the data being ready.
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: null }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-13T12:00:00'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
afterEach(() => jest.useRealTimers());

test('Food waits quietly while the data opens: nothing for 0.3 s, then one loading panel and never "coming soon"', async () => {
  await render(<ThemeProvider><Food /></ThemeProvider>);
  expect(screen.queryByTestId('food-loading')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(screen.getByTestId('food-loading')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Opening your data…' })).toBeTruthy();
  expect(screen.queryByText(/coming soon|isn't built yet/i)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Log food' })).toBeNull();
});
