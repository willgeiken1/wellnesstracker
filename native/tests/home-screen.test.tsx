import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { attributedDay, meals, saveFood, setTargets } from '../src/features/food/model';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { dateLine, greeting } from '../src/features/home/hero';
import { MINI, terrain } from '../src/features/home/contour';
import { homeTileAction } from '../src/features/home/tiles/use-home-tiles';
import { pageHandlers, useShellEdit } from '../src/features/shell/registry';
import { showToast } from '../src/features/shell/toast';
import { tileEdit } from '../src/features/tiles/store';
import { resetTileStores } from '../src/features/tiles';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
jest.mock('../src/features/health/oura-client', () => ({ oura: () => null }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));
// A small stand-in for Reanimated: values settle at once, styles are computed once (as in tiles-ui).
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
    withDelay: (_d: number, v: unknown) => v, withRepeat: (v: unknown) => v, withSequence: (...v: unknown[]) => v[v.length - 1], withTiming: id,
  };
});
// Gestures are exercised on a device; here the detectors just draw their child.
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  const gesture = () => ({});
  return { GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: RN.View,
    usePanGesture: gesture, useTapGesture: gesture, useLongPressGesture: gesture };
});
// Skia draws the tile depth on a device; the tests only need the tile's contents.
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
function open(repo = memoryRepository()) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  return repo;
}
// Made-up sample data only.
const oats = { name: 'Sample oats', energy_kj: 418.4, protein_g: 37, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
let hours: jest.SpyInstance;
beforeEach(() => {
  jest.mocked(router.push).mockClear(); jest.mocked(showToast).mockClear();
  resetTileStores(); tileEdit.end();
  hours = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
});
afterEach(() => { hours.mockRestore(); jest.useRealTimers(); });

describe('contour engine', () => {
  test('draws nothing for an empty day and coloured lines per hill once there is progress', () => {
    expect(terrain([0, 0], 340, 170)).toEqual({ lines: [], markers: [] });
    const map = terrain([1, 0.6], 340, 170, { positions: [[0.31, 0.45], [0.69, 0.55]] });
    expect(new Set(map.lines.map(line => line.hill))).toEqual(new Set([0, 1]));
    expect(map.lines.every(line => /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+/.test(line.d) && !line.d.includes('NaN'))).toBe(true);
    expect(map.markers).toEqual([expect.objectContaining({ hill: 0, summit: true }), expect.objectContaining({ hill: 1, summit: false })]);
  });
  test('is deterministic, and mini maps carry fewer lines and no markers', () => {
    expect(terrain([0.8, 0.5], 340, 170)).toEqual(terrain([0.8, 0.5], 340, 170));
    const mini = terrain([1, 1], 40, 30, MINI);
    expect(mini.markers).toEqual([]);
    expect(mini.lines.length).toBeGreaterThan(0);
    expect(mini.lines.length).toBeLessThan(terrain([1, 1], 340, 170).lines.length);
  });
});


test('the hero slot carries the date and greeting, and the profile button opens Settings', async () => {
  expect([5, 11, 12, 17, 18, 23, 3].map(greeting)).toEqual(['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening', 'Good evening']);
  expect(dateLine(new Date(2026, 10, 22))).toBe('Sunday, November 22');
  open();
  await render(<Home />, { wrapper });
  expect(screen.getByRole('header', { name: 'Good morning' })).toBeTruthy();
  expect(screen.getByText(dateLine(new Date()))).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Profile and settings' }));
  expect(router.push).toHaveBeenCalledWith('/settings');
});

test('Home reads only: opening it writes nothing to the outbox or the tables', async () => {
  const repo = open(), before = repo.getRevision();
  await render(<Home />, { wrapper });
  await settle();
  expect(repo.getRevision()).toBe(before);
});

test('a new account gets the starting tiles, each saying what fills it, and no reading shown as 0', async () => {
  open();
  await render(<Home />, { wrapper });
  await settle();
  for (const title of ['Next', 'Protein', 'Water', 'Steps', 'Weight']) expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText('Set your food targets in Food, or start a workout.')).toBeTruthy();
  expect(screen.getByText('Set your food targets in Food to see this.')).toBeTruthy();
  expect(screen.getAllByText('Connect a health source in Settings to see this here.')).toHaveLength(2);
  expect(screen.getByText('Weigh in to see your trend.')).toBeTruthy();
  expect(screen.queryByText('0')).toBeNull();
});

