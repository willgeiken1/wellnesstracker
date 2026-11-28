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
/** The arc's label type: a 14 point name over a 13 point hint, in a bubble with 10 points each side, 8 points from its button. */
export const LABEL_TYPE = { name: 14, hint: 13, padX: 10, gap: 8 } as const;
/**
 * Where an action's name goes and how much room it has there. The top action sits where the arc meets the screen's right edge,
 * so its name goes on the left; every other name goes on the right, the way the Food arc reads. `room` is the widest the name's
 * bubble may be: up to 12 points from the screen edge on its side, 8 points clear of its button, so it never covers a button.
 */
export function labelPlace(width: number, itemX: number, top: boolean): { side: 'l' | 'r'; room: number } {
  const gap = LABEL_TYPE.gap;
  return top ? { side: 'l', room: Math.max(0, itemX - gap - 12) } : { side: 'r', room: Math.max(0, width - 12 - (itemX + 52 + gap)) };
}

/* Advance widths of Plus Jakarta Sans for characters 32 to 126, in thousandths of the font size: SemiBold for an action's name,
 * Medium for its hint. Worked out from the font files the app ships; kerning only ever narrows a line, so these never under-count. */
const ADV_NAME = [175, 341, 464, 873, 647, 1022, 774, 289, 351, 351, 520, 642, 328, 566, 347, 481, 716, 392, 598, 611, 646, 615, 601, 554, 631, 601, 347, 367, 642, 642, 642, 555, 928, 692, 692, 777, 741, 601, 584, 813, 734, 272, 390, 671, 539, 874, 739, 878, 646, 878, 654, 647, 532, 712, 682, 1008, 640, 648, 576, 382, 481, 382, 642, 641, 372, 578, 670, 606, 670, 613, 402, 655, 586, 245, 245, 567, 245, 919, 586, 653, 670, 670, 362, 512, 405, 586, 550, 855, 535, 569, 471, 371, 363, 371, 642];
const ADV_HINT = [173, 312, 429, 832, 646, 998, 754, 267, 323, 323, 499, 624, 299, 532, 317, 455, 724, 382, 599, 610, 638, 616, 599, 548, 629, 599, 317, 337, 624, 624, 624, 527, 928, 672, 692, 779, 741, 606, 583, 817, 735, 264, 386, 662, 535, 855, 738, 878, 645, 878, 648, 646, 522, 706, 667, 996, 618, 635, 580, 349, 455, 349, 624, 620, 362, 575, 669, 603, 669, 614, 397, 659, 580, 237, 237, 558, 237, 913, 580, 654, 669, 669, 350, 511, 396, 580, 533, 826, 511, 553, 460, 344, 332, 344, 624];
const lineWidth = (text: string, adv: readonly number[], size: number) => {
  let w = 0;
  for (const ch of text) { const c = ch.codePointAt(0) ?? 0; w += c >= 32 && c <= 126 ? adv[c - 32] : 1000; }
  return w * size / 1000;
};
/** How wide an action's bubble is with this name and hint. */
export const labelWidth = (name: string, hint: string) =>
  Math.max(lineWidth(name, ADV_NAME, LABEL_TYPE.name), lineWidth(hint, ADV_HINT, LABEL_TYPE.hint)) + 2 * LABEL_TYPE.padX;
/** The fullest hint that fits the room beside its button, from longest to shortest. When none fits (a long name the person
 * typed, or very large text), the last one is used and the bubble's text shrinks to fit rather than being cut short. */
export function fitHint(name: string, hints: readonly string[], room: number): string {
  return hints.find(h => labelWidth(name, h) <= room) ?? hints[hints.length - 1] ?? '';
}

/** The shell's springs, as stiffness and damping on a unit mass: the arc lands with a small overshoot, the open tab glides
 * and barely settles, sheets rise. */
export const SPRINGS = { open: { stiffness: 330, damping: 21 }, tab: { stiffness: 420, damping: 34 }, sheet: { stiffness: 300, damping: 32 } } as const;
/** How far a control shrinks under a finger, the way the mockup shows a press on the bar and the arc (a shrink, not a dim; see press.ts). */
export const PRESS_SCALE = 0.86, ITEM_PRESS_SCALE = 0.92;
