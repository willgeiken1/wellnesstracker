import { render, screen } from '@testing-library/react-native';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import { seedDemo } from '../fixtures/demo';
import { TileFrame, tilePage, type TilePageId, type TileSize } from '../src/features/tiles';
import { TILE_UNITS } from '../src/features/tiles/look';
import { optionValues, optionsOf, sizesOf, stylesOf } from '../src/features/tiles/model';
import type { UnitKey } from '../src/features/settings/unit-override';
import type { Repository } from '../src/data/repository';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { registerHomeTiles } from '../src/features/home/tiles/register';
import '../src/features/food/tiles';
import '../src/features/workout/tiles';
import '../src/features/progress/tiles/body';
import '../src/features/progress/tiles/today';
import '../src/features/progress/tiles/more';

import { DAYS, type HomeInput } from '../src/features/home/tiles/data';
import { buildState, setHomeTileState } from '../src/features/home/tiles/state';
import { DEFAULT_UNITS } from '../src/features/home/tiles/studio';
import { publishProgress } from '../src/features/progress/store';
import { sampleProgress } from '../src/features/progress/sample';

registerHomeTiles();

// Home draws from the state the Home tab builds; a made-up day where every tile has a reading.
const NOW = new Date(2026, 10, 22, 16, 12);
const days = Array.from({ length: DAYS }, (_, i) => { const d = new Date(2026, 10, 22 - (DAYS - 1 - i)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const at = (h: number, m = 0) => new Date(2026, 10, 22, h, m);
const day = { kcal: 1640, protein: 96, carbs: 180, fat: 52, goalKcal: 2300, goalProtein: 150, logged: true,
  meals: [{ id: 'm1', name: 'Breakfast', kcal: 520, protein: 32, count: 2, loggedAt: at(8) }, { id: 'm2', name: 'Lunch', kcal: 1120, protein: 64, count: 3, loggedAt: at(13) }] };
const each = (v: number) => days.map((_, i) => v + (i % 5) * 7);
const HOME: HomeInput = {
  now: NOW, days, weightUnit: 'lb',
  water: { unit: 'oz', goal: 2.5, litres: days.map(() => 1.2), drinks: [{ at: at(9), oz: 16 }, { at: at(12), oz: 20 }], containers: [{ id: 'c1', name: 'Glass', oz: 8, icon: 'glass', quick: true }] },
  food: days.map(() => day), nextMeal: { id: 'dinner', name: 'Dinner' }, recentFoods: [{ name: 'Oats', serving: '1 cup', kcal: 300, protein: 10 }],
  weighIns: days.map((d, i) => ({ day: d, kg: 82 - i * 0.05, at: null })), weightGoalKg: 78,
  volumeKg: each(4000), volumeByGroupKg: { chest: 3200, back: 2800, legs: 5400 }, volumeLastWeekKg: 21000, workoutsThisWeek: 3,
  active: null, upNext: 'Push day · 5 exercises',
  health: { steps: each(7000), activeKcal: each(480), exerciseMinutes: each(32), sleepHours: each(7), mindfulMinutes: each(10) },
  detail: { stepsHourly: Array(24).fill(300), activeHourly: Array(24).fill(20), exerciseHourly: Array(24).fill(1), bedtimes: days.map(() => 23),
    night: { bed: new Date(2026, 10, 21, 23), wake: at(6, 45), stages: [['core', 0, 2], ['deep', 2, 3.5], ['rem', 3.5, 5], ['core', 5, 7.75]] },
    mindful: [{ start: at(7), minutes: 10 }], bodyFat: days.map((_, i) => ({ at: new Date(2026, 10, 22 - (DAYS - 1 - i), 7), percent: 18 - i * 0.02 })) },
  recovery: { hrv: each(55), rhr: each(58), sleepScore: each(80), source: 'Apple Health' },
  score: days.map(() => ({ value: 72, training: 70, food: 75, recovery: 71 })),
  sources: { activity: 'Apple Health', sleep: 'Apple Health', body: 'Apple Health' },
  goals: { steps: 8000, exercise: 30, active: 500, sleepHours: 8, mindful: 10 },
};
beforeAll(() => { setHomeTileState(buildState(HOME, DEFAULT_UNITS, () => {})); publishProgress(sampleProgress('2026-11-22', 'lb', NOW.getTime())); });

// Each unit the tile editor offers for a tile has to change what that tile draws, or the row would be a switch that does nothing.
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));

// The demo's made-up sample week, so every tile has something to draw.
let repo: Repository;
// The clock stands still, so a running workout's timer reads the same each time a tile is drawn.
beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 10, 22, 16, 12) }); repo = memoryRepository() as unknown as Repository; seedDemo(repo); });
afterAll(() => { jest.useRealTimers(); });
const auth = (): AuthState => ({ session: null, demo: true, ready: true, configured: true, configError: null, repository: repo, pending: 0, conflicts: 0,
  syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null), createAccount: jest.fn(async () => null), signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}) });

