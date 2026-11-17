import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { Cardio } from '../src/features/cardio/screen';
import { healthWeek } from '../src/features/cardio/health';
import { mondayOf } from '../src/features/cardio/use-health-workouts';
import type { Row } from '../src/data/rows';
import type { HealthAccess, HealthSource, HealthWorkout } from '../src/features/health/source';
import { memoryRepository } from './workout-repository';
import { useFocused } from '../src/features/home/use-focused';

jest.mock('../src/features/home/use-focused', () => ({ useFocused: jest.fn(() => true) }));

// Made-up workouts only. Saturday 14 November 2026; the week runs Monday 9 to Sunday 15.
const at = (day: number, hour: number) => new Date(2026, 10, day, hour);
const workout = (id: string, kind: HealthWorkout['kind'], day: number, minutes: number, extra: Partial<HealthWorkout> = {}): HealthWorkout =>
  ({ id, kind, start: at(day, 7), end: at(day, 8), minutes, kcal: null, app: 'Workout', ...extra });
const row = (table: Row['table'], data: Row['data'], deleted_at: number | null = null): Row => ({ table, data, deleted_at, id: `${table}-${String(data.day ?? data.start_day)}`, owner_id: 'demo', device_id: 'synthetic', updated_at: 1 });
const source = (access: HealthAccess, workouts: HealthWorkout[]): HealthSource => ({
  access: async () => access, request: async () => {}, weights: async () => [], steps: async () => 0, sleep: async () => [],
  activeEnergy: async () => 0, exerciseMinutes: async () => 0, heart: async () => null, vo2Max: async () => null, water: async () => 0, mindful: async () => [], bodyFat: async () => [],
  workouts: jest.fn(async () => workouts),
});
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
afterEach(() => jest.useRealTimers());

describe('this week from Apple Health', () => {
  test('cardio this week counts; strength, last week, a paused day and a session also logged in Insight do not', () => {
    const read = healthWeek([
      workout('run', 'run', 10, 31.6),
      workout('swim', 'swim', 12, 20),
      workout('lift', 'strength', 11, 45),
      workout('yoga', 'yoga', 11, 30),
      workout('old', 'cycle', 8, 60), // Sunday of last week
      workout('watch-treadmill', 'walk', 13, 40), // the Insight treadmill session on Friday, recorded by a watch
      workout('paused', 'row', 14, 25),
    ], [row('cardio_sessions', { day: '2026-11-13', kind: 'treadmill', duration_ms: 2_400_000 })], [row('pauses', { start_day: '2026-11-14', end_day: null })], '2026-11-14');
    expect(read.workouts.map(w => [w.id, w.status])).toEqual([
      ['paused', 'paused'], ['watch-treadmill', 'logged'], ['swim', 'counted'], ['lift', 'notCardio'], ['yoga', 'notCardio'], ['run', 'counted'],
    ]);
    expect(read.minutes).toBeCloseTo(51.6);
  });
  test('a deleted Insight session no longer hides the Health workout, and another machine does not match', () => {
    const read = healthWeek([workout('ride', 'cycle', 13, 30), workout('run', 'run', 13, 20)],
      [row('cardio_sessions', { day: '2026-11-13', kind: 'bike', duration_ms: 1_800_000 }, 5), row('cardio_sessions', { day: '2026-11-13', kind: 'rower', duration_ms: 600_000 })], [], '2026-11-14');
    expect(read.workouts.map(w => w.status)).toEqual(['counted', 'counted']);
    expect(read.minutes).toBe(50);
  });
  test('a separate walk the same day as a shorter treadmill session counts on its own', () => {
    const read = healthWeek([workout('walk', 'walk', 13, 30)], [row('cardio_sessions', { day: '2026-11-13', kind: 'treadmill', duration_ms: 1_200_000 })], [], '2026-11-14');
    expect(read.workouts.map(w => w.status)).toEqual(['counted']);
    expect(read.minutes).toBe(30);
  });
  test('one Insight session hides only one Health workout, the closest in length', () => {
    const read = healthWeek([
      workout('morning', 'run', 13, 21, { start: at(13, 7) }),
      workout('evening', 'run', 13, 19, { start: at(13, 18) }),
    ], [row('cardio_sessions', { day: '2026-11-13', kind: 'treadmill', duration_ms: 1_200_000 })], [], '2026-11-14');
    expect(read.workouts.filter(w => w.status === 'logged')).toHaveLength(1);
    expect(read.minutes).toBe(read.workouts.find(w => w.status === 'counted')!.minutes);
  });
  test('two Insight sessions and two watch recordings of them pair up one to one', () => {
    const sessions = [
      { ...row('cardio_sessions', { day: '2026-11-13', kind: 'treadmill', duration_ms: 1_200_000 }), id: 'short' },
      { ...row('cardio_sessions', { day: '2026-11-13', kind: 'treadmill', duration_ms: 3_600_000 }), id: 'long' },
    ];
    const read = healthWeek([workout('a', 'walk', 13, 22), workout('b', 'run', 13, 58), workout('c', 'walk', 13, 40)], sessions, [], '2026-11-14');
    expect(Object.fromEntries(read.workouts.map(w => [w.id, w.status]))).toEqual({ a: 'logged', b: 'logged', c: 'counted' });
    expect(read.minutes).toBe(40);
  });
  test('a session with no usable length hides nothing', () => {
    const read = healthWeek([workout('walk', 'walk', 13, 30)], [row('cardio_sessions', { day: '2026-11-13', kind: 'treadmill', duration_ms: null })], [], '2026-11-14');
    expect(read.workouts.map(w => w.status)).toEqual(['counted']);
  });
  test('the week starts at local midnight on Monday', () => {
    expect(mondayOf(at(14, 15))).toEqual(new Date(2026, 10, 9));
    expect(mondayOf(new Date(2026, 10, 9, 0, 5))).toEqual(new Date(2026, 10, 9));
    expect(mondayOf(new Date(2026, 10, 15, 23))).toEqual(new Date(2026, 10, 9));
  });
});

