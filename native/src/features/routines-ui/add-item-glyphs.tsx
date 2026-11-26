import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Icon, type IconSetName } from '@/components/icon';
import { ICON_STROKE } from '@/components/icon-data';

/* Small line icons for the sheets, on a 24 box. Each one is decorative: the
   control around it carries the label VoiceOver reads. Each name here draws the shared Insight icon beside it. */
const icons = {
  other: 'more', add: 'plus', check: 'success', close: 'close', chevron: 'chevron-right', back: 'chevron-left', up: 'chevron-up', down: 'chevron-down',
  info: 'info', minus: 'minus',
} as const satisfies Record<string, IconSetName>;
/* The kinds of item and the dose calculator, which the set has no drawing for yet. Same box and line as the set. */
const LINES = {
  supplement: 'M9.7 8.8l4.6 6.4',
  peptide: 'M7 3.5h10M8.5 13h7',
  medication: 'M7 12h10',
  enhancer: 'M13 3L6 13.5h5.5L10.5 21 18 10.5h-5.5z',
  custom: 'M4 12.6V5.5A1.5 1.5 0 0 1 5.5 4h7.1l7.4 7.4-8.6 8.6z',
  converter: 'M8.5 7.5h7M8.5 12h1M12 12h1M15.5 12h0M8.5 16h1M12 16h1M15.5 16h0',
} as const;

export type GlyphName = keyof typeof icons | keyof typeof LINES;

export function Glyph({ name, color, size = 24 }: { name: GlyphName; color: string; size?: number }) {
  if (name in icons) return <Icon name={icons[name as keyof typeof icons]} size={size} color={color} />;
  const kind = name as keyof typeof LINES;
  const line = { fill: 'none', stroke: color, strokeWidth: ICON_STROKE, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    {kind === 'supplement' && <Rect x={4} y={8.5} width={16} height={7} rx={3.5} transform="rotate(-35 12 12)" {...line} />}
    {kind === 'peptide' && <Rect x={8.5} y={3.5} width={7} height={17} rx={3} {...line} />}
    {kind === 'medication' && <Circle cx={12} cy={12} r={7.5} {...line} />}
    {kind === 'custom' && <Circle cx={8.6} cy={8.6} r={1.2} {...line} />}
    {kind === 'converter' && <Rect x={5} y={3} width={14} height={18} rx={3} {...line} />}
    <Path d={LINES[kind]} {...line} />
  </Svg>;
}
