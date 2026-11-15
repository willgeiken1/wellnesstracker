import { act, render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { fromKg, localDay } from '../src/core/workout/rules';
import { useAuth } from '../src/auth/provider';
import { useFocused } from '../src/features/home/use-focused';
import Home from '../src/app/(tabs)/index';
import { WorkoutStore } from '../src/data/workout/store';
import { entryVolumeKg } from '../src/features/workout/volume';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: jest.fn(() => true) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const DAY = 86400000;
const lifts = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull Up'];
/** A made-up year: a workout on most days (six lifts of four sets), four foods a day and a daily weigh-in. */
function seededYear(days = 365) {
  const repo = memoryRepository(), today = new Date();
  for (let back = days - 1; back >= 0; back--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, 7), day = localDay(date), at = date.getTime();
    for (let k = 0; k < 4; k++) repo.save('food_entries', { name: 'Sample food', day, meal_id: 'breakfast', energy_kj: 1500 + k * 100, protein_g: 20 + k, carbs_g: 40, fat_g: 10, saved_food_id: null });
    repo.save('weigh_ins', { day, weight_kg: 80 + (back % 7) * 0.1, source: 'app' });
    if (back % 7 === 3 || back % 7 === 5 || back === 0) continue;
    const session = repo.save('sessions', { origin: 'empty', routine_id: null, name: 'Workout', day, started_at: at, finished_at: at + 3600000, duration_ms: 3600000, notes: null });
    lifts.forEach((exercise, position) => {
      const entry = repo.save('entries', { session_id: session.id, exercise, position });
      const drafts = [];
      for (let k = 0; k < 4; k++) {
        const weight = 40 + position * 10 + ((back * 7 + k * 3) % 11) * 2.5, reps = 5 + ((back + k) % 4);
        const set = repo.save('sets', { entry_id: entry.id, position: k, weight_kg: weight, reps, entered_unit: 'kg', entered_value: weight });
        drafts.push({ weight: String(weight), reps: String(reps), setId: set.id, warmup: k === 0 && back % 3 === 0 });
      }
      repo.localSave(`draft:${entry.id}`, drafts);
      repo.localSave(`entryUnit:${entry.id}`, 'kg');
    });
  }
  return repo;
}
function open(repo: ReturnType<typeof memoryRepository>) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
}
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const sample = (day: string) => ({ name: 'Sample snack', day, meal_id: 'snacks', energy_kj: 400, protein_g: 3, carbs_g: 10, fat_g: 2, saved_food_id: null });

const today = () => localDay(new Date());
/** Seven days of volume worked out the long way, over the whole history, as Home did before it kept to its days. */
function longWayVolume(repo: ReturnType<typeof memoryRepository>) {
  const store = new WorkoutStore(repo), now = new Date();
  const recent = new Set(Array.from({ length: 7 }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i))));
  const kg = store.trainingHistory().filter(s => recent.has(String(s.data.day)))
    .reduce((sum, s) => sum + store.entries(s.id).reduce((a, e) => a + entryVolumeKg(store, e), 0), 0);
  return `${Math.round(fromKg(kg, store.unit())).toLocaleString('en-US')} ${store.unit()}`;
}
// Only the clock is faked, at noon on a Wednesday, so rendering still runs on real timers.
const realTimers = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'] as const;
beforeEach(() => { jest.useFakeTimers({ now: new Date(2026, 10, 11, 12), doNotFake: [...realTimers] }); jest.mocked(useFocused).mockReturnValue(true); });
afterEach(() => jest.useRealTimers());

test('with a year of history Home shows the same sums, and a write opens only the workouts on the days it shows', async () => {
  const repo = seededYear();
  open(repo);
  await render(<Home />, { wrapper });
  expect(screen.getByRole('button', { name: `Volume, ${longWayVolume(repo)} · 7 days` })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Calories, 1,577 kcal' })).toBeTruthy();
  expect(screen.getByLabelText(/^Today\. Training 0%, Food \d+%$/)).toBeTruthy();
  const opened = jest.spyOn(WorkoutStore.prototype, 'trained');
  const at = performance.now();
  await act(async () => { repo.save('food_entries', sample(today())); });
  const took = performance.now() - at;
  // Home shows up to fourteen days and the score seven; a year holds over 250 workouts. Before, every write opened
  // every one of them twice (Home's days and the score).
  expect(opened.mock.calls.length).toBeGreaterThan(0);
  expect(opened.mock.calls.length).toBeLessThanOrEqual(2 * 14);
  expect(took).toBeLessThan(2000);
  expect(screen.getByRole('button', { name: 'Calories, 1,673 kcal' })).toBeTruthy();
  opened.mockRestore();
}, 60000);

test('while another tab is in front a write redoes none of Home\'s work, and coming back catches up', async () => {
  const repo = seededYear(30);
  open(repo);
  const view = await render(<Home />, { wrapper });
  expect(screen.getByRole('button', { name: 'Calories, 1,577 kcal' })).toBeTruthy();
  jest.mocked(useFocused).mockReturnValue(false);
  await view.rerender(<Home />);
  const reads = jest.spyOn(repo, 'list'), opened = jest.spyOn(WorkoutStore.prototype, 'trained');
  await act(async () => { repo.save('food_entries', sample(today())); });
  await act(async () => { repo.save('food_entries', sample(today())); });
  expect(reads).not.toHaveBeenCalled();
  expect(opened).not.toHaveBeenCalled();
  // What Home last worked out stays on screen while it is hidden.
  expect(screen.getByRole('button', { name: 'Calories, 1,577 kcal' })).toBeTruthy();
  jest.mocked(useFocused).mockReturnValue(true);
  await view.rerender(<Home />);
  expect(reads).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Calories, 1,769 kcal' })).toBeTruthy();
  // Back in front with nothing new, Home does not walk its days again.
  reads.mockClear(); opened.mockClear();
  await view.rerender(<Home />);
  expect(opened).not.toHaveBeenCalled();
  reads.mockRestore(); opened.mockRestore();
});

test('workouts older than the score\'s week still count towards its first 7 days', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), now = new Date();
  // Three made-up workouts, two and three weeks back, on three different days, and one left empty.
  for (const back of [14, 15, 21, 22]) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 9).getTime(), past = store.startPast(localDay(new Date(at)));
    if (back === 22) continue;
    const entry = store.addExercise(past.id, 'Squat', 1);
    store.editDraft(entry.id, 0, { weight: '60', reps: '5' }); store.toggleDone(entry.id, 0, at);
    store.finish(past.id, { startedAt: at, finishedAt: at + 1800000, notes: '' });
  }
  open(repo);
  await render(<Home />, { wrapper });
  expect(within(screen.getByTestId('home-score')).getByText('Needs 4 more days')).toBeTruthy();
});
