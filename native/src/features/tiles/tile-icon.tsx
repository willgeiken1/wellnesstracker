import { memo } from 'react';
import { SvgXml } from 'react-native-svg';
import { TILE_ICONS } from './icons';

const XML = new Map<string, string>();
function xmlOf(name: string): string {
  let x = XML.get(name);
  if (!x) {
    const ic = TILE_ICONS[name] ?? TILE_ICONS.grid;
    x = ic.stroke
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ic.xml}</svg>`
      : `<svg viewBox="0 0 24 24">${ic.xml}</svg>`;
    XML.set(name, x);
  }
  return x;
}

/** A tile icon (the tile catalogue's own line icons). Decorative: the control around it carries the label. */
export const TileIcon = memo(function TileIcon({ name, size, color }: { name: string; size: number; color: string }) {
  return <SvgXml xml={xmlOf(name)} width={size} height={size} color={color} accessible={false} importantForAccessibility="no" />;
});