describe('Cardio screen', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(at(14, 15)); });
  test('adds counted Health minutes to the ring, lists each workout with its app, and saves nothing', async () => {
    const repository = memoryRepository();
    repository.save('cardio_sessions', { day: '2026-11-13', kind: 'treadmill', duration_ms: 1_200_000, distance_m: null, notes: '' });
    const health = source('asked', [workout('run', 'run', 10, 31.6, { kcal: 301.4, app: 'Workout' }), workout('lift', 'strength', 11, 45, { app: 'Strong' })]);
    await render(<Cardio repository={repository} health={health} />, { wrapper });
    expect(await screen.findByText('From Apple Health')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 51.6 });
    expect(screen.getByText('Includes 32 min of workouts from Apple Health.')).toBeTruthy();
    expect(screen.getByText('Run')).toBeTruthy();
    expect(screen.getByText('301 kcal measured')).toBeTruthy();
    expect(screen.getByText('Recorded by Strong')).toBeTruthy();
    expect(screen.getByText('Counts toward your weekly goal')).toBeTruthy();
    expect(screen.getByText('Not counted toward the cardio goal')).toBeTruthy();
    expect(health.workouts).toHaveBeenCalledWith(new Date(2026, 10, 9), expect.any(Date));
    // Health workouts never become rows or local values, so they cannot sync.
    expect(repository.list('cardio_sessions')).toHaveLength(1);
    expect(JSON.stringify(repository.list('cardio_sessions'))).not.toContain('301');
  });
  test('before Apple Health is connected nothing is read or shown', async () => {
    const health = source('ask', [workout('run', 'run', 10, 30)]);
    await render(<Cardio repository={memoryRepository()} health={health} />, { wrapper });
    await jest.runOnlyPendingTimersAsync();
    expect(health.workouts).not.toHaveBeenCalled();
    expect(screen.queryByText('From Apple Health')).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 0 });
  });
  test('coming back to Cardio after connecting Apple Health in Settings reads the workouts', async () => {
    // Codex review of #196, Nov 17: Cardio passed a constant "in front", so it never read again on return.
    let access: HealthAccess = 'ask';
    const health = { ...source('ask', [workout('run', 'run', 10, 30)]), access: async () => access };
    const repository = memoryRepository();
    const view = await render(<Cardio repository={repository} health={health} />, { wrapper });
    await jest.runOnlyPendingTimersAsync();
    expect(health.workouts).not.toHaveBeenCalled();
    jest.mocked(useFocused).mockReturnValue(false);
    await view.rerender(<Cardio repository={repository} health={health} />);
    access = 'asked';
    jest.mocked(useFocused).mockReturnValue(true);
    await view.rerender(<Cardio repository={repository} health={health} />);
    expect(await screen.findByText('From Apple Health')).toBeTruthy();
    jest.mocked(useFocused).mockReturnValue(true);
  });
  test('without Apple Health the screen is as before', async () => {
    await render(<Cardio repository={memoryRepository()} health={null} />, { wrapper });
    expect(screen.queryByText('From Apple Health')).toBeNull();
    expect(screen.queryByText(/from Apple Health/)).toBeNull();
  });
});
