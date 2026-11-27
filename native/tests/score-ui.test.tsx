import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { saveFood, meals } from '../src/features/food/model';
import { localDay } from '../src/core/workout/rules';
import { useAuth, AuthContext } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import SettingsSection from '../src/app/settings/[section]';
import { ScoreDetail } from '../src/features/score/detail';
import { readScore } from '../src/features/score/read';
import { weekScores } from '../src/features/score/days';
import { SCORE_WEIGHTS_KEY } from '../src/features/score/model';
import { appleHealth } from '../src/features/health/apple';
import { HOME_TILES_KEY, homeLayout, scoreOn, setScoreOn } from '../src/features/home/tiles';
import { homeTileState } from '../src/features/home/tiles/state';
import { tileStoreFor } from '../src/features/tiles/store';
import { resetTileStores } from '../src/features/tiles';
import { t } from '../src/i18n/en';
import type { HealthSource } from '../src/features/health/source';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn(), AuthContext: jest.requireActual('react').createContext(null) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() }, Stack: { Screen: () => null }, useLocalSearchParams: jest.fn(() => ({ section: 'score' })) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: jest.fn() }));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: jest.fn(() => true) }));
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

jest.mock('../src/features/food/ai/privacy', () => ({ FoodPrivacyScreen: () => null, FoodAiPrivacy: () => null }));
jest.mock('../src/features/importer/screen', () => ({ ImportScreen: () => null }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
// A fixed afternoon, so "the last 7 days" and last night's sleep do not depend on when the tests run.
const NOW = new Date(2026, 4, 12, 15, 0, 0);
beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  jest.mocked(router.push).mockClear();
  jest.mocked(appleHealth).mockReturnValue(null);
  resetTileStores();
});
afterEach(() => { jest.useRealTimers(); });

// Made-up sample data only.
const oats = { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const dayAgo = (n: number) => localDay(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
function open(repo = memoryRepository(), score = true) {
  if (score) setScoreOn(repo, true);
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  return repo;
}
function logFood(repo: ReturnType<typeof memoryRepository>, daysAgo: number[]) {
  for (const n of daysAgo) saveFood(repo, dayAgo(n), meals(repo)[0].id, oats, 1, undefined, dayAgo(0));
}
function workout(repo: ReturnType<typeof memoryRepository>) {
  const store = new WorkoutStore(repo), start = NOW.getTime() - 600000, session = store.start(undefined, start), entry = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' }); store.toggleDone(entry.id, 0);
  store.finish(session.id, { startedAt: start, finishedAt: NOW.getTime() - 60000, notes: '' });
}
// Made-up Health numbers: 6,000 steps a day and 5 h 30 min asleep each night.
const health = (): HealthSource => ({
  access: async () => 'asked', request: async () => {}, weights: async () => [],
  steps: jest.fn(async () => 6000), activeEnergy: async () => 0, exerciseMinutes: async () => 0, heart: async () => null, vo2Max: async () => null, water: async () => 0, mindful: async () => [], bodyFat: async () => [], workouts: async () => [],
  sleep: jest.fn(async (from: Date, to: Date) => {
    const spans = [];
    for (let day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1); day < to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
      spans.push({ start: new Date(day.getTime() - 3_600_000), end: new Date(day.getTime() - 3_600_000 + 330 * 60_000) });
    }
    return spans;
  }),
});

// Home's Score is a tile: it starts once a week is logged, shows the score after that, and opens how it is worked out.
const scoreTile = () => screen.getByRole('button', { name: /^Insight Score\. / });
test('a new account with the Score on sees the tile say when it starts, and it opens how it is worked out', async () => {
  open();
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.getByText(t('homeEmptyScore'))).toBeTruthy();
  expect(homeTileState()?.ready.score).toBe(false);
  await fireEvent.press(scoreTile());
  expect(jest.mocked(router.push).mock.calls).toEqual([['/score']]);
});

test('the Score tile shows the same day score as the hero and the score screen, from the first day logged', async () => {
  const repo = open();
  const view = await render(<Home />, { wrapper });
  await settle();
  // Nothing logged yet: no score to show.
  expect(screen.getByText(t('homeEmptyScore'))).toBeTruthy();
  workout(repo);
  await view.unmount();
  await render(<Home />, { wrapper });
  await settle();
  // Today's finished workout is a day score at once (the score screen's own number), not a wait for a week of logs.
  const today = weekScores(new WorkoutStore(repo), NOW, null)[6];
  expect(today).toBe(100);
  expect(screen.queryByText(t('homeEmptyScore'))).toBeNull();
  expect(homeTileState()?.data.score.today).toBe(today);
  expect(homeTileState()?.scores?.[6]).toBe(today);
  expect(screen.getAllByText(String(today)).length).toBeGreaterThan(0);
  logFood(repo, [5, 4, 3, 2, 1]);
  await render(<Home />, { wrapper });
  await settle();
  expect(homeTileState()?.data.score.series.slice(-7)).toEqual(weekScores(new WorkoutStore(repo), NOW, null));
});

