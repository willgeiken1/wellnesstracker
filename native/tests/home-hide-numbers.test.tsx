import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { attributedDay, meals, saveFood, setTargets } from '../src/features/food/model';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { SETTINGS_PREFS_KEY } from '../src/features/settings/prefs';
import { coverNumbers, numbersHidden } from '../src/features/home/hide-numbers';
import { tileEdit } from '../src/features/tiles/store';
import { resetTileStores } from '../src/features/tiles';
import { useFocused } from '../src/features/home/use-focused';

jest.mock('../src/features/home/use-focused', () => ({ useFocused: jest.fn(() => true) }));
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light' } }));
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
    withDelay: (_d: number, v: unknown) => v, withRepeat: (v: unknown) => v, withSequence: (...v: unknown[]) => v[v.length - 1], withTiming: id, withSpring: id, useAnimatedProps: (f: () => unknown) => f(),
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


/* Hide numbers (Settings, Privacy and security): "Dots instead of weight and calories until you tap". Made-up sample data only. */
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const oats = { name: 'Sample oats', energy_kj: 1364 * 4.184, protein_g: 37, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
function open(hide: boolean) {
  const repo = memoryRepository(), day = attributedDay();
  repo.save('profile', { name: 'Sample Person', dob: '1990-01-01', weight_unit: 'kg', height_m: 1.7 });
  for (let i = 0; i < 5; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    repo.save('weigh_ins', { day: key, weight_kg: 81.4 + i * 0.1, entered_value: 81.4 + i * 0.1, entered_unit: 'kg', source: 'app' });
  }
  setTargets(repo, day, { energy_kj: 2200 * 4.184, protein_g: 150, carbs_g: 200, fat_g: 60 }, day);
  saveFood(repo, day, meals(repo)[0].id, oats, 1, undefined, day);
  repo.localSave(SETTINGS_PREFS_KEY, { priv: { hide } });
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  return repo;
}
let hours: jest.SpyInstance;
beforeEach(() => { resetTileStores(); tileEdit.end(); coverNumbers(); jest.mocked(useFocused).mockReturnValue(true); hours = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10); });
afterEach(() => { hours.mockRestore(); });

const weightShown = () => screen.queryAllByText(/81[.,]4/).length > 0;
const foodArc = () => screen.getByTestId('home-hero-arc-food');

test('with Hide numbers off, Home shows the weight and the food energy', async () => {
  open(false);
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.getByRole('button', { name: 'Weight. Open body' })).toBeTruthy();
  expect(weightShown()).toBe(true);
  expect(screen.queryByTestId('home-numbers-cover', { includeHiddenElements: true })).toBeNull();
  expect(foodArc().props.accessibilityLabel).toContain('1,364 of 2,200 kcal');
});

test('with Hide numbers on, the weight tile and the hero\'s food energy are dots, and VoiceOver says they are hidden', async () => {
  open(true);
  await render(<Home />, { wrapper });
  await settle();
  expect(numbersHidden()).toBe(true);
  expect(screen.getByRole('button', { name: 'Weight hidden. Show numbers' })).toBeTruthy();
  // Next shows the day's food energy, so it is covered too; tiles without weight or energy are not.
  expect(screen.getByRole('button', { name: 'Next hidden. Show numbers' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Protein. Open nutrition' })).toBeTruthy();
  expect(screen.getAllByTestId('home-numbers-cover', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  // The figures under the cover are out of reach of VoiceOver and the screen.
  expect(weightShown()).toBe(false);
  expect(foodArc().props.accessibilityLabel).toContain('hidden, of 2,200 kcal');
  expect(foodArc().props.accessibilityLabel).not.toContain('1,364');
  expect(screen.queryByText('1,364')).toBeNull();
  expect(screen.getAllByText('•••', { includeHiddenElements: true }).length).toBeGreaterThan(0);
});

test('a tap on a covered tile shows Home\'s numbers instead of opening it; leaving Home covers them again', async () => {
  open(true);
  const view = await render(<Home />, { wrapper });
  await settle();
  jest.mocked(router.push).mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'Weight hidden. Show numbers' }));
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Weight. Open body' })).toBeTruthy();
  expect(weightShown()).toBe(true);
  expect(foodArc().props.accessibilityLabel).toContain('1,364 of 2,200 kcal');
  // The next tap opens the tile as usual.
  await fireEvent.press(screen.getByRole('button', { name: 'Weight. Open body' }));
  expect(router.push).toHaveBeenCalledWith('/progress/body');
  jest.mocked(useFocused).mockReturnValue(false);
  await view.rerender(<Home />);
  await settle();
  expect(numbersHidden()).toBe(true);
  expect(screen.getByRole('button', { name: 'Weight hidden. Show numbers' })).toBeTruthy();
});

test('a tap on the hero\'s hidden food energy shows the numbers too', async () => {
  open(true);
  await render(<Home />, { wrapper });
  await settle();
  await fireEvent.press(foodArc());
  expect(numbersHidden()).toBe(false);
  expect(foodArc().props.accessibilityLabel).toContain('1,364 of 2,200 kcal');
  expect(weightShown()).toBe(true);
});

/* The profile button stays at the top right while Home scrolls (Will, Nov 28): it sits over the page, not in it. */
test('the profile button is pinned over the page, outside the scroll, and opens Settings', async () => {
  open(false);
  await render(<Home />, { wrapper });
  await settle();
  const button = screen.getByTestId('profile-button'), scroll = screen.getByTestId('home-scroll'), pin = screen.getByTestId('profile-pin');
  let inScroll = false;
  for (let n = button.parent; n; n = n.parent) if (n === scroll) inScroll = true;
  expect(inScroll).toBe(false);
  expect(pin.props.style).toMatchObject({ position: 'absolute', right: 16 });
  expect(pin.props.style.top).toBeGreaterThanOrEqual(47);
  await fireEvent.press(button);
  expect(router.push).toHaveBeenCalledWith('/settings');
});

/* In edit mode the edit bar sticks to the top with Done at its right, where the pinned profile button sat over it (Will, Nov 28). */
test('while Home is editing the profile button steps away, so Done is never under it', async () => {
  open(false);
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.getByTestId('profile-pin').props.pointerEvents).toBe('box-none');
  await act(async () => { tileEdit.set('home', true); });
  const pin = screen.getByTestId('profile-pin', { includeHiddenElements: true });
  expect(pin.props.pointerEvents).toBe('none');
  expect(pin.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(screen.queryByTestId('profile-button')).toBeNull();
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  await act(async () => { tileEdit.end(); });
  expect(screen.getByTestId('profile-pin').props.pointerEvents).toBe('box-none');
});
