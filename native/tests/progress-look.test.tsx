import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import Progress from '../src/app/(tabs)/progress';
import { Body } from '../src/features/body/screen';
import { Records } from '../src/features/progress/records-screen';
import { lifetime, liftRecords } from '../src/features/progress/records';
import { WorkoutStore } from '../src/data/workout/store';
import { today } from '../src/features/onboarding/model';
import { memoryRepository } from './workout-repository';

const mockRepository = memoryRepository();
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;
const daysAgo = (n: number) => new Date(Date.parse(`${today()}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/** Made-up weigh-ins: one a day for ten days, 82.0 kg falling to 81.1 kg. */
function weighed() {
  const repo = memoryRepository();
  for (let i = 9; i >= 0; i--) repo.save('weigh_ins', { day: daysAgo(i), weight_kg: 81.1 + i * 0.1, entered_value: 81.1 + i * 0.1, entered_unit: 'kg', source: 'app' });
  repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
  return repo;
}
/** Two made-up finished workouts: bench 100 kg then 105 kg, squat 140 kg once. */
function trained() {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
  const log = (start: number, lifts: [string, number][]) => {
    const session = store.start(undefined, start);
    for (const [name, kg] of lifts) {
      const entry = store.addExercise(session.id, name, 2);
      for (const index of [0, 1]) { store.editDraft(entry.id, index, { weight: String(kg), reps: '5' }); store.toggleDone(entry.id, index, start); }
    }
    store.skipTimer();
    store.finish(session.id, { startedAt: start, finishedAt: start + 3600000, notes: '' }, start + 3600000);
  };
  const base = Date.parse(`${daysAgo(8)}T12:00:00`);
  log(base, [['Bench Press', 100], ['Back Squat', 140]]);
  log(base + 3 * 86400000, [['Bench Press', 105]]);
  return { repo, store: new WorkoutStore(repo) };
}

describe('Body', () => {
  test('shows change over the range, weekly pace and the number of weigh-ins', async () => {
    await render(wrap(<Body repository={weighed()} />));
    expect(screen.getByLabelText(/^30d change: -0\.\d kg$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Weekly pace: -0\.\d kg$/)).toBeTruthy();
    expect(screen.getByLabelText('Weigh-ins: 10')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: '7d' }));
    expect(screen.getByLabelText('Weigh-ins: 7')).toBeTruthy();
  });
  test('with one weigh-in the change and pace are dashes, with the reason shown', async () => {
    const repo = memoryRepository();
    repo.save('weigh_ins', { day: today(), weight_kg: 80, entered_value: 80, entered_unit: 'kg', source: 'app' });
    repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
    await render(wrap(<Body repository={repo} />));
    expect(screen.getByLabelText('30d change: —')).toBeTruthy();
    expect(screen.getByLabelText('Weekly pace: —')).toBeTruthy();
    expect(screen.getByText('Weekly change needs at least seven days of readings.')).toBeTruthy();
  });
  test('with no weigh-ins there are no stats and no entries list, only the prompt and the log button', async () => {
    await render(wrap(<Body repository={memoryRepository()} />));
    expect(screen.getByText('Log a weigh-in to start your trend.')).toBeTruthy();
    expect(screen.queryByTestId('body-stats')).toBeNull();
    expect(screen.queryByTestId('body-entries')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log weigh-in' })).toBeTruthy();
  });
  test('entries sit in one list, newest first, each with its own delete button', async () => {
    await render(wrap(<Body repository={weighed()} />));
    expect(screen.getByRole('header', { name: 'Entries' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `Delete weigh-in for ${today()}, 81.1 kg` })).toBeTruthy();
    expect(screen.getAllByText('Delete')).toHaveLength(10);
  });
  test('the trend line takes the recovery colour from the theme', async () => {
    await render(wrap(<Body repository={weighed()} />));
    const recovery = [createTheme('dark').recovery, createTheme('light').recovery].map(hex => parseInt(hex.slice(1), 16));
    expect(recovery).toContain(screen.getByTestId('body-chart-line').props.stroke.payload & 0xffffff);
  });
});

describe('Goals & PRs', () => {
  test('keeps the heaviest set for each exercise with its day, newest first', () => {
    const { store } = trained();
    expect(liftRecords(store)).toEqual([
      { exercise: 'Bench Press', weight: 105, unit: 'kg', day: daysAgo(5) },
      { exercise: 'Back Squat', weight: 140, unit: 'kg', day: daysAgo(8) },
    ]);
  });
  test('lifetime totals count finished workouts, sets and volume', () => {
    const { store } = trained();
    expect(lifetime(store)).toEqual({ workouts: 2, sets: 6, volume: 100 * 5 * 2 + 140 * 5 * 2 + 105 * 5 * 2, unit: 'kg' });
  });
  test('lifetime totals match the workout summaries and do not rescan history for every workout', () => {
    const { store } = trained(), sessions = store.trainingHistory();
    const fromSummaries = sessions.map(s => store.summary(s.id)).reduce((n, s) => ({ sets: n.sets + s.count, volume: n.volume + s.volume }), { sets: 0, volume: 0 });
    const history = jest.spyOn(store, 'history');
    const total = lifetime(store);
    expect(total).toMatchObject({ workouts: sessions.length, sets: fromSummaries.sets, volume: Math.round(fromSummaries.volume) });
    // One pass to list the workouts. The old code called history again for every exercise of every workout.
    expect(history.mock.calls.length).toBeLessThanOrEqual(1);
    history.mockRestore();
  });
  test('shows the binder and the lifetime list', async () => {
    const { repo } = trained();
    await render(wrap(<Records repository={repo} />));
    expect(screen.getByRole('header', { name: 'Personal records · 2' })).toBeTruthy();
    expect(screen.getAllByTestId('record-card')).toHaveLength(2);
    expect(screen.getByLabelText(`Bench Press: 105 kg on ${daysAgo(5)}`)).toBeTruthy();
    expect(screen.getByLabelText('Workouts: 2')).toBeTruthy();
    expect(screen.getByLabelText('Sets logged: 6')).toBeTruthy();
    expect(screen.getByLabelText('Total volume: 3,450 kg')).toBeTruthy();
  });
  test('with no workouts it says how records appear, and the totals are zero', async () => {
    await render(wrap(<Records repository={memoryRepository()} />));
    expect(screen.getByTestId('records-empty')).toBeTruthy();
    expect(screen.getByText('No records yet.')).toBeTruthy();
    expect(screen.getByLabelText('Workouts: 0')).toBeTruthy();
  });
  test('reading records saves nothing', () => {
    const { repo, store } = trained();
    const save = jest.spyOn(repo, 'save'), local = jest.spyOn(repo, 'localSave');
    liftRecords(store); lifetime(store);
    expect(save).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
  });
});

test('Photos says plainly that it is not built, with no placeholder badge', async () => {
  await render(wrap(<Progress />));
  await fireEvent.press(screen.getByRole('tab', { name: 'Photos' }));
  expect(screen.getByRole('header', { name: 'Progress photos are not in this version yet' })).toBeTruthy();
  expect(screen.queryByText('M2/M3 placeholder')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Goals & PRs' }));
  expect(screen.getByRole('header', { name: 'Lifetime' })).toBeTruthy();
  expect(screen.queryByText('M2/M3 placeholder')).toBeNull();
});
