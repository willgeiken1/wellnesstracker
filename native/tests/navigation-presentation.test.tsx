// How every screen opens, checked against the design: tabs stay full screen, its pushed screens push (in from the right,
// back with the edge swipe), its sheets are native form sheets with a grabber that close with a swipe down. Large sheets
// use the system's large detent; medium sheets sit at the height measured from the design, as their only detent.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import type { NativeStackNavigationOptions } from 'expo-router';
import { NavigationShell } from '../src/app/_layout';
import SettingsLayout from '../src/app/settings/_layout';
import AuthLayout from '../src/app/auth/_layout';
import { ThemeProvider } from '../src/design/theme-provider';
import { LARGE_SHARE, copyDaySheet, detentOf, largeSheet, mediumSheet, routeOptions, tileEditSheet } from '../src/features/navigation/presentation';
import { tileSheetOptions } from '../src/features/tiles/nav';
import { trainingSheetOptions } from '../src/features/workout/nav';
import { sheetOptions as foodSheet } from '../src/features/food/sheet';
import { sheetOptions as routinesSheet } from '../src/features/routines/route-parts';
import { tilePage } from '../src/features/tiles/registry';
import '../src/features/workout/tiles';

jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: null }) }));
const mockScreens: { name: string; options?: unknown }[] = [];
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
  const Screen = (p: { name: string; options?: unknown }) => { mockScreens.push(p); return null; };
  const Stack = Object.assign(({ children }: { children?: unknown }) => children ?? null, { Screen, Protected: ({ children }: { children?: unknown }) => children ?? null });
  // The navigation theme needs a navigation container; this test only reads the screens each layout declares.
  return { ...actual, Stack, router, ThemeProvider: ({ children }: { children?: unknown }) => children ?? null };
});
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock };


type Want = 'push' | 'large' | number | 'fit';
/** The design's screens (id, type and detent from each INS.register), the app route that draws each, and how it opens.
 * A number is a medium sheet's measured height as a share of the 852 pt phone. */
const DESIGN: [string, string, Want, Record<string, unknown>?][] = [
  ['tile-tray', 'tiles/tray', 'large'], ['home-add-tile', 'tiles/tray', 'large', { page: 'home' }],
  ['tile-edit', 'tiles/edit', 0.252, { page: 'training' }], ['home-tile-edit', 'tiles/edit', 0.462, { page: 'home' }],
  ['page-section', 'tiles/section', 0.252], ['tab-bar', 'tab-bar', 'fit'],
  ['workout-active', 'workout', 'push'], ['workout-detail', 'training/detail', 'push'], ['exercise-detail', 'training/exercise', 'push'],
  ['plan', 'training/plan', 'push'], ['exercise-picker', 'training/picker', 'large'], ['rest-timer', 'training/rest', 0.684],
  ['cardio-log', 'training/cardio', 'large'],
  ['meal-detail', 'food/meal', 'push'], ['nutrition', 'food/nutrition', 'push'], ['log-meal', 'food/log', 'large'],
  ['food-item', 'food/item', 'large'], ['barcode', 'food/barcode', 'large'], ['quick-cal', 'food/quick', 0.679],
  ['saved-meals', 'food/saved', 'large'], ['copy-day', 'food/copy', 0.563], ['water', 'food/water', 'large'],
  ['water-containers', 'food/water-containers', 'large'],
  ['score', 'score', 'push'], ['trend', 'progress/trend', 'push'], ['weekly-report', 'progress/weekly', 'push'],
  ['sleep', 'progress/sleep', 'push'], ['body', 'progress/body', 'push'], ['photos', 'progress/photos', 'push'],
  ['log-weight', 'progress/log-weight', 0.651], ['photo-capture', 'progress/photo-capture', 'large'],
  ['measurements', 'progress/measurements', 'large'], ['export', 'progress/export', 'large'],
  ['routine-detail', 'routines/detail', 'push'], ['add-item', 'routines/add', 'large'], ['converter', 'routines/converter', 'large'],
  ['pause-routine', 'routines/pause', 'large'], ['routines-reorder', 'routines/reorder', 'push'],
  ['routine-history', 'routines/history', 'push'], ['new-routine', 'routines/new', 'large'],
  ['settings', 'settings', 'push'],
];
const SETTINGS_SHEETS: [string, string][] = [
  ['settings-delete-range', 'delete-range'], ['settings-whats-new', 'whats-new'], ['settings-feedback', 'feedback'],
];

