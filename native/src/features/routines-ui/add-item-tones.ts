/* Colours for the routines sheets. Every colour is a theme token, so each
   palette and both modes hold contrast. A routine stores a colour id; this
   maps the id to the token that draws it. */

import type { ThemeColors } from '@/design/tokens';

export type SlotToken = 'accent' | 'sleep' | 'food';

const SLOT: Readonly<Record<string, SlotToken>> = Object.freeze({ citrus: 'accent', lavender: 'sleep', pink: 'food' });

export function slotToken(color: unknown): SlotToken {
  return (typeof color === 'string' && SLOT[color]) || 'accent';
}

export function slotColor(colors: ThemeColors, color: unknown): string {
  return colors[slotToken(color)];
}

function channels(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null;
}

/** `share` of `a` over `b`, as a solid colour. Anything that is not #rrggbb comes back as it was. */
export function mixHex(a: string, b: string, share: number): string {
  const one = channels(a), two = channels(b);
  if (!one || !two) return a;
  return `#${one.map((value, index) => Math.round(value * share + two[index] * (1 - share)).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const rgb = channels(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The inset panel on a filled card (the amount readout, the take-away steps).
 * It shifts the fill away from the ink drawn on it: lighter under dark ink,
 * darker under light ink. So words on the veil never have less contrast than
 * words on the card itself.
 */
export function veil(fill: string, ink: string): string {
  return mixHex(fill, luminance(ink) < 0.5 ? '#ffffff' : '#000000', 0.82);
}
