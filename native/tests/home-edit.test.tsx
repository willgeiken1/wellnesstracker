import { HEALTH_TILES, HOME_TILES_KEY, RING_TILES, addHealthTiles, homeLayout, scoreOn, setScoreOn, type TileStorage } from '../src/features/home/tiles';
import { loadTileLayout, resetTileStores, tileStoreFor } from '../src/features/tiles/store';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Home's layout lives in the tile engine; Home's own part is its starting tiles and the doors other screens use.
function storage(owner = 'edit-owner'): TileStorage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return { owner, data, localGet: <T,>(k: string) => data[k] as T | undefined, localSave: (k: string, v: unknown) => { data[k] = v; } } as TileStorage & { data: Record<string, unknown> };
}
const ids = (s: TileStorage) => homeLayout(s).map(e => e.id);
beforeEach(() => resetTileStores());

test('Home starts with Next, Workout, Protein, Water, Steps and Weight, in the design\'s sizes and styles', () => {
  expect(loadTileLayout(null, 'home').map(e => [e.id, e.size, e.style])).toEqual([
    ['next', 'M', 'B'], ['workout', 'M', 'A'], ['protein', 'S', 'A'], ['water', 'S', 'E'], ['steps', 'S', 'A'], ['weight', 'S', 'A'],
  ]);
  expect(HOME_TILES_KEY).toBe('tiles-home');
});

test('connecting a health source adds its tiles after what is there, once, as tile ids only', () => {
  const s = storage();
  addHealthTiles(s);
  expect(ids(s)).toEqual(['next', 'workout', 'protein', 'water', 'steps', 'weight', 'sleep', 'active', 'exercise', 'bodyFat', 'mindful']);
  addHealthTiles(s);
  expect(ids(s)).toHaveLength(11);
  // Saved where the grid reads it, so Home shows them at once and after a restart.
  resetTileStores();
  expect(ids(s)).toEqual(['next', 'workout', 'protein', 'water', 'steps', 'weight', 'sleep', 'active', 'exercise', 'bodyFat', 'mindful']);
  expect(JSON.stringify(s.data[HOME_TILES_KEY])).not.toMatch(/\d{3,}/);
  expect(HEALTH_TILES).toEqual(expect.arrayContaining(RING_TILES));
});

test('a tile the person removed comes back only when its source is connected again', () => {
  const s = storage();
  tileStoreFor(s, 'home').remove('steps');
  expect(ids(s)).not.toContain('steps');
  addHealthTiles(s, RING_TILES);
  expect(ids(s)).toEqual(expect.arrayContaining(['steps', 'sleep']));
});

test('the Insight Score switch and the tile on Home are one state', () => {
  const s = storage();
  expect(scoreOn(s)).toBe(false);
  setScoreOn(s, true);
  expect(scoreOn(s)).toBe(true);
  expect(ids(s)[0]).toBe('score');
  expect(tileStoreFor(s, 'home').getState().tiles.some(e => e.id === 'score')).toBe(true);
  setScoreOn(s, false);
  expect(scoreOn(s)).toBe(false);
  expect(ids(s)).toEqual(['next', 'workout', 'protein', 'water', 'steps', 'weight']);
});

test('with no account nothing is written and nothing breaks', () => {
  expect(() => addHealthTiles(null)).not.toThrow();
  expect(scoreOn(null)).toBe(false);
  expect(() => setScoreOn(undefined, true)).not.toThrow();
});

test('a failed local write leaves Home showing the change, saved again with the next change', () => {
  const s = storage();
  s.localSave = () => { throw new Error('disk full'); };
  expect(() => addHealthTiles(s)).not.toThrow();
  expect(ids(s)).toContain('sleep');
  expect(tileStoreFor(s, 'home').getState().unsaved).toBe(true);
});