test('taking the Score tile off Home turns the Score off, and turning it on puts it first again', async () => {
  const repo = open();
  await render(<Home />, { wrapper });
  await settle();
  expect(screen.getByText(t('homeEmptyScore'))).toBeTruthy();
  await act(async () => { tileStoreFor(repo, 'home').remove('score'); });
  expect(screen.queryByText(t('homeEmptyScore'))).toBeNull();
  expect(scoreOn(repo)).toBe(false);
  await act(async () => { setScoreOn(repo, true); });
  expect(screen.getByText(t('homeEmptyScore'))).toBeTruthy();
  expect(homeLayout(repo)[0]).toMatchObject({ id: 'score', size: 'M' });
});

test('steps and sleep from Apple Health feed the score in memory, and nothing about them is saved', async () => {
  const repo = open();
  logFood(repo, [6, 5, 4, 3, 2, 1]);
  workout(repo);
  jest.mocked(appleHealth).mockReturnValue(health());
  const save = jest.spyOn(repo, 'save'), local = jest.spyOn(repo, 'localSave');
  await render(<Home />, { wrapper });
  await settle();
  // 5 h 30 min a night is halfway between 4 and 7 hours.
  expect(homeTileState()?.data.score.pillars.recovery).toBe(50);
  expect(save).not.toHaveBeenCalled();
  expect(local).not.toHaveBeenCalled();
});

test('the detail screen shows the sums with the person\'s numbers, the weights, and the disclaimer', async () => {
  const repo = open();
  logFood(repo, [6, 5, 4, 3, 2, 1]);
  workout(repo);
  jest.mocked(appleHealth).mockReturnValue(health());
  const save = jest.spyOn(repo, 'save'), local = jest.spyOn(repo, 'localSave');
  await render(<ScoreDetail />, { wrapper });
  await settle();
  expect(screen.getByRole('header', { name: 'Insight Score' })).toBeTruthy();
  expect(screen.getByText('Your score is the average of the pillars below, with each one counted by its weight.')).toBeTruthy();
  expect(screen.getByText('Workouts in the last 7 days: 1, against a plan of 3 a week.')).toBeTruthy();
  expect(screen.getByText('A quarter of this pillar is steps: you average 6,000 a day against 8,000.')).toBeTruthy();
  expect(screen.getByText('Food logged on 6 of 6 days. A day with nothing logged scores 0.')).toBeTruthy();
  expect(screen.getByText('Average sleep: 5 h 30 min over 7 nights.')).toBeTruthy();
  expect(screen.getByText('The score is a guide to your own habits, not medical advice.')).toBeTruthy();
  expect(within(screen.getByTestId('score-detail-training')).getByText('Weight: 40')).toBeTruthy();
  expect(within(screen.getByTestId('score-detail-training')).getByText('40% of your score')).toBeTruthy();
  expect(screen.queryByTestId('score-reset')).toBeNull();
  const before = within(screen.getByTestId('score-summary')).getByLabelText(/Insight Score, \d+ out of 100/).props.accessibilityLabel;

  await fireEvent.press(screen.getByRole('button', { name: 'Raise the weight of Recovery' }));
  expect(within(screen.getByTestId('score-detail-recovery')).getByText('Weight: 30')).toBeTruthy();
  // Only the three weights are kept: no score, no steps, no sleep.
  expect(local.mock.calls).toEqual([[SCORE_WEIGHTS_KEY, { training: 40, food: 35, recovery: 30 }]]);
  expect(save).not.toHaveBeenCalled();
  for (let i = 0; i < 14; i++) await fireEvent.press(screen.getByRole('button', { name: 'Raise the weight of Recovery' }));
  expect(within(screen.getByTestId('score-detail-recovery')).getByText('Weight: 100')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Raise the weight of Recovery' }).props.accessibilityState.disabled).toBe(true);
  expect(within(screen.getByTestId('score-summary')).getByLabelText(/Insight Score, \d+ out of 100/).props.accessibilityLabel).not.toBe(before);
  expect(JSON.stringify(local.mock.calls)).not.toMatch(/6000|6,000|5\.5|330/);

  await fireEvent.press(screen.getByTestId('score-reset'));
  expect(repo.localGet(SCORE_WEIGHTS_KEY)).toEqual({ training: 40, food: 35, recovery: 25 });
  expect(screen.queryByTestId('score-reset')).toBeNull();
});

test('food keeps the Food tab\'s day: nothing shifts at midnight, and the day changes at 4 a.m.', () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  // Food on each of the seven days up to and including the 12th.
  logFood(repo, [6, 5, 4, 3, 2, 1, 0]);
  const at = (day: number, hour: number) => readScore(store, new Date(2026, 4, day, hour, 0, 0), null);
  const evening = at(12, 23), small = at(13, 2), morning = at(13, 5);
  expect(evening.parts).toMatchObject({ foodDays: 7, foodLogged: 7 });
  // 2 a.m. is still the 12th for food, so the same seven days are measured.
  expect(small.pillars.food).toBe(evening.pillars.food);
  expect(small.parts).toMatchObject({ foodDays: 7, foodLogged: 7 });
  // After 4 a.m. the 13th is the open day and is left out until it is logged.
  expect(morning.parts).toMatchObject({ foodDays: 6, foodLogged: 6, todayCounted: false });
  expect(morning.pillars.food).toBe(evening.pillars.food);
});

