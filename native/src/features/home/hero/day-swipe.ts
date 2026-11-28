/**
 * Swiping the Home map to another day (mockup v23, s9.js "Day swipe" and "Day glide"). A sideways drag starts after 8 pt (10 pt of
 * vertical first hands the page its scroll), turns the globe with the finger and leans the day's words 35% of the way, fading them
 * to 45% at most; the week's glow leans a day per three quarters of the map's width. Let go past 64 pt, or flick faster than 0.5 pt
 * per ms, and the hero glides to the day on that side; otherwise everything springs back. Later days sit to the right, so a swipe
 * left goes forward. Past today or the start of the week the drag gives only 30% and never commits.
 */
export const SWIPE = { start: 8, cancel: 10, commit: 64, flick: 0.5, lean: 0.35, fade: 180, minOpacity: 0.45, edge: 0.3, weekSpan: 0.75 } as const;

/** On a day change the day's words leave toward the side the day went while the new day's words come in from the other side. */
export const GLIDE = { inX: 28, inMs: 420, outX: 36, outMs: 240, backMs: 360 } as const;

/** The day a swipe heads for: +1 (later) for a drag to the left, -1 (earlier) to the right. */
export const swipeDir = (dx: number) => (dx < 0 ? 1 : -1) as 1 | -1;
/** Whether there is a day on that side of `sel` (0 is a week ago, 6 is today). */
export const canGo = (sel: number, dir: number) => sel + dir >= 0 && sel + dir <= 6;

/** The drag as the hero shows it: held to 30% where there is no day on that side. */
export function swipeDrag(dx: number, sel: number) {
  'worklet';
  const dir = dx < 0 ? 1 : -1, open = sel + dir >= 0 && sel + dir <= 6;
  return open ? dx : dx * SWIPE.edge;
}
/** The words' lean and opacity for a shown drag. */
export function swipeLean(ex: number) {
  'worklet';
  return { x: ex * SWIPE.lean, opacity: Math.max(SWIPE.minOpacity, 1 - Math.abs(ex) / SWIPE.fade) };
}

/** Where a released swipe goes: the new day, or null to spring back. `vx` is the release speed in pt per second. */
export function swipeTarget(dx: number, vx: number, sel: number): number | null {
  const dir = swipeDir(dx);
  if (!canGo(sel, dir)) return null;
  const flick = Math.abs(vx) / 1000 > SWIPE.flick && (vx < 0) === (dx < 0);
  return Math.abs(dx) > SWIPE.commit || flick ? sel + dir : null;
}