const resolve = (o: unknown, params?: Record<string, unknown>) =>
  (typeof o === 'function' ? o({ route: { params } }) : o) as NativeStackNavigationOptions;
/** react-native-screens lays an iOS form sheet's content out with this style (ScreenStackItem's getPositioningStyle),
 * then the screen's contentStyle over it. Without a bottom edge, content that fills with flex: 1 gets no height, and the
 * sheet shows its header over a blank body: Continue with email, Log food and Saved meals on a release build. */
const IOS_SHEET_CONTENT = { position: 'absolute', top: 0, start: 0, end: 0 } as const;
function fillsSheet(o: NativeStackNavigationOptions) {
  const style = StyleSheet.flatten([IOS_SHEET_CONTENT, o.contentStyle]) as { top?: number; bottom?: number; height?: number };
  return style.top === 0 && style.bottom === 0 && style.height == null;
}
function expectOpens(o: NativeStackNavigationOptions, want: Want) {
  expect(o.gestureEnabled).not.toBe(false);
  if (want === 'push') {
    expect([undefined, 'card', 'push']).toContain(o.presentation);
    expect(o.sheetAllowedDetents).toBeUndefined();
    return;
  }
  expect(o.presentation).toBe('formSheet');
  expect(o.sheetGrabberVisible).toBe(true);
  expect(o.sheetCornerRadius).toBe(24);
  expect(fillsSheet(o)).toBe(want !== 'fit');
  if (want === 'large') expect(o.sheetAllowedDetents).toEqual([1]);
  else if (want === 'fit') expect(o.sheetAllowedDetents).toBe('fitToContents');
  else {
    // One detent, so the sheet can't be dragged to full height; a detent is a share of the large detent.
    const d = o.sheetAllowedDetents as number[];
    expect(d).toHaveLength(1);
    expect(d[0]).toBeCloseTo(want / LARGE_SHARE, 2);
    expect(o.sheetExpandsWhenScrolledToEdge).toBe(false);
  }
}

describe('the root stack opens each screen the way the design does', () => {
  let screens: Map<string, unknown>;
  beforeAll(async () => {
    mockScreens.length = 0;
    await render(<ThemeProvider><NavigationShell access /></ThemeProvider>);
    screens = new Map(mockScreens.map(s => [s.name, s.options]));
  });
  test.each(DESIGN.map(([id, route, want, params]) => ({ id, route, want, params })))('$id ($route) opens as $want', ({ route, want, params }) => {
    expect(screens.has(route)).toBe(true);
    expectOpens(resolve(screens.get(route), params), want);
  });
  test('every route named here exists as a route file', () => {
    const app = join(__dirname, '../src/app');
    for (const [, route] of DESIGN) expect(existsSync(join(app, `${route}.tsx`)) || existsSync(join(app, route, '_layout.tsx'))).toBe(true);
    for (const [, name] of SETTINGS_SHEETS) expect(existsSync(join(app, 'settings', `${name}.tsx`))).toBe(true);
  });
  test('the tabs stay full screen and nothing blocks the back or swipe-down gestures', () => {
    expect(resolve(screens.get('(tabs)')).presentation).toBeUndefined();
    for (const [, o] of screens) expect(resolve(o, { page: 'home' }).gestureEnabled).not.toBe(false);
  });
});

test.each(SETTINGS_SHEETS)('Settings opens %s as a large sheet over the page that opened it', async (_id, name) => {
  mockScreens.length = 0;
  await render(<ThemeProvider><SettingsLayout /></ThemeProvider>);
  const screen = mockScreens.find(s => s.name === name);
  expect(screen).toBeTruthy();
  expectOpens(resolve(screen!.options), 'large');
  // The rest of Settings pushes.
  expectOpens(resolve(mockScreens.find(s => s.name === '[section]')!.options), 'push');
});

test('Welcome\'s Continue with email and Skip for now open as medium sheets whose content fills them', async () => {
  mockScreens.length = 0;
  await render(<AuthLayout />);
  expectOpens(resolve(mockScreens.find(s => s.name === 'email')!.options), 0.501);
  expectOpens(resolve(mockScreens.find(s => s.name === 'skip')!.options), 0.485);
});

