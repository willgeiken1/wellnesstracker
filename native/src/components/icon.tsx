import type { ColorValue } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';
import { ICONS, type IconEl } from './icon-data';

/** Names the app used before the mockup's icon set, kept so older screens still draw. Each points at the set's own icon. */
const ALIASES = { avatar: 'person', chevron: 'chevron-right', insights: 'score' } as const satisfies Record<string, keyof typeof ICONS>;

/** Every icon of the mockup's set (icon set 1, Native Line) by its mockup name, plus the older aliases. */
export type IconName = keyof typeof ICONS | keyof typeof ALIASES;
export const ICON_NAMES = Object.keys(ICONS) as (keyof typeof ICONS)[];
/** The stroke every line icon draws with, on its 24 pt grid. */
export const ICON_STROKE = 1.75;

const resolve = (name: IconName): IconEl[] => ICONS[(name in ALIASES ? ALIASES[name as keyof typeof ALIASES] : name) as keyof typeof ICONS] ?? [];

function El({ el, ink }: { el: IconEl; ink: ColorValue }) {
  if (el.t === 'g') return <G transform={el.tf}>{el.c.map((c, j) => <El key={j} el={c} ink={ink} />)}</G>;
  const paint = { fill: el.f ? ink : 'none', stroke: el.s ? ink : 'none', strokeWidth: el.s ? ICON_STROKE : undefined,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, transform: el.tf };
  if (el.t === 'path') return <Path d={el.d} {...paint} />;
  if (el.t === 'circle') return <Circle cx={el.cx} cy={el.cy} r={el.r} {...paint} />;
  return <Rect x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} {...paint} />;
}

/**
 * One line icon from the mockup's set, the same on iOS, Android and web: a 24 x 24 grid, 1.75 stroke, round caps and joins,
 * drawn in `color` (the theme's text colour unless given). Decorative: the control around it carries the spoken label.
 * Mirrors `INS.icon(name, size)`; the default size is the mockup's 20.
 */
export function Icon({ name, size = 20, color, testID }: { name: IconName; size?: number; color?: ColorValue; testID?: string }) {
  const { colors } = useTheme();
  const ink = color ?? colors.text;
  return <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
    {resolve(name).map((el, i) => <El key={i} el={el} ink={ink} />)}
  </Svg>;
}
