import type { ThemeColors, ThemeMode } from '@/design/tokens';

type RGB = [number, number, number];
function rgb(hex: string): RGB {
  const h = hex.replace('#', '').slice(0, 6);
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as RGB;
}
const hex = (c: RGB) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** CSS color-mix(in srgb, a p%, b): p is a's share, 0 to 1. */
export const mix = (a: string, p: number, b: string) => { const x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(i => x[i] * p + y[i] * (1 - p)) as RGB); };
/** A colour at an alpha, as color-mix(in srgb, c p%, transparent) gives it. */
export const alpha = (c: string, a: number) => { const [r, g, b] = rgb(c); return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`; };

/** The shell's derived colours, as the kit defines them: the dock pill and its ink, the scrim behind the quick actions,
 * the lift shadow and the sheet colour. Dark: the pill is a surface with the text as ink (true black takes its own pill).
 * Light: the pill is the theme's ink with the background as its ink. */
export function shellColors(colors: ThemeColors, mode: ThemeMode) {
  const dark = mode === 'dark', trueBlack = dark && colors.bg.toUpperCase() === '#000000';
  const pill = dark ? (trueBlack ? colors.pill : colors.surface) : colors.text;
  const pillInk = dark ? colors.text : colors.bg;
  return {
    dark, pill, pillInk,
    sheet: dark ? colors.surface : colors.bg,
    /** Lists and cards inside a sheet: raised a step in dark, plain surface with an edge in light. */
    sheetList: dark ? colors['surface-2'] : colors.surface,
    scrim: dark ? alpha(mix(colors.bg, 0.55, '#000000'), 0.66) : alpha(mix(colors.bg, 0.96, colors.text), 0.72),
    lift: dark ? '0px 10px 28px rgba(0, 0, 0, 0.42), 0px 2px 6px rgba(0, 0, 0, 0.3)'
      : `0px 10px 26px ${alpha(colors.text, 0.16)}, 0px 2px 6px ${alpha(colors.text, 0.1)}`,
    /** The pill's and the + button's own shadow. */
    dockShadow: dark ? 'inset 0px 0px 0px 1px ' + colors['hair-2'] + ', 0px 4px 8px rgba(0, 0, 0, 0.18)' : `0px 4px 8px ${alpha(colors.text, 0.18)}`,
    plusShadow: dark ? 'inset 0px 0px 0px 1px ' + colors['hair-2'] + ', 0px 4px 8px rgba(0, 0, 0, 0.18)'
      : `inset 0px 0px 0px 1px ${colors.hair}, 0px 4px 8px ${alpha(colors.text, 0.16)}`,
    cardEdge: dark ? undefined : `0px 0px 0px 1px ${colors.hair}, 0px 1px 2px ${alpha(colors.text, 0.05)}`,
  };
}