const CHOICES: Record<UnitKey, [string, string]> = {
  weight: ['lb', 'kg'], energy: ['kcal', 'kJ'], water: ['floz', 'ml'], distance: ['mi', 'km'], height: ['ftin', 'cm'], clock: ['12', '24'],
};

function Frame({ page, id, style, size, pick, unit, v }: { page: TilePageId; id: string; style: string; size: TileSize; pick: Record<string, string>; unit: UnitKey; v: string }) {
  const { colors, mode } = useTheme();
  const cfg = tilePage(page), def = cfg.tiles.find(d => d.id === id)!;
  const options = { ...optionValues(def, style, pick), [`u.${unit}`]: v };
  return <TileFrame cfg={cfg} def={def} entry={{ style, size, options }} colors={colors} mode={mode} reduceMotion preview />;
}
async function drawn(p: Parameters<typeof Frame>[0]) {
  await render(<AuthContext.Provider value={auth()}><ThemeProvider><Frame {...p} /></ThemeProvider></AuthContext.Provider>);
  // Home's drawings carry an id per mount; it says nothing about what the tile shows.
  const out = JSON.stringify(screen.toJSON()).replace(/hr[0-9a-z]+(?=-)/g, 'hr').replace(/"(name|brushRef)":"[^"]*"/g, '"$1":""'); await screen.unmount(); return out;
}

describe('tile units', () => {
  const rows = Object.entries(TILE_UNITS).flatMap(([k, units]) => units!.map(u => [k, u] as const));
  it.each(rows)('%s follows its own %s unit', async (key, unit) => {
    const [page, id] = key.split(':') as [TilePageId, string];
    const def = tilePage(page).tiles.find(d => d.id === id);
    expect(def).toBeTruthy();
    const [a, b] = CHOICES[unit];
    // The demo's plan day is under way, so Up next shows the day after it only once that workout is done.
    if (key === 'training:next') {
      repo = memoryRepository() as unknown as Repository; seedDemo(repo);
      const w = new WorkoutStore(repo), live = w.active();
      if (live) w.finish(live.id, { startedAt: Number(live.data.started_at), finishedAt: Date.now(), notes: '' }, Date.now());
    }
    // Some style, size and Shows choice of the tile draws the unit; most draw it in every one.
    let changed = false;
    for (const st of stylesOf(def!)) {
      const picks: Record<string, string>[] = [{}, ...optionsOf(def!, st.key).flatMap(op => op.choices.map(c => ({ [op.id]: String(c[0]) })))];
      for (const size of sizesOf(def!, st.key)) for (const pick of picks) {
        if (changed) break;
        changed = await drawn({ page, id, style: st.key, size, pick, unit, v: a }) !== await drawn({ page, id, style: st.key, size, pick, unit, v: b });
      }
    }
    expect(changed).toBe(true);
  });
});