test('one night of sleep reads as one night', async () => {
  const repo = open();
  const source = health();
  let first = true;
  (source.sleep as jest.Mock).mockImplementation(async (_from: Date, to: Date) => {
    if (!first) return []; first = false;
    const wake = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 6, 30);
    return [{ start: new Date(wake.getTime() - 391 * 60_000), end: wake }];
  });
  jest.mocked(appleHealth).mockReturnValue(source);
  void repo;
  await render(<ScoreDetail />, { wrapper });
  await settle();
  expect(screen.getByText('Sleep: 6 h 31 min over 1 night.')).toBeTruthy();
});

test('without sleep data the detail screen says recovery is left out', async () => {
  open();
  await render(<ScoreDetail />, { wrapper });
  expect(screen.getByText('Sleep comes from Apple Health or Oura. Until there is some, this pillar is left out of your score.')).toBeTruthy();
  expect(within(screen.getByTestId('score-detail-recovery')).getByText('Left out for now')).toBeTruthy();
  expect(screen.getByText('Steps join this pillar when Apple Health or Oura is connected.')).toBeTruthy();
});

test('the Settings switch and the Home tile are one state', async () => {
  const repo = memoryRepository();
  // Settings reads the account through useAuth (the phone-only build keeps its context private).
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as never);
  const show = () => render(<AuthContext.Provider value={{ repository: repo } as never}><SettingsSection /></AuthContext.Provider>, { wrapper });
  const view = await show();
  const toggle = screen.getByTestId('settings-score-switch');
  // Home starts without the Score tile, so the switch starts off.
  expect(toggle.props.value).toBe(false);
  await fireEvent(toggle, 'valueChange', true);
  expect(screen.getByTestId('settings-score-switch').props.value).toBe(true);
  expect(homeLayout(repo)[0]).toMatchObject({ id: 'score', size: 'M' });
  expect(JSON.stringify(repo.localGet(HOME_TILES_KEY))).toContain('score');
  await fireEvent(screen.getByTestId('settings-score-switch'), 'valueChange', false);
  expect(homeLayout(repo).map(e => e.id)).not.toContain('score');
  expect(JSON.stringify(repo.localGet(HOME_TILES_KEY))).not.toContain('score');
  await fireEvent.press(screen.getByRole('button', { name: 'How it\'s worked out' }));
  expect(router.push).toHaveBeenCalledWith('/score');
  await view.unmount();
});

describe('review fixes: the ring and the training sum', () => {
  const { ScoreRing } = jest.requireActual('../src/features/score/ring') as typeof import('../src/features/score/ring');
  const base = readScore(new WorkoutStore(memoryRepository()), NOW, null);
  test.each([[0, 0], [72, 1], [100, 1]])('a score of %i draws %i arc from 12 o\'clock, never a dashed circle', async (value, arcs) => {
    await render(<ThemeProvider><ScoreRing score={{ ...base, ready: true, value }} size={96} /></ThemeProvider>);
    expect(screen.queryAllByTestId('score-ring-arc')).toHaveLength(arcs);
    for (const arc of screen.queryAllByTestId('score-ring-arc')) expect(arc.props.strokeDasharray).toBeUndefined();
  });
  test('more workouts than the plan reads as covering it, not "5 of 3"', async () => {
    const repo = open();
    for (let i = 0; i < 4; i++) workout(repo);
    await render(<ScoreDetail />, { wrapper });
    await settle();
    expect(screen.queryByText(/ of 3\.$/)).toBeNull();
    expect(screen.getByText(/which covers your plan of 3 a week\.$/)).toBeTruthy();
  });
});

test('a weight change that could not be saved stays on screen and says it was not kept, then clears once a save works', async () => {
  const repo = open();
  jest.mocked(appleHealth).mockReturnValue(health());
  const local = jest.spyOn(repo, 'localSave').mockImplementationOnce(() => { throw new Error('synthetic write failure'); });
  await render(<ScoreDetail />, { wrapper });
  await settle();
  expect(screen.queryByTestId('score-unsaved')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Raise the weight of Recovery' }));
  expect(within(screen.getByTestId('score-detail-recovery')).getByText('Weight: 30')).toBeTruthy();
  expect(screen.getByRole('alert')).toHaveTextContent("This change couldn't be saved on this phone. It shows until you leave this screen.");
  await fireEvent.press(screen.getByRole('button', { name: 'Raise the weight of Recovery' }));
  expect(local).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('score-unsaved')).toBeNull();
});
