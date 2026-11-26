import type { LayoutEntry, TilePos, TileSize } from './types';

/** The grid is laid out at 358 pt (true point size): two columns, 12 pt gaps. It only shrinks on a narrower screen and is centred on a wider one. */
export const GRID_W = 358;
export const GAP = 12;
/** Where the right-hand small tile starts. */
export const COL2 = 185;
export const FRAMES: Readonly<Record<TileSize, { w: number; h: number }>> = {
  S: { w: 173, h: 176 },
  M: { w: 358, h: 176 },
  L: { w: 358, h: 320 },
};
export const TILE_RADIUS = 20;
/** Header: 16 pt in, 20 pt tall; the body starts at 42 pt with a header and 16 pt without. */
export const PAD = 16;
export const HEAD_H = 20;
export const BODY_TOP = 42;
export const SIZE_RANK: Readonly<Record<TileSize, number>> = { S: 0, M: 1, L: 2 };

export interface GridLayout { pos: Record<string, TilePos>; h: number }

/** Two columns: a small tile takes the first open half row, medium and large take a full row. */
export function layoutTiles(list: readonly Pick<LayoutEntry, 'id' | 'size'>[]): GridLayout {
  const pos: Record<string, TilePos> = {};
  let y = 0, hole: number | null = null;
  for (const s of list) {
    const f = FRAMES[s.size] ?? FRAMES.S;
    if (s.size === 'S') {
      if (hole !== null) { pos[s.id] = { x: COL2, y: hole, w: f.w, h: f.h }; hole = null; }
      else { pos[s.id] = { x: 0, y, w: f.w, h: f.h }; hole = y; y += f.h + GAP; }
    } else { pos[s.id] = { x: 0, y, w: f.w, h: f.h }; y += f.h + GAP; }
  }
  return { pos, h: Math.max(0, y - GAP) };
}

/** The saved order is always the reading order (top to bottom, left to right), so what you see is what is stored. */
export function readingOrder<T extends Pick<LayoutEntry, 'id' | 'size'>>(list: readonly T[]): T[] {
  const p = layoutTiles(list).pos;
  return list.map((s, i) => ({ s, i })).sort((a, b) => (p[a.s.id].y - p[b.s.id].y) || (p[a.s.id].x - p[b.s.id].x) || a.i - b.i).map(x => x.s);
}

/**
 * While a tile is dragged: the order that lands it nearest the finger (cx, cy is the dragged tile's centre in grid
 * points), with 28 pt of stickiness so it does not flicker between slots. Null when the current order is best.
 */
export function bestOrder<T extends Pick<LayoutEntry, 'id' | 'size'>>(list: readonly T[], id: string, cx: number, cy: number): T[] | null {
  const me = list.find(s => s.id === id); if (!me) return null;
  const others = list.filter(s => s.id !== id);
  let best: T[] | null = null, bd = 1e9;
  for (let i = 0; i <= others.length; i++) {
    const c = others.slice(); c.splice(i, 0, me);
    const p = layoutTiles(c).pos[id], d = Math.hypot(p.x + p.w / 2 - cx, p.y + p.h / 2 - cy);
    if (d < bd - 0.5) { bd = d; best = c; }
  }
  const p0 = layoutTiles(list).pos[id], cur = Math.hypot(p0.x + p0.w / 2 - cx, p0.y + p0.h / 2 - cy);
  return best && bd < cur - 28 ? readingOrder(best) : null;
}

/** Resizing by the corner: the size the pulled corner asks for, or the nearest size this tile offers. */
export function sizeAt(ok: readonly TileSize[], current: TileSize, wantW: number, wantH: number): TileSize {
  const want: TileSize = wantH > 248 ? 'L' : wantW > 265 ? 'M' : 'S';
  if (ok.includes(want)) return want;
  return ok.slice().sort((a, b) => (Math.abs(SIZE_RANK[a] - SIZE_RANK[want]) - Math.abs(SIZE_RANK[b] - SIZE_RANK[want]))
    || (a === current ? -1 : b === current ? 1 : SIZE_RANK[a] - SIZE_RANK[b]))[0];
}

/** How far the corner has travelled to the size it asks for. A right-hand small tile has no room to its right, so sideways travel either way reads as wider. */
export function resizeTarget(ok: readonly TileSize[], current: TileSize, atRight: boolean, dx: number, dy: number): TileSize {
  const f = FRAMES[current];
  return sizeAt(ok, current, f.w + (atRight ? Math.abs(dx) : dx), f.h + dy);
}

/** The outline shown while resizing: the target frame, kept inside the grid. */
export function outlineFor(p: TilePos, target: TileSize): TilePos {
  const f = FRAMES[target];
  return { x: Math.min(p.x, GRID_W - f.w), y: p.y, w: f.w, h: f.h };
}

/** Scale and left margin that fit the 358 pt grid into the width the page gives it. */
export function fitGrid(avail: number): { k: number; left: number } {
  let k = Math.min(1, avail / GRID_W);
  if (Math.abs(k - 1) < 0.012) k = 1;
  return { k, left: Math.max(0, (avail - GRID_W * k) / 2) };
}
