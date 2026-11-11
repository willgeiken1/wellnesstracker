import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { PlanStore } from '../src/features/plans/store';
import { saveFood, attributedDay, meals } from '../src/features/food/model';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { greeting } from '../src/features/home/screen';
import { MINI, terrain } from '../src/features/home/contour';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
function open(repo = memoryRepository(), demo = false) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo } as ReturnType<typeof useAuth>);
  return repo;
}
const oats = { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
function logOats(repo: ReturnType<typeof memoryRepository>) { const day = attributedDay(); saveFood(repo, day, meals(repo)[0].id, oats, 1, undefined, day); }
function finishWorkout(repo: ReturnType<typeof memoryRepository>) {
  const store = new WorkoutStore(repo), start = Date.now() - 600000, session = store.start(undefined, start), entry = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' }); store.toggleDone(entry.id, 0);
  store.finish(session.id, { startedAt: start, finishedAt: Date.now() - 60000, notes: '' });
}
let hours: jest.SpyInstance;
beforeEach(() => {
  jest.mocked(router.push).mockClear(); jest.mocked(router.navigate).mockClear();
  hours = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
});
afterEach(() => hours.mockRestore());

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

test('a new account sees the empty map, a way to start, and no placeholder copy', async () => {
  open();
  await render(<Home />, { wrapper });
  expect(screen.queryByText(/M2\/M3|Your daily space|Score/)).toBeNull();
  expect(screen.getByText('Your map fills in as you log')).toBeTruthy();
  expect(screen.queryByTestId('home-map')).toBeNull();
  expect(screen.getByText(/^Tiles appear here/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Log your first meal' }));
  expect(router.push).toHaveBeenCalledWith('/food');
  await fireEvent.press(screen.getByRole('button', { name: 'Start freestyle' }));
  expect(router.push).toHaveBeenCalledWith('/workout');
});
test('the map and tiles appear once something is logged, from real entries only', async () => {
  const repo = open();
  const view = await render(<Home />, { wrapper });
  await act(async () => { logOats(repo); });
  await view.rerender(<Home />);
  expect(screen.getByTestId('home-map')).toBeTruthy();
  expect(screen.getByLabelText(/^Today\. Training 0%, Food \d+%$/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Calories, 100 kcal' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Protein, 5 g' })).toBeTruthy();
  expect(screen.queryByTestId('home-tile-volume')).toBeNull();
  expect(screen.queryByTestId('home-tile-weight')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Calories, 100 kcal' }));
  expect(router.navigate).toHaveBeenCalledWith('/food');
});
test('a finished workout fills training on the map, the week strip and the volume tile', async () => {
  const repo = open();
  finishWorkout(repo);
  await render(<Home />, { wrapper });
  expect(screen.getByLabelText('Today. Training 100%, Food 0%')).toBeTruthy();
  expect(screen.getByText('50% today')).toBeTruthy();
  expect(screen.getByRole('button', { name: /, Today, Training 100%, Food 0%$/ })).toBeTruthy();
  expect(screen.getByTestId('home-tile-volume')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day/ })).toHaveLength(7);
});
test('tapping a day in the week strip shows that day on the map', async () => {
  const repo = open();
  finishWorkout(repo);
  await render(<Home />, { wrapper });
  const monday = screen.getByRole('button', { name: /^Monday/ });
  await fireEvent.press(monday);
  expect(screen.getByRole('button', { name: /^Monday/ }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText(/^(Today|Monday, \w+ \d+)\. /)).toBeTruthy();
});
test("the next card names the planned routine and starts it", async () => {
  const repo = open(), workout = new WorkoutStore(repo);
  const a = workout.saveTemplate('Sample push', [{ exercise: 'Bench Press', target_sets: 3, target_reps: 8 }, { exercise: 'Overhead Press', target_sets: 3, target_reps: 8 }]);
  new PlanStore(repo).save({ mode: 'rotation', daysPerWeek: 3, days: [{ routineId: a.id, weekdays: [] }] });
  await render(<Home />, { wrapper });
  expect(screen.getByText('Sample push · 2 exercises')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Start Sample push' }));
  expect(new WorkoutStore(repo).active()?.data.routine_id).toBe(a.id);
  expect(router.push).toHaveBeenCalledWith('/workout');
});
test('an active workout is offered as Resume, not as a second start', async () => {
  const repo = open();
  new WorkoutStore(repo).start();
  await render(<Home />, { wrapper });
  expect(screen.getByText('Workout in progress')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start freestyle' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Resume workout' }));
  expect(router.push).toHaveBeenCalledWith('/workout');
});
test('in the evening the next card becomes a plain food check-in', async () => {
  const repo = open();
  logOats(repo);
  hours.mockReturnValue(19);
  await render(<Home />, { wrapper });
  expect(screen.getByText('Evening check-in')).toBeTruthy();
  expect(screen.getByText(/kcal (and \d+ g protein left|logged today)\.$/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Log food' }));
  expect(router.push).toHaveBeenCalledWith('/food');
});
test('the + button opens two quick actions', async () => {
  open();
  await render(<Home />, { wrapper });
  expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
  expect(router.push).toHaveBeenCalledWith('/workout');
  expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
});
test('Home reads only: opening it writes nothing to the outbox or the tables', async () => {
  const repo = open(), before = repo.getRevision();
  await render(<Home />, { wrapper });
  expect(repo.getRevision()).toBe(before);
});
test('greeting follows the time of day, the header keeps settings, and demo mode is labelled', async () => {
  expect([5, 11, 12, 17, 18, 23, 3].map(greeting)).toEqual(['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening', 'Good evening']);
  open(undefined, true);
  await render(<Home />, { wrapper });
  expect(screen.getByRole('header', { name: 'Good morning' })).toBeTruthy();
  expect(screen.getByText('Example data')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
  expect(router.push).toHaveBeenCalledWith('/settings');
});

describe('add button and the tab bar', () => {
  const { SafeAreaProvider } = jest.requireActual('react-native-safe-area-context');
  test.each([[0, 16], [83, 99]])('with a bottom inset of %i the + button sits %i from the bottom', async (bottom, expected) => {
    open();
    const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, left: 0, right: 0, bottom } };
    await render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><Home /></ThemeProvider></SafeAreaProvider>);
    expect(screen.getByTestId('home-add-dock')).toHaveStyle({ bottom: expected });
  });
});
