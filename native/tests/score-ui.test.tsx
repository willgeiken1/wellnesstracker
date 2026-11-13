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
import { SCORE_WEIGHTS_KEY } from '../src/features/score/model';
import { appleHealth } from '../src/features/health/apple';
import { HOME_TILES_KEY, loadTiles, scoreOn } from '../src/features/home/tiles';
import type { HealthSource } from '../src/features/health/source';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn(), AuthContext: jest.requireActual('react').createContext(null) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() }, Stack: { Screen: () => null }, useLocalSearchParams: jest.fn(() => ({ section: 'score' })) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: jest.fn() }));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: jest.fn(() => true) }));
jest.mock('../src/features/food/ai/privacy', () => ({ FoodPrivacyScreen: () => null }));
jest.mock('../src/features/importer/screen', () => ({ ImportScreen: () => null }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
// A fixed afternoon, so "the last 7 days" and last night's sleep do not depend on when the tests run.
const NOW = new Date(2026, 4, 12, 15, 0, 0);
beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  jest.mocked(router.push).mockClear();
  jest.mocked(appleHealth).mockReturnValue(null);
});
afterEach(() => { jest.useRealTimers(); });

// Made-up sample data only.
const oats = { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const dayAgo = (n: number) => localDay(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));
function open(repo = memoryRepository()) {
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
  steps: jest.fn(async () => 6000),
  sleep: jest.fn(async (from: Date, to: Date) => {
    const spans = [];
    for (let day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1); day < to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
      spans.push({ start: new Date(day.getTime() - 3_600_000), end: new Date(day.getTime() - 3_600_000 + 330 * 60_000) });
    }
    return spans;
  }),
});

test('a new account sees the ring and the card counting down, and both open how it is worked out', async () => {
  open();
  await render(<Home />, { wrapper });
  const card = screen.getByTestId('home-score');
  expect(within(card).getByText('Needs 7 more days')).toBeTruthy();
  for (const pillar of ['training', 'food', 'recovery']) expect(within(card).getByTestId(`score-pillar-${pillar}`)).toBeTruthy();
  const ring = screen.getByRole('button', { name: 'Insight Score. Needs 7 more days of logging' });
  await fireEvent.press(ring);
  await fireEvent.press(within(card).getByRole('button', { name: 'How it\'s worked out' }));
  expect(jest.mocked(router.push).mock.calls).toEqual([['/score'], ['/score']]);
});

test('the countdown follows the days logged, and the score shows after 7', async () => {
  const repo = open();
  logFood(repo, [5, 4, 3, 2, 1]);
  workout(repo);
  const view = await render(<Home />, { wrapper });
  // Five food days plus today's workout: six days logged.
  expect(within(screen.getByTestId('home-score')).getByText('Needs 1 more day')).toBeTruthy();
  logFood(repo, [6]);
  await act(async () => {});
  await view.rerender(<Home />);
  const card = screen.getByTestId('home-score');
  expect(within(card).queryByText(/Needs/)).toBeNull();
  const score = readScore(new WorkoutStore(repo), NOW, null);
  expect(score.ready).toBe(true);
  expect(score.value).not.toBeNull();
  expect(within(card).getByText(String(score.value))).toBeTruthy();
  expect(screen.getByRole('button', { name: `Insight Score, ${score.value} out of 100` })).toBeTruthy();
});

test('removing the tile in Edit takes the card and the header ring away together', async () => {
  const repo = open();
  await render(<Home />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove, Insight Score' }));
  expect(screen.queryByTestId('home-score')).toBeNull();
  expect(screen.queryByTestId('home-score-ring')).toBeNull();
  expect(scoreOn(repo)).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Add, Insight Score' }));
  expect(screen.getByTestId('home-score-ring')).toBeTruthy();
  // It comes back under the map, where the Settings switch puts it too.
  expect(loadTiles(repo).order.slice(0, 2)).toEqual(['map', 'score']);
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
  expect(within(screen.getByTestId('score-pillar-recovery')).getByText('50')).toBeTruthy();
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
  expect(screen.getByText('Score = each pillar × its weight, added up, ÷ the weights added up')).toBeTruthy();
  expect(screen.getByText('Workouts in the last 7 days ÷ your weekly plan: 1 of 3.')).toBeTruthy();
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
  expect(screen.getByText('Sleep comes from Apple Health. Until there is some, this pillar is left out of your score.')).toBeTruthy();
  expect(within(screen.getByTestId('score-detail-recovery')).getByText('Left out for now')).toBeTruthy();
  expect(screen.getByText('Steps join this pillar when Apple Health is connected.')).toBeTruthy();
});

test('the Settings switch and the Home tile are one state', async () => {
  const repo = memoryRepository();
  const show = () => render(<AuthContext.Provider value={{ repository: repo } as never}><SettingsSection /></AuthContext.Provider>, { wrapper });
  const view = await show();
  const toggle = screen.getByTestId('settings-score-switch');
  expect(toggle.props.value).toBe(true);
  await fireEvent(toggle, 'valueChange', false);
  expect(screen.getByTestId('settings-score-switch').props.value).toBe(false);
  expect(loadTiles(repo).order).not.toContain('score');
  expect(repo.localGet(HOME_TILES_KEY)).toMatchObject({ v: 2 });
  await fireEvent(screen.getByTestId('settings-score-switch'), 'valueChange', true);
  expect(loadTiles(repo).order.slice(0, 2)).toEqual(['map', 'score']);
  await fireEvent.press(screen.getByRole('button', { name: 'How it\'s worked out' }));
  expect(router.push).toHaveBeenCalledWith('/score');
  await view.unmount();
});
