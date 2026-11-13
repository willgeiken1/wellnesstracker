/**
 * Which tiles are on Home, in what order, and which small tiles are full width.
 * Layout only: tile ids, never a health value. Saved on this phone with the owner's other local settings.
 */
export const HOME_TILES_KEY = 'homeTiles';
/** Full-width sections first, then the small number tiles. This is also the starting order. */
export const TILE_IDS = ['map', 'week', 'next', 'calories', 'protein', 'volume', 'weight', 'steps', 'sleep'] as const;
export type TileId = typeof TILE_IDS[number];
/** Small tiles are half width unless made wide. The others are always full width. */
export const SMALL_TILES: readonly TileId[] = ['calories', 'protein', 'volume', 'weight', 'steps', 'sleep'];
export interface HomeTiles { order: TileId[]; wide: TileId[] }
export interface TileStorage { localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void }

const isTile = (value: unknown): value is TileId => (TILE_IDS as readonly unknown[]).includes(value);
const clean = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(isTile))] : null;
export const isSmall = (id: TileId) => SMALL_TILES.includes(id);
/** Tiles fed by Apple Health. They start off Home and are added when the person connects it. */
export const HEALTH_TILES: readonly TileId[] = ['steps', 'sleep'];
export const defaultTiles = (): HomeTiles => ({ order: TILE_IDS.filter(id => !HEALTH_TILES.includes(id)), wide: [] });
/** Puts the Apple Health tiles on Home, after whatever is there. Tile ids only: no health value is stored. */
export function addHealthTiles(storage: TileStorage | null | undefined): void {
  const next = HEALTH_TILES.reduce(addTile, loadTiles(storage));
  try { storage?.localSave(HOME_TILES_KEY, next); } catch { /* the tiles can still be added from Edit */ }
}

/** Reads a saved layout. Unknown ids are dropped and a missing or damaged save gives the starting layout, so Home never breaks. */
export function loadTiles(storage: TileStorage | null | undefined): HomeTiles {
  let saved: unknown;
  try { saved = storage?.localGet<unknown>(HOME_TILES_KEY); } catch { saved = undefined; }
  const order = saved && typeof saved === 'object' ? clean((saved as { order?: unknown }).order) : null;
  if (!order) return defaultTiles();
  return { order, wide: (clean((saved as { wide?: unknown }).wide) ?? []).filter(isSmall) };
}
export const offHome = (tiles: HomeTiles): TileId[] => TILE_IDS.filter(id => !tiles.order.includes(id));
export function addTile(tiles: HomeTiles, id: TileId): HomeTiles {
  return tiles.order.includes(id) ? tiles : { ...tiles, order: [...tiles.order, id] };
}
export function removeTile(tiles: HomeTiles, id: TileId): HomeTiles {
  return tiles.order.includes(id) ? { ...tiles, order: tiles.order.filter(item => item !== id) } : tiles;
}
/** Moves a tile one place up (-1) or down (1). The ends do nothing. */
export function moveTile(tiles: HomeTiles, id: TileId, by: -1 | 1): HomeTiles {
  const from = tiles.order.indexOf(id), to = from + by;
  if (from < 0 || to < 0 || to >= tiles.order.length) return tiles;
  const order = [...tiles.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...tiles, order };
}
export function setWide(tiles: HomeTiles, id: TileId, wide: boolean): HomeTiles {
  if (!isSmall(id) || tiles.wide.includes(id) === wide) return tiles;
  return { ...tiles, wide: wide ? [...tiles.wide, id] : tiles.wide.filter(item => item !== id) };
}
