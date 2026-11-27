import { randomUUID } from 'node:crypto';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { localDatabase } from './server/sqlite';
import { memoryRepository } from './workout-repository';
import { Repository } from '../src/data/repository';
import { WorkoutStore } from '../src/data/workout/store';
import { seedDemo } from '../fixtures/demo';
import { ThemeProvider } from '../src/design/theme-provider';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { attributedDay, meals, saveFood, setTargets } from '../src/features/food/model';
import type { HealthDays } from '../src/features/health/days';
import { withDemoSleep } from '../src/features/home/demo-sleep';
import { buildTileData, type HomeInput } from '../src/features/home/tiles/data';
import { readAppData } from '../src/features/home/tiles/read';
import { heroInput } from '../src/features/home/hero/data';
import { heroView } from '../src/features/home/hero/model';
import { buildProgress } from '../src/features/progress/source';
import { weekScores } from '../src/features/score/days';
import { resetTileStores } from '../src/features/tiles';
import { tileEdit } from '../src/features/tiles/store';
import { useHealthDays } from '../src/features/health/use-health-days';

jest.mock('expo-sqlite', () => require('./server/expo-sqlite-stub'));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: () => true }));
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
jest.mock('../src/features/health/oura-client', () => ({ oura: () => null }));
jest.mock('../src/features/health/use-health-days', () => ({ useHealthDays: jest.fn(() => null) }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));
// A small stand-in for Reanimated: values settle at once, styles are computed once (as in tiles-ui).
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const React = jest.requireActual('react');
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
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual('react-native');
  const gesture = () => ({});
  return { GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: RN.View,
    usePanGesture: gesture, useTapGesture: gesture, useLongPressGesture: gesture };
});
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));

/* Home's hero and Progress show one day score for each day, worked out by one function. Made-up data only. */
const KJ = 4.184;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = (now: Date, n: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
const nulls = (n: number) => Array<number | null>(n).fill(null);
const health = (sleep: (number | null)[], steps: (number | null)[]): HealthDays => ({
  steps: [...nulls(30 - steps.length), ...steps], sleepHours: [...nulls(30 - sleep.length), ...sleep],
  activeKcal: null, exerciseMinutes: null, waterMl: null, mindfulMinutes: null, bodyFat: null,
});
const oats = (kcal: number) => ({ name: 'Sample oats', energy_kj: kcal * KJ, protein_g: kcal / 15, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null });

/** A made-up person: three finished workouts in the last ten days, food on four days, some nights and steps read. */
function person(repo: ReturnType<typeof memoryRepository>, now: Date) {
  const start = ago(now, 9);
  setTargets(repo, start, { energy_kj: 2200 * KJ, protein_g: 150, carbs_g: 200, fat_g: 60 }, start);
  for (const [n, min] of [[1, 50], [3, 40], [9, 60]] as const) {
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 9).getTime();
    const s = repo.save('sessions', { name: 'Legs', day: ago(now, n), started_at: t0, finished_at: t0 + min * 60000, duration_ms: min * 60000 });
    const e = repo.save('entries', { session_id: s.id, exercise: 'Squat', position: 0 });
    repo.save('sets', { entry_id: e.id, position: 0, weight_kg: 100, reps: 5 });
  }
  for (const [n, kcal] of [[0, 900], [1, 2300], [2, 1500], [4, 2150]] as const) saveFood(repo, ago(now, n), meals(repo)[0].id, oats(kcal), 1, undefined, ago(now, n));
}
/** Home's hero for the same data, read the way Home reads it. */
function heroScores(store: WorkoutStore, now: Date, h: HealthDays | null) {
  const input: HomeInput = { now, ...readAppData(store, now, h), weightGoalKg: null,
    health: h ? { steps: h.steps, activeKcal: null, exerciseMinutes: null, sleepHours: h.sleepHours, mindfulMinutes: null } : null,
    detail: null, recovery: null, sources: { activity: 'Apple Health', sleep: 'Apple Health', body: 'Apple Health' },
    goals: { steps: 10000, exercise: 30, active: 500, sleepHours: 8, mindful: 10 } };
  const view = heroView(heroInput(buildTileData(input), store, 'kcal', now, false, weekScores(store, now, h)));
  return view.week.map(d => d.empty ? null : d.pct);
}
const shown = (progress: (number | null)[], hero: (number | null)[]) => progress.map((p, i) => hero[i] == null ? null : p);

