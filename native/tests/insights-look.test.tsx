import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { saveFood, setTargets, meals } from '../src/features/food/model';
import { dayPoints, hasAny, lastDays, onTarget, weekDays, weekReport } from '../src/features/insights/model';
import { linePath, MiniChart } from '../src/features/insights/mini-chart';
import { Trends, Weekly } from '../src/features/insights/trends';
import Insights from '../src/app/(tabs)/insights';
import { useAuth } from '../src/auth/provider';
import { memoryRepository } from './workout-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() } }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Light: 'light' } }));
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;
// A fixed Wednesday at noon, so the week has Monday, Tuesday and Wednesday in it.
const NOW = new Date(2026, 10, 11, 12), TODAY = '2026-11-11';
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const food = (kcal: number, protein: number) => ({ name: 'Sample meal', energy_kj: kcal * 4.184, protein_g: protein, carbs_g: 100, fat_g: 20, ...blank });
const targets = (kcal: number) => ({ energy_kj: kcal * 4.184, protein_g: 150, carbs_g: 200, fat_g: 60 });

/** Made-up fortnight: food on three days of this week against a 2,000 kcal target, and two workouts. */
function sample() {
  const repo = memoryRepository(), store = new WorkoutStore(repo), meal = meals(repo)[0].id;
  repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
  setTargets(repo, '2026-11-01', targets(2000), TODAY);
  saveFood(repo, '2026-11-09', meal, food(1900, 140), 1, undefined, TODAY);
  saveFood(repo, '2026-11-10', meal, food(1000, 60), 1, undefined, TODAY);
  saveFood(repo, TODAY, meal, food(2100, 160), 1, undefined, TODAY);
  const lift = (day: Date, kg: number) => {
    const at = day.getTime(), session = store.start(undefined, at), entry = store.addExercise(session.id, 'Bench Press', 2);
    for (const i of [0, 1]) { store.editDraft(entry.id, i, { weight: String(kg), reps: '5' }); store.toggleDone(entry.id, i, at); }
    store.skipTimer(); store.finish(session.id, { startedAt: at, finishedAt: at + 3600000, notes: '' }, at + 3600000);
  };
  lift(new Date(2026, 10, 3, 12), 80); lift(new Date(2026, 10, 10, 12), 100);
  return { repo, store: new WorkoutStore(repo) };
}

describe('the numbers', () => {
  test('lastDays ends today and weekDays runs Monday to today', () => {
    expect(lastDays(14, NOW)).toHaveLength(14);
    expect(lastDays(14, NOW)[0]).toBe('2026-10-29');
    expect(lastDays(14, NOW).at(-1)).toBe(TODAY);
    expect(weekDays(NOW)).toEqual(['2026-11-09', '2026-11-10', TODAY]);
    expect(weekDays(new Date(2026, 10, 9, 8))).toEqual(['2026-11-09']);
    expect(weekDays(new Date(2026, 10, 15, 8))).toHaveLength(7);
  });
  test('each day carries its own food, target, workouts and volume; an unlogged day is null, not zero', () => {
    const { store } = sample(), points = dayPoints(store, lastDays(14, NOW)), on = (day: string) => points.find(p => p.day === day)!;
    expect(on('2026-11-09')).toMatchObject({ protein: 140, workouts: 0, volumeKg: 0 });
    expect(on('2026-11-09').kcal).toBeCloseTo(1900, 3);
    expect(on('2026-11-09').targetKcal).toBeCloseTo(2000, 3);
    expect(on('2026-11-10')).toMatchObject({ workouts: 1 });
    expect(on('2026-11-10').volumeKg).toBeCloseTo(1000, 3);
    expect(on('2026-11-03').volumeKg).toBeCloseTo(800, 3);
    expect(on('2026-11-05')).toMatchObject({ kcal: null, protein: null, workouts: 0 });
    expect(hasAny(points)).toBe(true);
    expect(hasAny(dayPoints(new WorkoutStore(memoryRepository()), lastDays(14, NOW)))).toBe(false);
  });
  test('on target means 80% to 115% of that day\'s target', () => {
    const day = (kcal: number | null, targetKcal: number | null) => ({ day: TODAY, foods: kcal === null ? 0 : 1, kcal, protein: null, targetKcal, targetProtein: null, workouts: 0, volumeKg: 0 });
    expect([1599, 1600, 2000, 2300, 2301].map(k => onTarget(day(k, 2000)))).toEqual([false, true, true, true, false]);
    expect(onTarget(day(null, 2000))).toBe(false);
    expect(onTarget(day(2000, null))).toBe(false);
  });
  test('the week adds up workouts, volume, logged days, days on target and averages', () => {
    const { store } = sample(), report = weekReport(dayPoints(store, weekDays(NOW)));
    expect(report).toMatchObject({ days: 3, workouts: 1, foodDays: 3, targetDays: 3, onTargetDays: 2 });
    expect(report.volumeKg).toBeCloseTo(1000, 3);
    expect(report.avgKcal).toBeCloseTo((1900 + 1000 + 2100) / 3, 3);
    expect(report.avgProtein).toBeCloseTo(120, 3);
  });
  test('a day with food but no calories entered still counts as a food day', () => {
    const repo = memoryRepository(), store = new WorkoutStore(repo), meal = meals(repo)[0].id;
    saveFood(repo, TODAY, meal, { name: 'Sample shake', energy_kj: null, protein_g: 30, carbs_g: null, fat_g: null, ...blank }, 1, undefined, TODAY);
    saveFood(repo, '2026-11-10', meal, { name: 'Sample snack', energy_kj: null, protein_g: null, carbs_g: null, fat_g: null, ...blank }, 1, undefined, TODAY);
    const points = dayPoints(store, weekDays(NOW)), report = weekReport(points);
    expect(points.map(p => p.foods)).toEqual([0, 1, 1]);
    expect(report).toMatchObject({ foodDays: 2, targetDays: 0, avgKcal: null });
    expect(report.avgProtein).toBeCloseTo(30, 3);
    expect(hasAny(points)).toBe(true);
  });
  test('a past-day workout that was opened and left empty is not counted as a workout', () => {
    const repo = memoryRepository(), store = new WorkoutStore(repo);
    store.startPast('2026-11-10');
    const points = dayPoints(store, weekDays(NOW));
    expect(points.map(p => p.workouts)).toEqual([0, 0, 0]);
    expect(hasAny(points)).toBe(false);
  });
  test('reading saves nothing', () => {
    const { repo, store } = sample(), save = jest.spyOn(repo, 'save'), local = jest.spyOn(repo, 'localSave');
    weekReport(dayPoints(store, lastDays(14, NOW)));
    expect(save).not.toHaveBeenCalled(); expect(local).not.toHaveBeenCalled();
  });
  test('a chart line breaks at a day with nothing logged instead of dropping to zero', () => {
    const d = linePath([10, 20, null, 30, 40], 40, 120);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(2);
    expect(linePath([null, null], 10, 120)).toBe('');
  });
});

