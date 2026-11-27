/**
 * How the hero's layers follow a swipe on Home. Each layer trails the page by its own share of the scroll, the date
 * least and the map most, so the space between the date, the greeting, the day's caption and score and the map opens as
 * the page moves, and settles back as it comes to rest. Pulling past the top stretches the same gaps. Reduce Motion
 * keeps every layer still with the page.
 */
export const SPREAD = {
  /** Share of an upward scroll each layer trails by (points per point scrolled). */
  up: { greet: 0.06, apex: 0.08, map: 0.18 },
  /** Share of a pull past the top each layer drops further by. */
  pull: { greet: 0.1, apex: 0.12, map: 0.22 },
  /** Scrolling past this many points adds nothing more: by then the hero has left the screen. */
  reach: 420,
  /** The backdrop's speed: it moves up at 70 percent of the page, each line layer a little faster than the one behind. */
  backdrop: [0.62, 0.7, 0.78] as readonly number[],
} as const;

export type SpreadLayer = 'greet' | 'apex' | 'map';

/** How far down `layer` sits from its place at rest, for a scroll offset `y` (negative while pulled past the top). */
export function spreadAt(layer: SpreadLayer, y: number, still = false): number {
  'worklet';
  if (still || !Number.isFinite(y)) return 0;
  if (y >= 0) return Math.min(y, SPREAD.reach) * SPREAD.up[layer];
  return -y * SPREAD.pull[layer];
}

/** How far up backdrop layer `i` (0 is farthest back) has moved for a scroll offset `y`; it stays put while pulled. */
export function backdropAt(i: number, y: number, still = false): number {
  'worklet';
  if (still || !Number.isFinite(y) || y <= 0) return 0;
  return -y * SPREAD.backdrop[Math.max(0, Math.min(SPREAD.backdrop.length - 1, i))];
}
