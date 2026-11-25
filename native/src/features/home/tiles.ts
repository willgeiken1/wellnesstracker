import { readingOrder } from '@/features/tiles/geometry';
import { addEntry } from '@/features/tiles/model';
import { tilePage } from '@/features/tiles/registry';
import { tileLayoutKey, tileStoreFor, type TileStorage } from '@/features/tiles/store';
import type { LayoutEntry } from '@/features/tiles/types';

/**
 * What other parts of the app change on Home's tile layout: health tiles arriving when a health source is connected, and
 * the Insight Score switch in Settings. Home's layout itself lives in the tile engine (src/features/tiles); this is a thin
 * door onto it. Layout only: tile ids, never a health value.
 */
export type { TileStorage };
export const HOME_TILES_KEY = tileLayoutKey('home');
/** Tiles fed by Apple Health. They start off Home and are added when the person connects it. */
export const HEALTH_TILES: readonly string[] = ['steps', 'sleep', 'active', 'exercise', 'bodyFat', 'water', 'mindful'];
/** The health tiles an Oura ring can fill. On Android, where Apple Health does not exist, these are the only ones. */
export const RING_TILES: readonly string[] = ['steps', 'sleep'];

const homeStore = (storage: TileStorage) => tileStoreFor(storage, 'home');
/** Home's tiles as they are now: the grid's own state, so a change here shows on Home at once. */
export const homeLayout = (storage: TileStorage | null | undefined): LayoutEntry[] => storage ? homeStore(storage).getState().tiles : [];

/** Puts the health tiles on Home after whatever is there, in their starting size and style. Tiles already on Home stay as they are. */
export function addHealthTiles(storage: TileStorage | null | undefined, ids: readonly string[] = HEALTH_TILES): void {
  if (!storage) return;
  const cfg = tilePage('home'), was = homeLayout(storage);
  const next = ids.reduce((list, id) => list.some(e => e.id === id) ? list : addEntry(cfg, list, id), was);
  if (next.length !== was.length) homeStore(storage).setOrder(next);
}
/** The Insight Score switch in Settings and the tile on Home are one state. */
export const scoreOn = (storage: TileStorage | null | undefined) => homeLayout(storage).some(e => e.id === 'score');
/** Turning the Score on puts it first on Home as a wide tile, so the tiles after it keep their order; turning it off takes it away. */
export function setScoreOn(storage: TileStorage | null | undefined, on: boolean): void {
  if (!storage || scoreOn(storage) === on) return;
  const was = homeLayout(storage), rest = was.filter(e => e.id !== 'score');
  const score = on ? addEntry(tilePage('home'), [], 'score', 'M') : [];
  homeStore(storage).setOrder(readingOrder([...score, ...rest]));
}
