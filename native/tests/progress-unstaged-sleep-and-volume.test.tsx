import { render, screen } from '@testing-library/react-native';
import { WorkoutStore } from '../src/data/workout/store';
import { emptyProgress } from '../src/features/progress/model';
import { buildProgress } from '../src/features/progress/source';
import { publishProgress, resetProgressStore } from '../src/features/progress/store';
import '../src/features/progress/tiles/today';
import { tilePage } from '../src/features/tiles/registry';
import { createTheme } from '../src/design/tokens';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';

// Made-up nights and sets only.
const NOW = new Date(2026, 10, 11, 12), TODAY = '2026-11-11';
afterEach(() => resetProgressStore());
const nulls = (n: number) => Array<number | null>(n).fill(null);
const recovery = (night: { deep: number; core: number; rem: number; asleep: number; awake: number }) =>
  ({ night, hrv: nulls(30), restingHeartRate: nulls(30), heartToday: null, vo2Max: null });

describe('a night with sleep Apple Health gave no stage for', () => {
  test('plain asleep counts toward time asleep but never toward core', () => {
    const d = buildProgress({ store: new WorkoutStore(memoryRepository()), now: NOW, demo: false, health: null, recovery: recovery({ deep: 0, core: 0, rem: 0, asleep: 420, awake: 20 }), ring: null });
    expect(d.night).toMatchObject({ min: 440, core: 0, deep: 0, rem: 0, unstaged: 420, awake: 20 });
  });
  test('staged sleep keeps its stages, and plain asleep beside it stays apart', () => {
    const d = buildProgress({ store: new WorkoutStore(memoryRepository()), now: NOW, demo: false, health: null, recovery: recovery({ deep: 60, core: 200, rem: 80, asleep: 40, awake: 20 }), ring: null });
    expect(d.night).toMatchObject({ min: 400, core: 200, unstaged: 40 });
  });
  test('the Recovery tile shows the stages as unavailable when part of the night has none', async () => {
    const d = emptyProgress(TODAY, 'kg', NOW.getTime());
    d.night = { min: 400, deep: 60, core: 200, rem: 80, awake: 20, unstaged: 40, bed: null, wake: null, source: 'Apple Health', segments: null };
    publishProgress(d);
    const def = tilePage('progress').tiles.find(x => x.id === 'recovery')!;
    const draw = typeof def.render === 'function' ? def.render : (def.render as Record<string, typeof def.render>).L;
    const colors = createTheme('light'), box = { w: 340, h: 340 };
    await render(<ThemeProvider>{(draw as (p: never) => React.ReactNode)({ page: 'progress', id: 'recovery', size: 'L', style: 'A', options: { lead: 'sleep' }, frame: box, body: box,
      colors, tint: colors.accent, mode: 'light', reduceMotion: true, editing: false, preview: false } as never)}</ThemeProvider>);
    expect(screen.getByText('Sleep stages show when your ring sends them.')).toBeTruthy();
    expect(screen.queryByText('Core')).toBeNull();
  });
});

describe("Progress's training volume", () => {
  test('warm-ups add nothing, as on the workout summary', () => {
    const week = (warm: boolean) => {
      const store = new WorkoutStore(memoryRepository()), start = NOW.getTime() - 3 * 3_600_000;
      const s = store.start(undefined, start);
      const sets: [string, string, boolean][] = [...(warm ? [['40', '5', true] as [string, string, boolean]] : []), ['100', '5', false], ['100', '5', false]];
      const e = store.addExercise(s.id, 'Squat', sets.length);
      sets.forEach(([weight, reps, w], i) => { store.editDraft(e.id, i, { weight, reps, ...(w ? { tag: 'warmup' as const } : {}) }); store.toggleDone(e.id, i); });
      store.finish(s.id, { startedAt: start, finishedAt: start + 45 * 60_000, notes: '' });
      return buildProgress({ store, now: NOW, demo: false, health: null, recovery: null, ring: null }).training.weekVolumeKg;
    };
    const plain = week(false);
    expect(plain).toBeGreaterThan(0);
    expect(week(true)).toBeCloseTo(plain, 6);
  });
});
