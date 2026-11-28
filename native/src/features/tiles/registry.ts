import { foodTiles } from './catalog/food';
import { homeTiles } from './catalog/home';
import { progressTiles } from './catalog/progress';
import { routinesTiles } from './catalog/routines';
import { trainingTiles } from './catalog/training';
import { isPending } from './pending';
import type { TileCover, TileDef, TileOptionValues, TilePageConfig, TilePageId, TileRender, TileRenderProps, TileSize } from './types';

const pages = new Map<TilePageId, TilePageConfig>();
for (const cfg of [homeTiles, trainingTiles, foodTiles, progressTiles, routinesTiles]) pages.set(cfg.id, cfg);

/** A page's tile configuration: its catalogue, tray sections and starting layout. */
export function tilePage(id: TilePageId): TilePageConfig {
  const cfg = pages.get(id);
  if (!cfg) throw new Error(`No tiles are registered for ${id}`);
  return cfg;
}
export const tilePageIds = () => [...pages.keys()];
/** Whether a route param names a page that has tiles. */
export const isTilePage = (p: unknown): p is TilePageId => typeof p === 'string' && (tilePageIds() as string[]).includes(p);

/** Registers (or replaces) a whole page configuration. */
export function registerTilePage(cfg: TilePageConfig): void { pages.set(cfg.id, cfg); }

export interface TileImplementation {
  render?: TileRender;
  meta?: (props: TileRenderProps) => string;
  open?: (options: TileOptionValues) => void;
  label?: string;
  cover?: TileCover;
  editExtra?: TileDef['editExtra'];
  /** For a tile with styles: the renderer and meta of each style by key. */
  styles?: Record<string, { render: TileRender; meta?: (props: TileRenderProps) => string }>;
}
/**
 * How a page packet builds a tile from its own folder: replaces the tile's pending renderer (and adds meta and what
 * a tap opens). Call it once at module load, before the page draws. Unknown pages or tiles throw, so a typo shows in tests.
 */
export function implementTile(page: TilePageId, id: string, impl: TileImplementation): void {
  const cfg = tilePage(page), at = cfg.tiles.findIndex(d => d.id === id);
  if (at < 0) throw new Error(`No ${id} tile on ${page}`);
  const def = cfg.tiles[at];
  const versions = def.versions?.map(v => impl.styles?.[v.key] ? { ...v, ...impl.styles[v.key] } : v);
  const next: TileDef = { ...def, ...(impl.render ? { render: impl.render } : null), ...(impl.meta ? { meta: impl.meta } : null),
    ...(impl.open ? { open: impl.open } : null), ...(impl.label ? { label: impl.label } : null),
    ...(impl.cover ? { cover: impl.cover } : null), ...(impl.editExtra ? { editExtra: impl.editExtra } : null), ...(versions ? { versions } : null) };
  const tiles = cfg.tiles.slice(); tiles[at] = next;
  pages.set(page, { ...cfg, tiles });
}

/** Tiles (and styles) on a page still drawn by a pending stub, for a packet's own checklist. */
export function pendingTiles(page: TilePageId): string[] {
  return tilePage(page).tiles.flatMap(d => d.versions?.length
    ? d.versions.filter(v => isPending(v.render) || (typeof v.render === 'object' && (['S', 'M', 'L'] as TileSize[]).some(z => isPending((v.render as Record<string, unknown>)[z])))).map(v => `${d.id}:${v.key}`)
    : isPending(d.render) ? [d.id] : []);
}