describe('one day score on Home and Progress', () => {
  test('for someone\'s own logs and readings, every day the hero shows a number has Progress\'s score', () => {
    const now = new Date(2026, 10, 20, 15), repo = memoryRepository(), store = new WorkoutStore(repo);
    person(repo, now);
    const h = health([7, null, 6, 8, 5, 7.5, 6.5], [4000, 12000, null, 8000, 0, 9000, 3000]);
    const progress = buildProgress({ store, now, demo: false, health: h, recovery: null, ring: null }).days.score.slice(-7);
    const hero = heroScores(store, now, h);
    expect(hero.filter(n => n != null).length).toBeGreaterThanOrEqual(5);
    expect(hero).toEqual(shown(progress, hero));
    expect(weekScores(store, now, h)).toEqual(progress);
  });

  test('Home\'s Insight Score and This week tiles read the same day score as the hero and Progress', () => {
    const now = new Date(2026, 10, 20, 15), repo = memoryRepository(), store = new WorkoutStore(repo);
    person(repo, now);
    const h = health([7, null, 6, 8, 5, 7.5, 6.5], [4000, 12000, null, 8000, 0, 9000, 3000]);
    const tiles = readAppData(store, now, h).score;
    const progress = buildProgress({ store, now, demo: false, health: h, recovery: null, ring: null });
    expect(tiles.slice(-7).map(d => d.value)).toEqual(weekScores(store, now, h));
    expect(tiles.slice(-7).map(d => d.value)).toEqual(progress.days.score.slice(-7));
    const today = tiles[tiles.length - 1];
    expect([today.training, today.food, today.recovery]).toEqual([progress.pillars.training, progress.pillars.food, progress.pillars.sleep]);
  });
  test('a first finished workout, with no food or health readings, gives the score tile today\'s score at once', () => {
    const now = new Date(2026, 10, 20, 15), repo = memoryRepository(), store = new WorkoutStore(repo), t0 = new Date(2026, 10, 20, 9).getTime();
    const s = repo.save('sessions', { name: 'Legs', day: dayKey(now), started_at: t0, finished_at: t0 + 3_600_000, duration_ms: 3_600_000 });
    repo.save('sets', { entry_id: repo.save('entries', { session_id: s.id, exercise: 'Squat', position: 0 }).id, position: 0, weight_kg: 100, reps: 5 });
    const score = readAppData(store, now, null).score;
    expect(score[score.length - 1].value).toBe(weekScores(store, now, null)[6]);
    expect(score[score.length - 1].value).toBe(100);
  });

  test('for the sample data, Home\'s week is Progress\'s last seven days of score history', async () => {
    const { db, repo: account, sqlite } = await localDatabase();
    try {
      const repo = new Repository(db, 'demo', account.device, randomUUID), now = new Date(2026, 10, 22, 16, 12);
      seedDemo(repo, now.getTime());
      const store = new WorkoutStore(repo);
      const progress = buildProgress({ store, now, demo: true, health: null, recovery: null, ring: null });
      const hero = heroScores(store, now, withDemoSleep(null, 'demo', 30));
      expect(hero.every(n => n != null)).toBe(true);
      expect(hero).toEqual(progress.days.score.slice(-7));
      // The Day score screen reads the same day: its pillars average to the hero's number for today.
      const p = progress.pillars, got = [p.training, p.food, p.sleep].filter((n): n is number => n != null);
      expect(Math.round(got.reduce((a, b) => a + b, 0) / got.length)).toBe(hero[6]);
      // The sample week's sleep on Progress is the same nights Home shows.
      expect(progress.days.sleep.slice(-7).map(x => Math.round(x! * 60))).toEqual(withDemoSleep(null, 'demo', 7)!.sleepHours!.map(x => Math.round(x! * 60)));
    } finally { sqlite.close(); }
  }, 60000);

  test('the hero Home draws says the same score as Progress for each day of the week', async () => {
    const now = new Date(), repo = memoryRepository(), store = new WorkoutStore(repo), day = attributedDay();
    person(repo, now);
    // Today's food goes on the Food tab's day, which is still yesterday before 4 a.m.
    if (day !== dayKey(now)) saveFood(repo, day, meals(repo)[0].id, oats(500), 1, undefined, day);
    const h = health([7, null, 6, 8, 5, 7.5, 6.5], nulls(7));
    jest.mocked(useHealthDays).mockReturnValue(h);
    jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
    resetTileStores(); tileEdit.end();
    const progress = buildProgress({ store, now, demo: false, health: h, recovery: null, ring: null }).days.score.slice(-7);
    await render(<Home />, { wrapper: ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider> });
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    const said = () => {
      const label = screen.getAllByLabelText(/Day score \d+\./)[0];
      return Number(/Day score (\d+)\./.exec(label.props.accessibilityLabel)![1]);
    };
    let checked = 0;
    for (let i = 6; i >= 0; i--) {
      if (i < 6) await fireEvent.press(screen.getByTestId(`home-hero-day-${i}`));
      if (progress[i] == null) continue;
      expect(said()).toBe(progress[i]);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });
});
