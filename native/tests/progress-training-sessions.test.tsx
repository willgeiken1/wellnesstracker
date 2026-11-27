import { render, screen } from '@testing-library/react-native';
import { WorkoutStore } from '../src/data/workout/store';
import { buildProgress } from '../src/features/progress/source';
import { publishProgress, resetProgressStore } from '../src/features/progress/store';
import '../src/features/progress/tiles/more';
import { tilePage } from '../src/features/tiles/registry';
import { createTheme } from '../src/design/tokens';
import { ThemeProvider } from '../src/design/theme-provider';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs';
import { memoryRepository } from './workout-repository';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

// Made-up sessions only.
const NOW = new Date(2026, 10, 11, 12), TODAY = '2026-11-11', YESTERDAY = '2026-11-10';
afterEach(() => resetProgressStore());

function logged(going: boolean) {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
  repo.save('cardio_sessions', { day: YESTERDAY, kind: 'run', duration_ms: 30 * 60000, distance_m: 5000, notes: '' });
  repo.save('cardio_sessions', { day: TODAY, kind: 'run', duration_ms: 20 * 60000, distance_m: 3000, notes: '' });
  repo.save('cardio_sessions', { day: TODAY, kind: 'ride', duration_ms: 40 * 60000, distance_m: null, notes: '' });
  if (going) repo.save('sessions', { day: TODAY, name: 'Synthetic push', started_at: NOW.getTime() - 15 * 60000, finished_at: null });
  return repo;
}
const build = (repo: ReturnType<typeof memoryRepository>, trainGoalMin?: number) =>
  buildProgress({ store: new WorkoutStore(repo), now: NOW, demo: false, health: null, recovery: null, ring: null, trainGoalMin });

describe('Progress training sessions', () => {
  test('two sessions on one day count as two, and the one going now is not counted', () => {
    const d = build(logged(true));
    expect(d.training.perDay.slice(-3)).toEqual([0, 1, 2]);
    expect(d.training.active).not.toBeNull();
  });

  test('the Training tile counts each finished session in the week, today included, beside the one going', async () => {
    publishProgress(build(logged(true)));
    const def = tilePage('progress').tiles.find(x => x.id === 'training')!;
    const draw = typeof def.render === 'function' ? def.render : (def.render as Record<string, typeof def.render>).S;
    const colors = createTheme('light'), box = { w: 160, h: 160 };
    await render(<ThemeProvider>{(draw as (p: never) => React.ReactNode)({ page: 'progress', id: 'training', size: 'S', style: 'A', options: { range: 'week' }, frame: box, body: box,
      colors, tint: colors.accent, mode: 'light', reduceMotion: true, editing: false, preview: false } as never)}</ThemeProvider>);
    expect(screen.getByText('3 sessions + 1 going')).toBeTruthy();
  });
});

describe('Progress training goal', () => {
  test('comes from the daily training goal in Settings, and follows a change', () => {
    const repo = logged(false);
    expect(build(repo).training.goalMin).toBe(DEFAULT_PREFS.goals.train);
    repo.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'goals.train', 45));
    expect(build(repo).training.goalMin).toBe(45);
    expect(build(repo, 30).training.goalMin).toBe(30);
  });
});