test('values with no logged day beside them are drawn as dots, so sparse logging still shows', async () => {
  await render(wrap(<MiniChart values={[100, null, 200, null, 150]} color="#000" first="a" last="b" />));
  expect(await screen.findAllByTestId('chart-dot')).toHaveLength(3);
  await screen.unmount();
  await render(wrap(<MiniChart values={[100, 120, null, 150]} color="#000" first="a" last="b" />));
  expect(await screen.findAllByTestId('chart-dot')).toHaveLength(1);
  await screen.unmount();
  await render(wrap(<MiniChart bars values={[100, null, 200]} color="#000" first="a" last="b" />));
  expect(screen.queryByTestId('chart-dot')).toBeNull();
});

describe('Trends', () => {
  test('shows calories, training volume and protein for the last 14 days with a spoken summary', async () => {
    const { store } = sample();
    await render(wrap(<Trends store={store} now={NOW} />));
    expect(screen.getByLabelText('Calories. Average 1,667 kcal · 3 of 14 days logged')).toBeTruthy();
    expect(screen.getByLabelText('Training volume. Workouts: 2 · 1,800 kg')).toBeTruthy();
    expect(screen.getByLabelText('Protein. Average 120 g')).toBeTruthy();
    expect(screen.getAllByTestId('chart-bar')).toHaveLength(2);
    expect(screen.getAllByTestId('chart-goal')).toHaveLength(2);
    expect(screen.getAllByText('Oct 29')).toHaveLength(3);
  });
  test('with nothing logged it says trends need a few days', async () => {
    await render(wrap(<Trends store={new WorkoutStore(memoryRepository())} now={NOW} />));
    expect(screen.getByTestId('insights-empty')).toBeTruthy();
    expect(screen.queryByTestId('trend-calories')).toBeNull();
  });
  test('food only: the volume card says nothing was logged and draws no bars', async () => {
    const repo = memoryRepository();
    saveFood(repo, TODAY, meals(repo)[0].id, food(500, 30), 1, undefined, TODAY);
    await render(wrap(<Trends store={new WorkoutStore(repo)} now={NOW} />));
    expect(screen.getByLabelText('Training volume. Nothing logged in the last 14 days')).toBeTruthy();
    expect(screen.queryAllByTestId('chart-bar')).toHaveLength(0);
    // One logged day cannot make a line, so it is drawn as a dot.
    expect(screen.getAllByTestId('chart-dot')).toHaveLength(2);
  });
});

describe('Weekly', () => {
  test('lists the week so far', async () => {
    const { store } = sample();
    await render(wrap(<Weekly store={store} now={NOW} />));
    expect(screen.getByText('Week of Nov 9')).toBeTruthy();
    expect(screen.getByText('Workouts: 1 · Food logged on 3 days')).toBeTruthy();
    for (const label of ['Workouts: 1', 'Volume lifted: 1,000 kg', 'Days with food logged: 3 of 3', 'Days on calorie target: 2 of 3', 'Average calories: 1,667 kcal', 'Average protein: 120 g'])
      expect(screen.getByLabelText(label)).toBeTruthy();
  });
  test('an empty week says so and shows dashes, not zeros that look like results', async () => {
    await render(wrap(<Weekly store={new WorkoutStore(memoryRepository())} now={NOW} />));
    expect(screen.getByText('Nothing logged yet this week')).toBeTruthy();
    expect(screen.getByLabelText('Volume lifted: —')).toBeTruthy();
    expect(screen.getByLabelText('Average calories: —')).toBeTruthy();
    expect(screen.getByLabelText('Days on calorie target: —')).toBeTruthy();
  });
});

test('the tab has four sections; Muscles holds the body map and Recovery says plainly it is not built', async () => {
  const { repo } = sample();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  await render(wrap(<Insights />));
  expect(screen.getAllByRole('tab').map(tab => tab.props.accessibilityLabel)).toEqual(['Trends', 'Recovery', 'Muscles', 'Weekly']);
  expect(screen.getByTestId('trend-calories')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Muscles' }));
  expect(screen.getByText('Front')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Recovery' }));
  expect(screen.getByRole('header', { name: 'Recovery is not in this version yet' })).toBeTruthy();
  expect(screen.queryByText('M2/M3 placeholder')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Weekly' }));
  expect(screen.getByTestId('weekly-report')).toBeTruthy();
});
