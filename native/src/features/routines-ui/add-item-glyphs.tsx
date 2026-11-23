import Svg, { Circle, Path, Rect } from 'react-native-svg';

/* Small line icons for the sheets, on a 24 box. Each one is decorative: the
   control around it carries the label VoiceOver reads. */

const LINES = {
  supplement: 'M9.7 8.8l4.6 6.4',
  peptide: 'M7 3.5h10M8.5 13h7',
  medication: 'M7 12h10',
  enhancer: 'M13 3L6 13.5h5.5L10.5 21 18 10.5h-5.5z',
  other: '',
  custom: 'M4 12.6V5.5A1.5 1.5 0 0 1 5.5 4h7.1l7.4 7.4-8.6 8.6z',
  add: 'M12 6v12M6 12h12',
  check: 'M8.3 12.2l2.5 2.5 4.9-5',
  converter: 'M8.5 7.5h7M8.5 12h1M12 12h1M15.5 12h0M8.5 16h1M12 16h1M15.5 16h0',
  close: 'M7 7l10 10M17 7L7 17',
  chevron: 'M9 5l7 7-7 7',
  back: 'M15 5l-7 7 7 7',
  up: 'M6 14l6-6 6 6',
  down: 'M6 10l6 6 6-6',
  info: 'M12 11v5.5M12 7.6v.2',
  minus: 'M6 12h12',
} as const;

export type GlyphName = keyof typeof LINES;

export function Glyph({ name, color, size = 24, weight = 1.8 }: { name: GlyphName; color: string; size?: number; weight?: number }) {
  const line = { fill: 'none', stroke: color, strokeWidth: weight, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    {name === 'supplement' && <Rect x={4} y={8.5} width={16} height={7} rx={3.5} transform="rotate(-35 12 12)" {...line} />}
    {name === 'peptide' && <Rect x={8.5} y={3.5} width={7} height={17} rx={3} {...line} />}
    {name === 'medication' && <Circle cx={12} cy={12} r={7.5} {...line} />}
    {name === 'other' && [6.5, 12, 17.5].map((cx) => <Circle key={cx} cx={cx} cy={12} r={1.2} {...line} />)}
    {name === 'custom' && <Circle cx={8.6} cy={8.6} r={1.2} {...line} />}
    {name === 'check' && <Circle cx={12} cy={12} r={8.5} {...line} />}
    {name === 'converter' && <Rect x={5} y={3} width={14} height={18} rx={3} {...line} />}
    {name === 'info' && <Circle cx={12} cy={12} r={8.5} {...line} />}
    {LINES[name] !== '' && <Path d={LINES[name]} {...line} />}
  </Svg>;
}
