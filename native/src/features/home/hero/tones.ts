/**
 * The hero's own colours, derived from the app palette so every palette gets its own sky: the night globe, its limb, the
 * airglow (near and far), the graticule, ink and highlight. Pillar colours are the palette's Training, Food and Sleep.
 */
export interface HeroColors { base: string; limb: string; air: string; air2: string; grid: string; ink: string; hi: string; pillar: [string, string, string] }
export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
/** a mixed toward b by t, as hex. */
export function mixHex(a: string, b: string, t: number) {
  const x = hexRgb(a), y = hexRgb(b);
  return '#' + [0, 1, 2].map(i => { const v = Math.max(0, Math.min(255, Math.round((x[i] + (y[i] - x[i]) * t) * 255))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}
/** Colours as the theme names them (bg, accent, accent-2, text, surface, sleep, training, food). */
export function tones(c: Record<string, string>, mode: 'dark' | 'light'): HeroColors {
  const W = '#FFFFFF', K = '#000000', pillar: [string, string, string] = [c.training, c.food, c.sleep];
  if (mode !== 'light') return {
    base: mixHex(c.bg, K, 0.4), limb: mixHex(c.bg, c.accent, 0.12), air: mixHex(c.accent, W, 0.3), air2: mixHex(c.sleep, c.accent, 0.3),
    grid: mixHex(c.accent, c.bg, 0.2), ink: W, hi: mixHex(c['accent-2'], W, 0.35), pillar,
  };
  return {
    base: mixHex(mixHex(c.bg, c.text, 0.03), c.accent, 0.05), limb: c.surface, air: mixHex(c.accent, W, 0.1), air2: mixHex(c.accent, W, 0.45),
    grid: mixHex(c.text, c.accent, 0.3), ink: mixHex(c.text, c.bg, 0.06), hi: c['accent-2'], pillar,
  };
}

/**
 * The page-level colours around the globe (the CSS custom properties of the hero): the night under the page, the airglow
 * line, the isobar ink, gauge tracks, the bright point, the week globe's two stops, the selected day's glow and the stars.
 * Each is a palette colour or a mix of two; alpha travels separately where the design fades a colour out.
 */
export interface SkyTokens {
  deep: string; air: string; line: string; track: string; trackAlpha: number; hot: string; globeA: string; globeB: string;
  sel: string; selAlpha: number; star: string; halo: string; haloAlpha: number; rayHot: string | null; glow: number;
}
export function skyTokens(c: Record<string, string>, mode: 'dark' | 'light'): SkyTokens {
  const W = '#FFFFFF', deep = mixHex(c.bg, '#000000', 0.4);
  if (mode !== 'light') return {
    deep, air: mixHex(c.accent, W, 0.3), line: mixHex(c.accent, c['text-muted'], 0.2), track: W, trackAlpha: 0.1, hot: W,
    globeA: mixHex(c.accent, c.bg, 0.91), globeB: deep, sel: mixHex(c.accent, W, 0.3), selAlpha: 0.26, star: mixHex(c.accent, W, 0.75),
    halo: deep, haloAlpha: 0.86, rayHot: W, glow: 1,
  };
  return {
    deep, air: c.accent, line: mixHex(c.text, c.accent, 0.3), track: c.text, trackAlpha: 0.12, hot: c.text,
    globeA: c.surface, globeB: mixHex(mixHex(c.bg, c.text, 0.06), c.accent, 0.08), sel: c.accent, selAlpha: 0.14, star: c.accent,
    halo: c.bg, haloAlpha: 0.94, rayHot: null, glow: 0,
  };
}
