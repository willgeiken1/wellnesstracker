import { render, screen } from '@testing-library/react-native';
import { WorkoutStore } from '../src/data/workout/store';
import { emptyProgress, HISTORY } from '../src/features/progress/model';
import { buildProgress } from '../src/features/progress/source';
import { publishProgress, resetProgressStore } from '../src/features/progress/store';
import '../src/features/progress/tiles/today';
import { tilePage } from '../src/features/tiles/registry';
import { createTheme } from '../src/design/tokens';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';

// Made-up nights and foods only.
const NOW = new Date(2026, 10, 11, 12), TODAY = '2026-11-11';
afterEach(() => resetProgressStore());

describe('Progress with an unknown calorie total', () => {
  test("today's food logged without calories stays unknown, not zero", () => {
    const repo = memoryRepository();
    repo.save('food_entries', { day: TODAY, name: 'Synthetic scanned bar', energy_kj: null, protein_g: 10, carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: 40 });
    const d = buildProgress({ store: new WorkoutStore(repo), now: NOW, demo: false, health: null, recovery: null, ring: null });
    expect(d.food.eatenKcal).toBeNull();
    expect(d.days.kcal[HISTORY - 1]).toBeNull();
  });
});

describe('the Recovery tile against the sleep goal', () => {
  test('time awake in the night does not count toward the goal', async () => {
    const d = emptyProgress(TODAY, 'kg', NOW.getTime());
    // Seven hours asleep and one hour awake, against an eight-hour goal.
    d.night = { min: 480, deep: 60, core: 300, rem: 60, awake: 60, bed: null, wake: null, source: 'Apple Health', segments: null };
    d.sleepGoalMin = 480;
    publishProgress(d);
    const def = tilePage('progress').tiles.find(x => x.id === 'recovery')!;
    const draw = typeof def.render === 'function' ? def.render : (def.render as Record<string, typeof def.render>).S;
    const colors = createTheme('light'), box = { w: 160, h: 160 };
    await render(<ThemeProvider>{(draw as (p: never) => React.ReactNode)({ page: 'progress', id: 'recovery', size: 'S', style: 'A', options: { lead: 'sleep' }, frame: box, body: box,
      colors, tint: colors.accent, mode: 'light', reduceMotion: true, editing: false, preview: false } as never)}</ThemeProvider>);
    expect(screen.queryByText('Goal met')).toBeNull();
    expect(screen.getByText(/60 min short/)).toBeTruthy();
  });
});
