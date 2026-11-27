import type { TileRenderer } from './types';

const PENDING = new WeakSet<TileRenderer>();

/**
 * A placeholder renderer for a tile whose body a page packet has not built yet. It draws an empty body; the frame
 * draws the tile's header for it (even for head: false tiles), so the grid, tray and edit mode work in full meanwhile.
 * Replace it with implementTile() (registry.ts) from the page's own folder.
 */
export function pendingTile(page: string, id: string, style?: string): TileRenderer {
  const render: TileRenderer = () => null;
  Object.defineProperty(render, 'name', { value: `pending_${page}_${id}${style ? '_' + style : ''}` });
  PENDING.add(render);
  return render;
}
export const isPending = (render: unknown): boolean => typeof render === 'function' && PENDING.has(render as TileRenderer);