test('no screen replaces a sheet\'s content style, which would take its bottom edge away and blank it again', () => {
  // Each sheet route once set contentStyle: { flex: 1 } over the sheet options, which does nothing for content that is
  // positioned absolutely and dropped the fill. Only the layouts' screen defaults (a page colour) may set it.
  const files: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
  walk(join(__dirname, '../src'));
  const setters = files.filter(f => /contentStyle\s*:/.test(readFileSync(f, 'utf8'))).map(f => f.slice(f.indexOf('src/')));
  expect(setters.sort()).toEqual(['src/app/_layout.tsx', 'src/app/settings/_layout.tsx', 'src/features/navigation/presentation.ts']);
});

test('each area\'s own sheet options agree with the root stack, so a route never changes its height once open', () => {
  expect(tileSheetOptions.tray).toEqual(largeSheet);
  expect(tileSheetOptions.section).toEqual(mediumSheet('page-section'));
  expect(tileEditSheet('home')).toEqual(mediumSheet('home-tile-edit'));
  expect(tileEditSheet('food')).toEqual(mediumSheet('tile-edit'));
  expect(trainingSheetOptions).toEqual({ large: largeSheet, medium: mediumSheet('rest-timer') });
  expect(foodSheet('large').sheetAllowedDetents).toEqual([1]);
  expect(foodSheet('quick-cal').sheetAllowedDetents).toEqual(mediumSheet('quick-cal').sheetAllowedDetents);
  expect(foodSheet('copy-day').sheetAllowedDetents).toEqual(mediumSheet('copy-day').sheetAllowedDetents);
  expect(routinesSheet.sheetAllowedDetents).toEqual([1]);
  for (const o of [foodSheet('large'), foodSheet('quick-cal'), foodSheet('copy-day'), routinesSheet, copyDaySheet(5)]) expect(fillsSheet(o)).toBe(true);
});

// A tap on a tile opens what the design's tile opens (its LINK table and each page's tile `link`).
// One change from the design's table: Active energy opens its own trend, not eaten calories, since the two are different numbers.
test.each([
  ['home', 'week', '/progress/weekly'], ['home', 'protein', '/food/nutrition'], ['home', 'steps', '/progress/trend?metric=steps'],
  ['home', 'weight', '/progress/body'], ['home', 'bodyFat', '/progress/body'], ['home', 'sleep', '/progress/sleep'],
  ['home', 'hrv', '/progress/trend?metric=hrv'], ['home', 'rhr', '/progress/trend?metric=rhr'],
  ['home', 'exercise', '/progress/trend?metric=training'], ['home', 'active', '/progress/trend?metric=active'],
  ['home', 'score', '/score'], ['home', 'calories', '/food'], ['home', 'nextup', '/routines'], ['home', 'volume', '/workouts'],
  ['home', 'logMeal', '/food/log'],
  ['training', 'goal', '/progress/trend?metric=training'], ['training', 'muscles', '/progress/trend?metric=training'],
  ['training', 'streak', '/progress/trend?metric=training'], ['training', 'plan', '/training/plan'], ['training', 'cardio', '/training/cardio'],
] as const)('the %s %s tile opens %s', (page, id, href) => {
  mockRouter.push.mockClear();
  const def = tilePage(page).tiles.find(d => d.id === id);
  expect(def?.open).toBeTruthy();
  def!.open!({});
  expect(mockRouter.push).toHaveBeenCalledWith(href);
});

describe('Copy yesterday is as tall as its meals', () => {
  const share = (meals?: unknown) => (copyDaySheet(meals).sheetAllowedDetents as number[])[0];
  it('holds three meals at the design height', () => expect(share(3)).toBe(detentOf(0.563)));
  it('defaults to three meals when the count is missing', () => expect(share(undefined)).toBe(detentOf(0.563)));
  it('adds a row for a fourth meal', () => expect(share('4')).toBe(detentOf((0.563 * 852 + 69) / 852)));
  it('takes a row away for two meals', () => expect(share(2)).toBe(detentOf((0.563 * 852 - 69) / 852)));
  it('stops at 72 percent of the screen', () => expect(share(12)).toBe(detentOf(0.72)));
  it('never grows to full height', () => expect(copyDaySheet(4).sheetExpandsWhenScrolledToEdge).toBe(false));
  it('is sized from the meals the Food tab passes', () => {
    const o = resolve(routeOptions('food/copy'), { meals: '4' });
    expect(o.sheetAllowedDetents).toEqual([detentOf((0.563 * 852 + 69) / 852)]);
  });
});
