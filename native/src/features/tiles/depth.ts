import type { ThemeColors, ThemeMode } from '@/design/tokens';

/**
 * The shared depth language of tiles: one light from above. Raised things are
 * lighter on top and cast a soft shadow down; recessed things are darker with a shadow on their top inner edge.
 * Each helper returns a plain spec (gradient stops, inner lines, CSS-like shadows) that TileSurface draws with Skia.
 */
function hex(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.replace(/./g, '$&$&');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
/** a mixed toward b by t (0..1), as hex. */
export function mix(a: string, b: string, t: number): string {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** CSS color-mix(in srgb, a p, b): p of a, the rest b. */
export const colorMix = (a: string, p: number, b: string) => mix(b, a, p);
export function rgba(h: string, a: number): string { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

export interface DepthShadow { x: number; y: number; blur: number; spread: number; color: string }
export interface DepthSpec {
  radius: number;
  /** Top-to-bottom gradient: [colour, offset 0..1]. */
  stops: [string, number][];
  /** Inset 1 pt line along the top inner edge (light from above). */
  topLine?: string;
  /** Inset 1 pt ring just inside the edge. */
  innerRing?: string;
  /** 1 pt ring just outside the edge (light mode hairline). */
  outerRing?: string;
  /** Inset shadow on the top inner edge (wells): [offsetY, blur, colour]. */
  sink?: [number, number, string];
  /** Inset 1 pt line on the bottom inner edge (wells). */
  bottomLine?: string;
  shadows: DepthShadow[];
}
const sh = (x: number, y: number, blur: number, spread: number, color: string): DepthShadow => ({ x, y, blur, spread, color });

/** The tile frame of every page made of tiles, from theme tokens. */
export function gridTile(c: ThemeColors, mode: ThemeMode): DepthSpec {
  if (mode === 'dark') return {
    radius: 20,
    stops: [[colorMix(c.surface, 0.955, c.text), 0], [c.surface, 0.46], [colorMix(c.surface, 0.9, c.bg), 1]],
    topLine: rgba(c.text, 0.08), innerRing: rgba(c.text, 0.04),
    shadows: [sh(0, 1, 1, 0, 'rgba(0,0,0,0.35)'), sh(0, 10, 24, -10, 'rgba(0,0,0,0.65)'), sh(0, 24, 48, -24, 'rgba(0,0,0,0.55)')],
  };
  return {
    radius: 20,
    stops: [[c.surface, 0], [c.surface, 0.46], [colorMix(c.surface, 0.45, c.bg), 1]],
    topLine: c.surface, outerRing: c.hair,
    shadows: [sh(0, 1, 2, 0, rgba(c.text, 0.06)), sh(0, 10, 24, -12, rgba(c.text, 0.22)), sh(0, 26, 50, -26, rgba(c.text, 0.2))],
  };
}
/** Home's tile frame (Tile Studio, TS2.depth.tile). */
export function studioTile(c: ThemeColors, mode: ThemeMode): DepthSpec {
  if (mode === 'dark') return {
    radius: 20,
    stops: [[mix(c.surface, '#FFFFFF', 0.045), 0], [c.surface, 0.46], [mix(c.surface, '#000000', 0.1), 1]],
    topLine: 'rgba(255,255,255,0.075)', innerRing: 'rgba(255,255,255,0.035)',
    shadows: [sh(0, 1, 1, 0, 'rgba(0,0,0,0.35)'), sh(0, 10, 24, -10, 'rgba(0,0,0,0.65)'), sh(0, 24, 48, -24, 'rgba(0,0,0,0.55)')],
  };
  return {
    radius: 20,
    stops: [['#FFFFFF', 0], ['#FFFFFF', 0.46], [mix('#FFFFFF', c.bg, 0.55), 1]],
    topLine: '#FFFFFF', innerRing: rgba(c.text, 0.045),
    shadows: [sh(0, 1, 2, 0, rgba(c.text, 0.06)), sh(0, 10, 24, -12, rgba(c.text, 0.22)), sh(0, 26, 50, -26, rgba(c.text, 0.2))],
  };
}
/** The deeper shadow of a tile lifted under the finger, from the same light above. */
export function liftShadows(c: ThemeColors, mode: ThemeMode): DepthShadow[] {
  return mode === 'dark'
    ? [sh(0, 26, 44, -14, 'rgba(0,0,0,0.6)'), sh(0, 10, 18, -8, 'rgba(0,0,0,0.4)')]
    : [sh(0, 26, 44, -14, rgba(c.text, 0.34)), sh(0, 10, 18, -8, rgba(c.text, 0.22))];
}
/** A recessed track or well inside a tile. */
export function well(c: ThemeColors, mode: ThemeMode, radius = 999): DepthSpec {
  return mode === 'dark'
    ? { radius, stops: [[mix(c.surface, '#000000', 0.34), 0], [mix(c.surface, '#000000', 0.18), 1]], sink: [1, 2, 'rgba(0,0,0,0.55)'], bottomLine: 'rgba(255,255,255,0.05)', shadows: [] }
    : { radius, stops: [[mix(c.bg, c.text, 0.07), 0], [c.bg, 1]], sink: [1, 2, rgba(c.text, 0.14)], bottomLine: 'rgba(255,255,255,0.9)', shadows: [] };
}
/** A raised fill in colour `fill` (bars, segments, pills, buttons). */
export function raised(fill: string, mode: ThemeMode, radius = 999): DepthSpec {
  const dk = mode === 'dark';
  return {
    radius,
    stops: [[mix(fill, '#FFFFFF', dk ? 0.22 : 0.16), 0], [fill, 0.55], [mix(fill, '#000000', dk ? 0.12 : 0.06), 1]],
    topLine: rgba('#FFFFFF', dk ? 0.35 : 0.45),
    shadows: [sh(0, 1, 2, 0, rgba('#000000', dk ? 0.45 : 0.1)), sh(0, 4, 10, -4, rgba(fill, dk ? 0.55 : 0.45))],
  };
}
/** A raised neutral plate inside a tile (a sub-card, a chip, a dial face). */
export function plate(c: ThemeColors, mode: ThemeMode, radius = 14): DepthSpec {
  return mode === 'dark'
    ? { radius, stops: [[mix(c.surface, '#FFFFFF', 0.07), 0], [mix(c.surface, '#FFFFFF', 0.02), 1]], topLine: 'rgba(255,255,255,0.08)',
      shadows: [sh(0, 1, 1, 0, 'rgba(0,0,0,0.35)'), sh(0, 6, 14, -8, 'rgba(0,0,0,0.6)')] }
    : { radius, stops: [['#FFFFFF', 0], [mix('#FFFFFF', c.bg, 0.5), 1]], topLine: '#FFFFFF', innerRing: undefined, outerRing: rgba(c.text, 0.05),
      shadows: [sh(0, 6, 14, -8, rgba(c.text, 0.25))] };
}
/** How far shadows reach past the shape, so the canvas that draws them is big enough. */
export function shadowReach(shadows: readonly DepthShadow[]) {
  let l = 2, t = 2, r = 2, b = 2;
  for (const s of shadows) {
    const e = s.blur + s.spread;
    l = Math.max(l, e - s.x); r = Math.max(r, e + s.x); t = Math.max(t, e - s.y); b = Math.max(b, e + s.y);
  }
  return { l: Math.ceil(l), t: Math.ceil(t), r: Math.ceil(r), b: Math.ceil(b) };
}