test('logged food and targets fill the Protein and Next tiles from real entries', async () => {
  const repo = open(), day = attributedDay();
  setTargets(repo, day, { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 200, fat_g: 60 }, day);
  saveFood(repo, day, meals(repo)[0].id, oats, 1, undefined, day);
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.getAllByText('37').length).toBeGreaterThan(0);
  expect(screen.queryByText('Set your food targets in Food to see this.')).toBeNull();
  expect(screen.getByText('Log lunch')).toBeTruthy();
});

describe('the + actions and edit mode', () => {
  test('Home gives the shell its six actions', async () => {
    open();
    await render(<Home />, { wrapper });
    const h = pageHandlers('home');
    expect(Object.keys(h).sort()).toEqual(['add', 'edit', 'meal', 'start', 'water', 'weigh']);
    await act(async () => { h.add?.run?.(); });
    expect(router.push).toHaveBeenLastCalledWith('/tiles/tray?page=home');
    await act(async () => { h.meal?.run?.(); });
    expect(router.push).toHaveBeenLastCalledWith('/food/log');
    await act(async () => { h.start?.run?.(); });
    expect(router.push).toHaveBeenLastCalledWith('/workout');
    await act(async () => { h.weigh?.run?.(); });
    expect(router.push).toHaveBeenLastCalledWith('/progress');
    await act(async () => { h.water?.run?.(); });
    expect(showToast).toHaveBeenLastCalledWith('Water comes from your health app for now', { color: 'water' });
  });
  test('Edit tiles turns on edit mode, the shell\'s Done ends it', async () => {
    open();
    let shell: ReturnType<typeof useShellEdit> = null;
    const Probe = () => { shell = useShellEdit(); return null; };
    await render(<><Home /><Probe /></>, { wrapper });
    await act(async () => { pageHandlers('home').edit?.run?.(); });
    expect(tileEdit.get().page).toBe('home');
    expect(shell!.page).toBe('home');
    await act(async () => { shell!.onDone(); });
    expect(tileEdit.get().page).toBeNull();
    expect(shell).toBeNull();
  });
});

describe('logging from inside a tile', () => {
  test('a recent food goes into the meal due next, with Undo', () => {
    const repo = memoryRepository(), day = attributedDay(), [breakfast, lunch] = meals(repo);
    saveFood(repo, day, breakfast.id, oats, 1, undefined, day);
    homeTileAction(repo, { id: lunch.id, name: lunch.name }, { ql: 'food', food: 'Sample oats' });
    const lunchRows = () => repo.list('food_entries').filter(r => r.data.meal_id === lunch.id);
    expect(lunchRows()).toHaveLength(1);
    const [text, options] = jest.mocked(showToast).mock.calls.at(-1)!;
    expect(text).toBe(`Added Sample oats to ${lunch.name.toLowerCase()}`);
    options?.action?.onAction();
    expect(lunchRows()).toHaveLength(0);
  });
  test('a food that is no longer in recent foods is not invented', () => {
    const repo = memoryRepository();
    homeTileAction(repo, { id: meals(repo)[0].id, name: 'Breakfast' }, { ql: 'food', food: 'Nothing like it' });
    expect(repo.list('food_entries')).toHaveLength(0);
    expect(showToast).toHaveBeenLastCalledWith('That food could not be added. Try again.', { color: 'warning' });
  });
  test('a meal slot opens the food log', () => {
    homeTileAction(memoryRepository(), { id: 'x', name: 'Dinner' }, { ql: 'meal', meal: 'x' });
    expect(router.push).toHaveBeenLastCalledWith('/food/log');
  });
});
