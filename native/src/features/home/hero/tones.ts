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
