import { memo } from 'react';
import { SvgXml } from 'react-native-svg';
import type { TileSize } from '../types';

/** The editor's own line glyphs, in the tile icons' style (24 grid, 1.75 stroke, round caps). */
const PATHS = {
  'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
  'chevron-right': '<path d="M9 18l6-6-6-6"/>',
  refresh: '<path d="M20 11.5A8 8 0 1 0 17.66 17.66"/><path d="M20 5.5v6h-6"/>',
  minus: '<path d="M5.5 12h13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
} as const;
export type EdGlyphName = keyof typeof PATHS;
const xml = (n: EdGlyphName) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${PATHS[n]}</svg>`;
export const EdGlyph = memo(function EdGlyph({ name, size, color }: { name: EdGlyphName; size: number; color: string }) {
  return <SvgXml xml={xml(name)} width={size} height={size} color={color} accessible={false} importantForAccessibility="no" />;
});

/** A size drawn as its shape in a 52 by 36 box: the part it fills, and outlined the room it leaves on a two-column row. */
export const SizeGlyph = memo(function SizeGlyph({ size, on, color }: { size: TileSize; on: string; color: string }) {
  const fillRect = size === 'S' ? '<rect x="2" y="2" width="23" height="15" rx="4"/>' : size === 'M' ? '<rect x="2" y="2" width="48" height="15" rx="4"/>' : '<rect x="2" y="2" width="48" height="32" rx="5"/>';
  const rest = size === 'S' ? '<rect x="27.5" y="2.5" width="22" height="14" rx="4"/><rect x="2.5" y="19.5" width="47" height="14" rx="4"/>'
    : size === 'M' ? '<rect x="2.5" y="19.5" width="47" height="14" rx="4"/>' : '';
  const x = `<svg viewBox="0 0 52 36"><g fill="none" stroke="${color}" stroke-opacity="0.35" stroke-dasharray="2.5 2.5">${rest}</g><g fill="${on}">${fillRect}</g></svg>`;
  return <SvgXml xml={x} width={52} height={36} accessible={false} importantForAccessibility="no" />;
});
