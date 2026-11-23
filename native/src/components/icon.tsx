import type { ColorValue } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';
import { iconData, type IconShape } from './icon-data';

/** Every icon in the Insight set (design/icons/insight-icons.json). */
export type IconSetName = keyof typeof iconData;
/* Names screens used before the set had its own: each one draws the set's icon beside it. */
const aliases = {
  chevron: 'chevron-right', forward: 'chevron-right', back: 'chevron-left', down: 'chevron-down', up: 'chevron-up',
  add: 'plus', routines: 'routine', workout: 'workouts', health: 'heart',
} as const satisfies Record<string, IconSetName>;
export type IconAlias = keyof typeof aliases;
export type IconName = IconSetName | IconAlias;

const resolve = (name: IconName): IconSetName => (name in aliases ? aliases[name as IconAlias] : name as IconSetName);
/** The filled twin a tab shows while it is open, or the icon itself when the set draws no twin for it. */
export function activeIcon(name: IconName): IconSetName {
  const twin = `${resolve(name)}-active`;
  return twin in iconData ? twin as IconSetName : resolve(name);
}

const shapes = { path: Path, circle: Circle, rect: Rect, line: Line, ellipse: Ellipse } as const;
/** Decorative icon from the one Insight set, drawn the same on iPhone, Android and web: the enclosing control
 * supplies its accessible label. Lines and fills take `color`, or the theme's text colour. */
export function Icon({ name, size = 24, color, testID }: { name: IconName; size?: number; color?: ColorValue; testID?: string }) {
  const { colors } = useTheme();
  const tint = color ?? colors.text;
  const paint = (value: string | number | undefined) => (value === 'currentColor' ? tint : value);
  return <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {(iconData[resolve(name)] as readonly IconShape[]).map(({ type, attrs }, index) => {
      const Shape = shapes[type] as typeof Path;
      return <Shape key={index} {...attrs} fill={paint(attrs.fill ?? 'none')} stroke={paint(attrs.stroke)} />;
    })}
  </Svg>;
}
