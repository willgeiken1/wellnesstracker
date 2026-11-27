/** Where everything on the bar and in the quick action arc sits, worked out the way the mockup's shell does it.
 * All values are points in the tab screen's own coordinates (its full width and height). */

/** A tab at rest, the open tab and the + button, the room inside a pill, the gap between pieces and between tabs. */
export const DOCK = { ITEM: 46, ACTIVE: 56, PAD: 5, GAP: 8, IGAP: 4 } as const;
/** The bar's distance from the bottom edge: 24 points, or a little inside the home indicator's inset when that is larger. */
export const dockBottom = (insetBottom: number) => Math.max(24, insetBottom - 6);
/** Room a tab page leaves at its end so its last row scrolls clear of the bar and its fade (the mockup's 116 + bar offset). */
export const pageEndSpace = (insetBottom: number) => 116 + dockBottom(insetBottom);
/** The fade of the page colour behind the bar. */
export const fadeHeight = (insetBottom: number) => 106 + dockBottom(insetBottom);

const pillWidth = (n: number) => (n > 0 ? n * DOCK.ITEM + (n - 1) * DOCK.IGAP + 2 * DOCK.PAD : 0);

export interface DockLayout {
  /** Below 1 when the bar has to shrink to fit a narrow screen; it shrinks from its bottom centre. */
  scale: number;
  pillA: { x: number; width: number; shown: boolean };
  pillB: { x: number; width: number; shown: boolean };
  bubbleX: number;
  plusX: number;
  /** Per page in PAGES order: left edge, width, and whether it is on the bar (a hidden one shrinks away by its neighbour). */
  tabs: { x: number; width: number; shown: boolean }[];
  /** The + button's centre, for the arc. */
  plusCenter: { x: number; y: number };
}

/**
 * The bar for `count` pages with `visible` of them on it (indexes, in order) and `active` open. Tabs before the open one sit in a
 * pill on its left, the open one stands alone as the accent circle, the rest sit in a pill on its right, then the + button.
 */
export function layoutDock(width: number, height: number, insetBottom: number, count: number, visible: readonly number[], active: number): DockLayout {
  const { ITEM, ACTIVE, PAD, GAP, IGAP } = DOCK;
  const a = Math.max(0, visible.indexOf(active));
  const wA = pillWidth(a), wB = pillWidth(visible.length - 1 - a);
  const total = (wA ? wA + GAP : 0) + ACTIVE + (wB ? GAP + wB : 0) + GAP + ACTIVE;
  const scale = Math.min(1, (width - 16) / total);
  let x = (width - total) / 2;
  const startA = x + PAD;
  const pillA = wA ? { x, width: wA, shown: true } : { x, width: ACTIVE, shown: false };
  if (wA) x += wA + GAP;
  const ax = x; x += ACTIVE;
  const bx = x + GAP;
  const pillB = wB ? { x: bx, width: wB, shown: true } : { x: ax, width: ACTIVE, shown: false };
  if (wB) x = bx + wB;
  const plusX = x + GAP;
  const tabs = Array.from({ length: count }, (_, i) => {
    let j = visible.indexOf(i);
    const shown = j >= 0;
    if (!shown) { j = 0; visible.forEach((v, k) => { if (v < i) j = k; }); }
    const w = j === a ? ACTIVE : ITEM;
    const cx = j < a ? startA + j * (ITEM + IGAP) + ITEM / 2 : j === a ? ax + ACTIVE / 2 : bx + PAD + (j - a - 1) * (ITEM + IGAP) + ITEM / 2;
    return { x: cx - w / 2, width: w, shown };
  });
  const cy = height - dockBottom(insetBottom) - 28 * scale;
  return { scale, pillA, pillB, bubbleX: ax, plusX, tabs, plusCenter: { x: width / 2 + (plusX + ACTIVE / 2 - width / 2) * scale, y: cy } };
}

export interface ArcItem { x: number; y: number; from: { x: number; y: number } }
/**
 * The quick actions sweep up a quarter curve from the +: one row each, 62 points apart, the first closest to the thumb, so a name
 * and hint always fit beside its button. Returns each 52 point button's top-left corner open and closed, and where the caption
 * (page name and Customize) sits: its bottom edge's distance from the bottom of the screen.
 */
export function layoutArc(width: number, height: number, plus: { x: number; y: number }, n: number): { items: ArcItem[]; captionBottom: number } {
  const ROW = 62, ox = plus.x + 10, oy = plus.y + 30, rx = n > 4 ? 212 : 196;
  const y0 = plus.y - 86, yTop = y0 - (n - 1) * ROW, ry = (oy - yTop) / 0.995;
  let top = plus.y;
  const items = Array.from({ length: n }, (_, i) => {
    const cy = y0 - i * ROW, sn = Math.min(0.995, (oy - cy) / ry);
    const cx = Math.min(ox - rx * Math.sqrt(1 - sn * sn), width - 16 - 26);
    top = Math.min(top, cy - 26 - 14);
    return { x: cx - 26, y: cy - 26, from: { x: plus.x - 26, y: plus.y - 26 } };
  });
  return { items, captionBottom: height - top + 6 };
}
/** Which side of its button a name goes on: right while it fits, left near the top of the curve. Returns its left offset from the button. */
export function labelOffset(width: number, itemX: number, labelWidth: number): { left: number; side: 'l' | 'r' } {
  const cx = itemX + 26, right = width - 12 - (cx + 26 + 10) >= labelWidth;
  let left = right ? 52 + 10 : -10 - labelWidth;
  const abs = itemX + left;
  if (abs < 12) left += 12 - abs;
  return { left, side: right ? 'r' : 'l' };
}

/** The shell's springs, as stiffness and damping on a unit mass: the arc lands with a small overshoot, the open tab glides
 * and barely settles, sheets rise. */
export const SPRINGS = { open: { stiffness: 330, damping: 21 }, tab: { stiffness: 420, damping: 34 }, sheet: { stiffness: 300, damping: 32 } } as const;
/** How far a control shrinks under a finger, the way the mockup shows a press on the bar and the arc (a shrink, not a dim; see press.ts). */
export const PRESS_SCALE = 0.86, ITEM_PRESS_SCALE = 0.92;
