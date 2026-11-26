import { COL2, FRAMES, GAP, GRID_W, bestOrder, fitGrid, layoutTiles, outlineFor, readingOrder, resizeTarget, sizeAt } from '../src/features/tiles/geometry';
import type { TileSize } from '../src/features/tiles/types';

const e = (id: string, size: TileSize) => ({ id, size });

describe('tile grid geometry', () => {
  it('uses the design frames: two columns of 173 pt with a 12 pt gap', () => {
    expect(GRID_W).toBe(358); expect(GAP).toBe(12); expect(COL2).toBe(185);
    expect(FRAMES).toEqual({ S: { w: 173, h: 176 }, M: { w: 358, h: 176 }, L: { w: 358, h: 320 } });
  });
  it('puts a small tile in the first open half row and wide tiles on their own rows', () => {
    const { pos, h } = layoutTiles([e('a', 'S'), e('b', 'L'), e('c', 'S'), e('d', 'M')]);
    expect(pos.a).toEqual({ x: 0, y: 0, w: 173, h: 176 });
    expect(pos.b).toEqual({ x: 0, y: 188, w: 358, h: 320 });
    // c fills the hole beside a, above b
    expect(pos.c).toEqual({ x: 185, y: 0, w: 173, h: 176 });
    expect(pos.d).toEqual({ x: 0, y: 520, w: 358, h: 176 });
    expect(h).toBe(696);
    expect(layoutTiles([]).h).toBe(0);
  });
  it('keeps the saved order in reading order', () => {
    expect(readingOrder([e('a', 'S'), e('b', 'L'), e('c', 'S')]).map(x => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('moves a dragged tile only once it is clearly nearer another slot', () => {
    const list = [e('a', 'S'), e('b', 'S'), e('c', 'M')];
    // a's own centre: nothing changes
    expect(bestOrder(list, 'a', 86.5, 88)).toBeNull();
    // dragged onto b's slot
    expect(bestOrder(list, 'a', 185 + 86.5, 88)?.map(x => x.id)).toEqual(['b', 'a', 'c']);
    // a little way toward it is not enough (28 pt stickiness)
    expect(bestOrder(list, 'a', 86.5 + 60, 88)).toBeNull();
    // a small tile pulled below the wide ones lands in the first open half row, which may be up beside another
    expect(bestOrder(list, 'a', 86.5, 464)).toBeNull();
    expect(bestOrder([e('a', 'S'), e('c', 'M'), e('d', 'M')], 'a', 86.5, 376 + 88)?.map(x => x.id)).toEqual(['c', 'd', 'a']);
  });
  it('resizes by the corner to the nearest size the tile offers', () => {
    expect(sizeAt(['S', 'M', 'L'], 'S', 300, 200)).toBe('M');
    expect(sizeAt(['S', 'M', 'L'], 'S', 200, 260)).toBe('L');
    expect(sizeAt(['S', 'M'], 'M', 200, 300)).toBe('M');
    expect(sizeAt(['M', 'L'], 'M', 100, 100)).toBe('M');
    // a right-hand small tile grows when pulled either way
    expect(resizeTarget(['S', 'M'], 'S', true, -120, 0)).toBe('M');
    expect(resizeTarget(['S', 'M'], 'S', false, -120, 0)).toBe('S');
    expect(outlineFor({ x: 185, y: 0, w: 173, h: 176 }, 'M')).toEqual({ x: 0, y: 0, w: 358, h: 176 });
  });
  it('fits the grid to the width the page gives it', () => {
    expect(fitGrid(361)).toEqual({ k: 1, left: 1.5 });
    expect(fitGrid(320).k).toBeCloseTo(320 / 358);
    expect(fitGrid(355).k).toBe(1);
  });
});

describe('first visit', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TILE_ENTRANCE, entranceDelay } = require('../src/features/tiles/tile-grid') as typeof import('../src/features/tiles/tile-grid');
  test('tiles rise 10 pt in 360 ms, 60 ms apart; Home waits for its hero and starts at 520 ms, other pages at 120 ms', () => {
    expect(TILE_ENTRANCE).toMatchObject({ ms: 360, step: 60, rise: 10 });
    expect(entranceDelay(0, false)).toBe(120);
    expect(entranceDelay(3, false)).toBe(300);
    expect(entranceDelay(0, true)).toBe(520);
    expect(entranceDelay(2, true)).toBe(640);
  });
});
