import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { HOME_TILES_KEY, homeLayout } from '../src/features/home/tiles';
import { registerHomeTiles } from '../src/features/home/tiles/register';
import { discardSession } from '../src/features/workout/logger/model';
import { configureTileRoutes, configureTileToast, resetTileStores, tileEdit, tileStoreFor } from '../src/features/tiles';
import { trayDefs } from '../src/features/tiles/model';
import { tilePage } from '../src/features/tiles/registry';
import { loadTileLayout } from '../src/features/tiles/store';
import { TileGrid } from '../src/features/tiles/tile-grid';
import { TileTraySheet } from '../src/features/tiles/tray-sheet';
import { memoryRepository } from './workout-repository';

// Regression: cancelling a workout took the workout off Home and the tray had no way to add it back (TestFlight, Nov 27).
// The Workout tile is a Home tile of its own now, whatever the workout's state. Made-up workouts only.
let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useIsFocused: () => true, useLocalSearchParams: () => ({}) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));

registerHomeTiles();
const wrap = (ui: ReactNode) => render(<ThemeProvider>{ui}</ThemeProvider>);
const ids = () => homeLayout(mockRepository as never).map(e => e.id);
const routes = { tray: jest.fn(), customize: jest.fn(), section: jest.fn(), close: jest.fn() };

function startWorkout() {
  const store = new WorkoutStore(mockRepository);
  const session = store.start();
  const squat = store.addExercise(session.id, 'Squat', 2);
  store.editDraft(squat.id, 0, { weight: '135', reps: '5' });
  store.toggleDone(squat.id, 0);
  return { store, session };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRepository = memoryRepository();
  resetTileStores(); tileEdit.end();
  configureTileRoutes(routes); configureTileToast(() => {});
  Object.values(routes).forEach(f => f.mockClear());
});
afterEach(() => { jest.useRealTimers(); });

test('Home starts with the Workout tile, drawn by its own renderer rather than a stub', () => {
  expect(ids()).toContain('workout');
  const def = tilePage('home').tiles.find(d => d.id === 'workout')!;
  expect(def.group).toBe('Training');
  expect(def.open).toBeDefined();
});

test('with no workout the tile offers to start one, as in the design', async () => {
  await wrap(<TileGrid page="home" storage={mockRepository as never} />);
  expect(screen.getByText('Nothing in progress')).toBeTruthy();
  expect(screen.getByLabelText('Start Empty workout')).toBeTruthy();
});

test('cancelling a workout keeps the tile on Home, and it offers a new start', async () => {
  const { store, session } = startWorkout();
  await wrap(<TileGrid page="home" storage={mockRepository as never} />);
  expect(screen.getAllByText('Resume').length).toBeGreaterThan(0);
  await act(async () => { discardSession(store, session.id); });
  expect(ids()).toContain('workout');
  expect(screen.getByText('Nothing in progress')).toBeTruthy();
  expect(screen.getByLabelText('Start Empty workout')).toBeTruthy();
  // Nothing about the workout was written into the layout.
  expect(JSON.stringify(mockRepository.localGet(HOME_TILES_KEY) ?? null)).not.toMatch(/Squat|135/);
});

test('finishing a workout keeps the tile on Home', async () => {
  const { store, session } = startWorkout();
  await wrap(<TileGrid page="home" storage={mockRepository as never} />);
  await act(async () => { store.finish(session.id, { startedAt: Date.now() - 1_800_000, finishedAt: Date.now(), notes: '' }); });
  expect(ids()).toContain('workout');
  expect(screen.getByText('Nothing in progress')).toBeTruthy();
});

test('a restart reloads the saved layout with the tile still there', () => {
  const store = tileStoreFor(mockRepository as never, 'home');
  store.setSize('workout', 'L');
  const { store: workouts, session } = startWorkout();
  discardSession(workouts, session.id);
  resetTileStores();
  expect(loadTileLayout(mockRepository as never, 'home').find(e => e.id === 'workout')?.size).toBe('L');
  expect(ids()).toContain('workout');
});

test('a Home saved by an earlier build without the tile gets it back after Next, once', () => {
  mockRepository.localSave(HOME_TILES_KEY, { v: 1, tiles: [['next', 'M', 'B', {}], ['protein', 'S', 'A', {}], ['water', 'S', 'E', {}]] });
  expect(loadTileLayout(mockRepository as never, 'home').map(e => [e.id, e.size])).toEqual([['next', 'M'], ['workout', 'M'], ['protein', 'S'], ['water', 'S']]);
  // With Next gone too, it goes first.
  mockRepository.localSave(HOME_TILES_KEY, { v: 1, tiles: [['water', 'S', 'E', {}]] });
  expect(loadTileLayout(mockRepository as never, 'home').map(e => e.id)).toEqual(['workout', 'water']);
  // Any later change saves the layout as current, so the repair is not repeated over what the person does next.
  tileStoreFor(mockRepository as never, 'home').setSize('water', 'M');
  expect((mockRepository.localGet(HOME_TILES_KEY) as { rev: number }).rev).toBe(1);
});

test('a tile the person removes stays removed after a restart, and the tray offers it back', async () => {
  tileStoreFor(mockRepository as never, 'home').remove('workout');
  resetTileStores();
  expect(ids()).not.toContain('workout');
  expect(trayDefs(tilePage('home'), homeLayout(mockRepository as never)).map(d => d.id)).toContain('workout');
  await wrap(<TileTraySheet page="home" storage={mockRepository as never} />);
  await fireEvent.press(screen.getByLabelText('Add Workout to Home, Medium'));
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(routes.close).toHaveBeenCalled();
  expect(ids()).toContain('workout');
});

test('the tray offers every Home tile that is not on Home', () => {
  const cfg = tilePage('home'), on = homeLayout(mockRepository as never);
  const offered = trayDefs(cfg, on).map(d => d.id);
  for (const d of cfg.tiles) expect(on.some(e => e.id === d.id) || offered.includes(d.id)).toBe(true);
});
