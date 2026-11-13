import { act, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { appleHealth } from '../src/features/health/apple';
import { useFocused } from '../src/features/home/use-focused';
import { addHealthTiles } from '../src/features/home/tiles';
import type { HealthAccess, HealthSource } from '../src/features/health/source';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: jest.fn() }));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: jest.fn(() => true) }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
// Made-up values only: 8,430 steps a day, and 7 h 12 min asleep each night.
const fake = (access: HealthAccess): HealthSource => ({
  access: async () => access, request: async () => {}, weights: async () => [],
  steps: jest.fn(async () => 8430),
  sleep: jest.fn(async (from: Date, to: Date) => {
    const spans = [];
    for (let day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1); day < to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
      spans.push({ start: new Date(day.getTime() - 3_600_000), end: new Date(day.getTime() - 3_600_000 + 432 * 60_000) });
    }
    return spans;
  }),
});
// A fixed afternoon: before 6 a.m. the real clock would cut last night's sleep short at "now".
beforeEach(() => { jest.useFakeTimers({ now: new Date(2026, 4, 12, 15, 0, 0), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }); });
afterEach(() => { jest.useRealTimers(); });
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
function open() {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  return repo;
}

test('once Apple Health is connected, Home shows steps and last night\'s sleep, and saves neither', async () => {
  const source = fake('asked');
  jest.mocked(appleHealth).mockReturnValue(source);
  const repo = open();
  addHealthTiles(repo);
  const save = jest.spyOn(repo, 'save'), local = jest.spyOn(repo, 'localSave');
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.getByRole('button', { name: 'Steps, 8,430 today' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sleep, 7 h 12 min' })).toBeTruthy();
  expect(source.steps).toHaveBeenCalledTimes(7);
  expect(save).not.toHaveBeenCalled();
  expect(JSON.stringify(local.mock.calls)).not.toMatch(/8430|8,430|7\.2|432/);
});

test('before connecting, Home reads nothing from Apple Health and shows no health tiles', async () => {
  const source = fake('ask');
  jest.mocked(appleHealth).mockReturnValue(source);
  addHealthTiles(open());
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.queryByTestId('home-tile-steps')).toBeNull();
  expect(screen.queryByTestId('home-tile-sleep')).toBeNull();
  expect(source.steps).not.toHaveBeenCalled();
  expect(source.sleep).not.toHaveBeenCalled();
});

test('with no Apple Health on the device Home is unchanged', async () => {
  jest.mocked(appleHealth).mockReturnValue(null);
  open();
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.queryByTestId('home-tile-steps')).toBeNull();
});

test('tiles added while Home is behind another screen show when Home comes back, and a later edit keeps them', async () => {
  const source = fake('asked');
  jest.mocked(appleHealth).mockReturnValue(source);
  const repo = open();
  jest.mocked(useFocused).mockReturnValue(true);
  const view = await render(<Home />, { wrapper });
  await settle();
  expect(screen.queryByTestId('home-tile-steps')).toBeNull();
  jest.mocked(useFocused).mockReturnValue(false);
  await view.rerender(<Home />);
  addHealthTiles(repo);
  jest.mocked(useFocused).mockReturnValue(true);
  await view.rerender(<Home />);
  await settle();
  expect(screen.getByTestId('home-tile-steps')).toBeTruthy();
  expect(screen.getByTestId('home-tile-sleep')).toBeTruthy();
});

test('reopening the app the next morning moves all of Home to the new day, not just the Health tiles', async () => {
  const { AppState } = require('react-native') as typeof import('react-native');
  const listeners: ((state: string) => void)[] = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => { listeners.push(fn); return { remove: () => {} }; }) as never);
  jest.useFakeTimers();
  try {
    jest.setSystemTime(new Date(2026, 10, 12, 23, 50));
    const source = fake('asked'), windows: Date[] = [];
    (source.steps as jest.Mock).mockImplementation(async (from: Date) => { windows.push(from); return 8430; });
    jest.mocked(appleHealth).mockReturnValue(source);
    jest.mocked(useFocused).mockReturnValue(true);
    addHealthTiles(open());
    await render(<Home />, { wrapper });
    await settle();
    expect(screen.getByText('Thursday, Nov 12')).toBeTruthy();
    const before = Math.max(...windows.map(Number));
    expect(new Date(before)).toEqual(new Date(2026, 10, 12));
    jest.setSystemTime(new Date(2026, 10, 13, 8, 0));
    await act(async () => { for (const fn of listeners) fn('active'); });
    await settle();
    expect(new Date(Math.max(...windows.map(Number)))).toEqual(new Date(2026, 10, 13));
    expect(screen.getByText('Friday, Nov 13')).toBeTruthy();
    expect(screen.queryByText('Thursday, Nov 12')).toBeNull();
  } finally { jest.useRealTimers(); spy.mockRestore(); }
});
