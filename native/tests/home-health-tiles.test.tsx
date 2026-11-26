import { act, render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { appleHealth } from '../src/features/health/apple';
import { useFocused } from '../src/features/home/use-focused';
import { addHealthTiles } from '../src/features/home/tiles';
import { resetTileStores } from '../src/features/tiles';
import type { HealthAccess, HealthSource } from '../src/features/health/source';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: jest.fn() }));
jest.mock('../src/features/health/oura-client', () => ({ oura: () => null }));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: jest.fn(() => true) }));
// A small stand-in for Reanimated, gestures and Skia, as in tiles-ui: the tiles' contents are what is checked here.
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const React = require('react');
  const id = (v: unknown) => v;
  const ease = Object.assign(() => 0, { bezier: () => id, inOut: () => id, ease: id, linear: id, out: () => id });
  return {
    __esModule: true,
    default: { View: RN.View, ScrollView: RN.ScrollView, Text: RN.Text, createAnimatedComponent: id },
    Easing: ease,
    cancelAnimation: () => {}, interpolate: (_v: number, _i: number[], o: number[]) => o[o.length - 1],
    measure: () => null, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f, scrollTo: () => {},
    useAnimatedRef: () => React.useRef(null), useAnimatedStyle: (f: () => unknown) => f(),
    useFrameCallback: () => ({ setActive: () => {}, isActive: false, callbackId: 0 }),
    useScrollOffset: () => ({ value: 0 }), useSharedValue: (v: unknown) => React.useRef({ value: v }).current,
    withDelay: (_d: number, v: unknown) => v, withRepeat: (v: unknown) => v, withSequence: (...v: unknown[]) => v[v.length - 1], withTiming: id, withSpring: id, useAnimatedProps: (f: () => unknown) => f(),
  };
});
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  const gesture = () => ({});
  return { GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: RN.View,
    usePanGesture: gesture, useTapGesture: gesture, useLongPressGesture: gesture };
});
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
// Made-up values only: 8,430 steps a day, and 7 h 12 min asleep each night.
const fake = (access: HealthAccess): HealthSource => ({
  access: async () => access, request: async () => {}, weights: async () => [],
  steps: jest.fn(async () => 8430), activeEnergy: jest.fn(async () => 512), exerciseMinutes: jest.fn(async () => 34), heart: jest.fn(async () => null), vo2Max: jest.fn(async () => null), water: jest.fn(async () => 1800), mindful: jest.fn(async (from: Date) => [{ start: new Date(from.getTime() + 8 * 3_600_000), end: new Date(from.getTime() + 8 * 3_600_000 + 10 * 60_000) }]), bodyFat: jest.fn(async () => [{ at: new Date(2026, 4, 10, 7), percent: 21.44 }]), workouts: jest.fn(async () => []),
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
beforeEach(() => { resetTileStores(); });
/** A Home tile by the engine's label: "<title>. <what a tap does>". */
const tile = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}\\. `) });

test('once Apple Health is connected, Home draws today\'s steps and saves no health value', async () => {
  const source = fake('asked');
  jest.mocked(appleHealth).mockReturnValue(source);
  const repo = open();
  addHealthTiles(repo);
  const save = jest.spyOn(repo, 'save'), local = jest.spyOn(repo, 'localSave');
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Steps')).getAllByText('8,430').length).toBeGreaterThan(0);
  // Health tiles join Home as tile ids only.
  for (const title of ['Sleep', 'Active energy', 'Exercise', 'Body fat', 'Mindful minutes']) expect(tile(title)).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  expect(JSON.stringify(local.mock.calls)).not.toMatch(/8430|8,430|7\.2|432|512|1800|21\.4/);
});

test('a night with no sleep recorded reads as none recorded, not as 0 hours', async () => {
  // Earlier nights were recorded; last night was not.
  const base = fake('asked'), lastNight = new Date(2026, 4, 12);
  const source = { ...base, sleep: jest.fn(async (from: Date, to: Date) => (await base.sleep(from, to)).filter(span => span.end < new Date(lastNight.getTime() - 3_600_000))) };
  jest.mocked(appleHealth).mockReturnValue(source);
  addHealthTiles(open());
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Sleep')).getByText('Nothing recorded for last night.')).toBeTruthy();
  expect(within(tile('Sleep')).queryByText(/^0/)).toBeNull();
});

test('a night recorded without stages says so, rather than drawing stages it does not have', async () => {
  jest.mocked(appleHealth).mockReturnValue(fake('asked'));
  addHealthTiles(open());
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Sleep')).getByText('Last night was recorded without sleep stages, so there is nothing to draw here.')).toBeTruthy();
});

test('a day with no steps recorded today reads as none recorded, not as 0 steps (review of #176, #181)', async () => {
  const base = fake('asked'), today = new Date(2026, 4, 12);
  const source = { ...base, steps: jest.fn(async (from: Date, to: Date) => from >= today ? null : base.steps(from, to)) };
  jest.mocked(appleHealth).mockReturnValue(source);
  addHealthTiles(open());
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Steps')).getByText('Nothing recorded yet today.')).toBeTruthy();
  expect(within(tile('Steps')).queryByText(/^0/)).toBeNull();
});

test('before connecting, Home reads nothing from Apple Health and its health tiles say how to fill them', async () => {
  const source = fake('ask');
  jest.mocked(appleHealth).mockReturnValue(source);
  open();
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Steps')).getByText('Connect a health source in Settings to see this here.')).toBeTruthy();
  expect(source.steps).not.toHaveBeenCalled();
  expect(source.sleep).not.toHaveBeenCalled();
  expect(source.activeEnergy).not.toHaveBeenCalled();
  expect(source.exerciseMinutes).not.toHaveBeenCalled();
  expect(source.bodyFat).not.toHaveBeenCalled();
});

test('with no Apple Health on the device the health tiles say how to fill them', async () => {
  jest.mocked(appleHealth).mockReturnValue(null);
  open();
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Steps')).getByText('Connect a health source in Settings to see this here.')).toBeTruthy();
  // Water is logged in the app, so it never waits for a health source.
  expect(within(tile('Water')).queryByText('Connect a health source in Settings to see this here.')).toBeNull();
});

test('tiles added while Home is behind another screen show when Home comes back', async () => {
  const source = fake('asked');
  jest.mocked(appleHealth).mockReturnValue(source);
  const repo = open();
  jest.mocked(useFocused).mockReturnValue(true);
  const view = await render(<Home />, { wrapper });
  await settle();
  expect(screen.queryByRole('button', { name: /^Sleep\. / })).toBeNull();
  jest.mocked(useFocused).mockReturnValue(false);
  await view.rerender(<Home />);
  addHealthTiles(repo);
  jest.mocked(useFocused).mockReturnValue(true);
  await view.rerender(<Home />);
  await settle();
  expect(tile('Sleep')).toBeTruthy();
  expect(tile('Mindful minutes')).toBeTruthy();
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
    expect(screen.getByText('Thursday, November 12')).toBeTruthy();
    expect(new Date(Math.max(...windows.map(Number))).getDate()).toBe(12);
    jest.setSystemTime(new Date(2026, 10, 13, 8, 0));
    await act(async () => { for (const fn of listeners) fn('active'); });
    await settle();
    expect(new Date(Math.max(...windows.map(Number))).getDate()).toBe(13);
    expect(screen.getByText('Friday, November 13')).toBeTruthy();
    expect(screen.queryByText('Thursday, November 12')).toBeNull();
  } finally { jest.useRealTimers(); spy.mockRestore(); }
});

test('body fat shows the newest reading in the last 30 days', async () => {
  const source = fake('asked');
  (source.bodyFat as jest.Mock).mockResolvedValue([{ at: new Date(2026, 4, 1, 7), percent: 20.6 }, { at: new Date(2026, 4, 12, 7), percent: 20.04 }]);
  jest.mocked(appleHealth).mockReturnValue(source);
  addHealthTiles(open());
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Body fat')).getAllByText(/^20(\.0)?$/).length).toBeGreaterThan(0);
});

test('a body-fat reading older than 30 days is not shown as today\'s', async () => {
  const source = fake('asked');
  (source.bodyFat as jest.Mock).mockResolvedValue([{ at: new Date(2025, 11, 30, 7), percent: 23.5 }]);
  jest.mocked(appleHealth).mockReturnValue(source);
  addHealthTiles(open());
  await render(<Home />, { wrapper });
  await settle();
  expect(within(tile('Body fat')).getByText('No body fat reading in the last 30 days.')).toBeTruthy();
});
