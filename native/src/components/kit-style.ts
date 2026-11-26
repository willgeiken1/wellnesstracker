import { createContext, useContext } from 'react';
import { Platform, type Insets, type TextStyle } from 'react-native';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';

/* The kit's shared measures, colours and type, read from the mockup's kit.css. Sizes are points. */

/** No text in the app is drawn smaller than this, whatever a mockup class asked for. */
export const MIN_TEXT = 11;
/** The smallest square a finger has to hit. Controls drawn smaller grow invisibly with hitSlop. */
export const TOUCH = 44;
/** The page gutter and the gaps the kit uses between blocks. */
export const KIT = {
  gutter: 16, gap: 12, gap3: 10,
  radius: { card: 20, list: 20, field: 14, search: 12, seg: 12, segItem: 10, sheet: 24, toast: 18, ic: 10, empty: 16, pill: 999 },
} as const;

const FAMILY = { 500: tokens.font.body, 600: tokens.font.bodyStrong, 700: tokens.font.heading } as const;
export type Weight = keyof typeof FAMILY;

/**
 * A CSS `font: <weight> <size>px/<lineHeight>` with `letter-spacing: <em>em`, as React Native text style.
 * Leave `lineHeight` out where the mockup leaves it as `normal`. Sizes under 11 pt draw at 11.
 */
export function font(weight: Weight, size: number, lineHeight?: number, letterSpacingEm?: number): TextStyle {
  const s = Math.max(MIN_TEXT, size);
  return {
    fontFamily: FAMILY[weight], fontSize: s,
    ...(lineHeight ? { lineHeight: Math.round(s * lineHeight * 100) / 100 } : {}),
    ...(letterSpacingEm != null ? { letterSpacing: Math.round(letterSpacingEm * s * 1000) / 1000 } : {}), // 0 too: a nested unit drops its number's tracking
  };
}
/** The final design's eyebrows (`.eyebrow`, `.ph .eb`) are small capitals, widely tracked. Every kit eyebrow takes its
 * capitals from here, so they stay in one place. */
export const capitals: TextStyle = { textTransform: 'uppercase' };
/** The design wraps every paragraph so its last line is never one stray word (`text-wrap: pretty`). Spread on a Text. */
export const PRETTY = { lineBreakStrategyIOS: 'push-out' } as const;
/** The same on the web build, which has no such prop. */
export const prettyWeb = Platform.OS === 'web' ? ({ textWrapStyle: 'pretty' } as object as TextStyle) : null;
/** Numbers on stats, values and steppers keep their width as they change. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
/** A unit or note set inside a tabular number goes back to the face's own figures, as the design's `small` does. */
export const proportional: TextStyle = { fontVariant: ['proportional-nums'] };

/** hitSlop that grows a `width` x `height` control to at least 44 x 44. */
export function slopFor(width: number, height: number): Insets | undefined {
  const x = Math.max(0, Math.ceil((TOUCH - width) / 2)), y = Math.max(0, Math.ceil((TOUCH - height) / 2));
  return x || y ? { top: y, bottom: y, left: x, right: x } : undefined;
}

const hex = (c: string): [number, number, number, number] => {
  const m = /^#([0-9a-f]{3,8})$/i.exec(c.trim());
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map(ch => ch + ch).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const r = /^rgba?\(([^)]+)\)$/i.exec(c.trim());
  if (r) { const [a, b, d, e] = r[1].split(',').map(v => parseFloat(v)); return [a, b, d, e ?? 1]; }
  if (c === 'transparent') return [0, 0, 0, 0];
  throw new Error(`Not a colour the kit can mix: ${c}`);
};
const toHex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase();
const out = ([r, g, b, a]: [number, number, number, number]) =>
  a >= 0.999 ? `#${toHex(r)}${toHex(g)}${toHex(b)}` : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;

/** CSS `color-mix(in srgb, a <weight * 100>%, b)`. `b` may be `transparent`. */
export function mix(a: string, b: string, weight: number): string {
  const A = hex(a), B = hex(b), w = Math.min(1, Math.max(0, weight));
  const alpha = A[3] * w + B[3] * (1 - w);
  if (alpha <= 0) return 'rgba(0, 0, 0, 0)';
  // srgb mixing is premultiplied, so a transparent side does not darken the colour.
  const ch = (i: 0 | 1 | 2) => (A[i] * A[3] * w + B[i] * B[3] * (1 - w)) / alpha;
  return out([ch(0), ch(1), ch(2), alpha]);
}
/** A colour at `opacity`, as `color-mix(in srgb, c <opacity>%, transparent)`. */
export const alpha = (c: string, opacity: number) => mix(c, 'transparent', opacity);

/** Where a kit surface sits: on the page, on a sheet, or in a card or list that is itself on a sheet. */
export type Surface = 'page' | 'sheet' | 'sheet-inset';
export const SurfaceContext = createContext<Surface>('page');
/** The gap the parent stack puts between its children, so a section header can keep the mockup's exact margins. */
export const StackGapContext = createContext(0);

/** The theme's colours plus the ones kit.css derives from them, for the current mode. */
export function useKit() {
  const theme = useTheme();
  const surface = useContext(SurfaceContext);
  const c = theme.colors as unknown as Record<string, string>;
  const dark = theme.mode === 'dark';
  const derived = dark ? {
    pill: c.surface, pillInk: c.text, sheetBg: c.surface,
    scrim: alpha(mix(c.bg, '#000000', 0.55), 0.66),
    fill: c['surface-2'], segOn: mix(c.text, c['surface-2'], 0.1),
    cardEdge: undefined as string | undefined,
    lift: '0px 10px 28px rgba(0, 0, 0, 0.42), 0px 2px 6px rgba(0, 0, 0, 0.3)',
  } : {
    pill: c.text, pillInk: c.bg, sheetBg: c.bg,
    scrim: alpha(c.text, 0.32),
    fill: mix(c.text, c.bg, 0.06), segOn: c.surface,
    cardEdge: `0px 0px 0px 1px ${c.hair}, 0px 1px 2px ${alpha(c.text, 0.05)}` as string | undefined,
    lift: `0px 10px 26px ${alpha(c.text, 0.16)}, 0px 2px 6px ${alpha(c.text, 0.1)}`,
  };
  /** A card or list background: one step up on a dark sheet so it reads against the sheet. */
  const cardBg = dark && surface !== 'page' ? c['surface-2'] : c.surface;
  /** A chip or field background, which steps up again inside a card on a dark sheet. */
  const controlBg = !dark || surface === 'page' ? c.surface : surface === 'sheet' ? c['surface-2'] : mix(c.text, c['surface-2'], 0.09);
  /** A colour token by name (`accent`, `food`, `surface-2`), or the value itself when it is already a colour. */
  const tok = (name: string | undefined, fallback = 'accent') => {
    const key = name ?? fallback;
    return c[key] ?? c[({ surface2: 'surface-2', muted: 'text-muted', accent2: 'accent-2', tint: 'accent-tint', hair2: 'hair-2', onAccent: 'on-accent' } as Record<string, string>)[key] ?? ''] ?? key;
  };
  /** `color-mix(in srgb, color <weight>%, transparent)`: the kit's soft tints (16 percent for icons, badges, tinted buttons). */
  const tint = (color: string, weight: number) => alpha(color, weight);
  return { ...theme, c, dark, surface, cardBg, controlBg, tok, tint, ...derived };
}
