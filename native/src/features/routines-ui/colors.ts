import type { ThemeColors } from '@/design/tokens';

/* The colour of a routine. A routine stores a colour id; the id names a theme
   token, so every palette and both modes supply their own colour for it.
   Nothing here is a fixed colour. */

/** Stored colour ids, in the order a new routine takes them. */
export const SLOT_IDS = ['citrus', 'lavender', 'pink'] as const;
export type SlotId = (typeof SLOT_IDS)[number];
type Token = 'accent' | 'sleep' | 'food';
const TOKEN: Record<SlotId, Token> = { citrus: 'accent', lavender: 'sleep', pink: 'food' };

/** The stored id as one this app knows. Anything else reads as the first. */
export function slotId(stored: unknown): SlotId {
  return (SLOT_IDS as readonly unknown[]).includes(stored) ? (stored as SlotId) : 'citrus';
}

const channels = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast of two #RRGGBB colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** `from` with `share` of `to` mixed in, in sRGB. */
export function mix(from: string, to: string, share: number): string {
  const a = channels(from), b = channels(to);
  return `#${a.map((value, i) => Math.round(value + (b[i] - value) * share).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Small text and the text on a fill both need this much. */
export const SLOT_MIN_CONTRAST = 4.5;
const STEP = 0.04;

/** A token's colour, moved toward the text colour only as far as it takes to read as 13pt text on a card and
 * on a well, and to carry the on-accent ink when it is a fill. Most palettes need no move at all; a few have
 * a food or sleep colour too light, or too dark, for small text. */
export function legible(colors: ThemeColors, token: Token): string {
  const base = colors[token];
  const against = [colors.surface, colors['surface-2'], colors['on-accent']];
  for (let share = 0; share <= 1; share += STEP) {
    const tone = share ? mix(base, colors.text, share) : base;
    if (against.every(other => contrast(tone, other) >= SLOT_MIN_CONTRAST)) return tone;
  }
  return colors.text;
}

/** A routine's colour in this theme: for its name and time as text, its bar, its arc on the sun path, and as the
 * fill of a finished tick with the on-accent ink over it. */
export function slotColor(colors: ThemeColors, stored: unknown): string {
  return legible(colors, TOKEN[slotId(stored)]);
}
/** The peptide tools, the vial ring and the week cells take the second slot's colour. */
export const toolColor = (colors: ThemeColors) => legible(colors, 'sleep');
