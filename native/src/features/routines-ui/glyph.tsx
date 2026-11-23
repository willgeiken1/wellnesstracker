import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon, type IconSetName } from '@/components/icon';
import { ICON_STROKE } from '@/components/icon-data';
import { useTheme } from '@/design/theme-provider';

/* The small line drawings Routines uses. All are decorative: the control around one carries the label.
   Each name draws the shared Insight icon beside it. */
const icons = {
  gear: 'settings', plus: 'plus', check: 'check', close: 'close', back: 'chevron-left', forward: 'chevron-right', down: 'chevron-down', up: 'chevron-up',
  dash: 'minus', moon: 'sleep', converter: 'swap', warning: 'warning', info: 'info',
} as const satisfies Record<string, IconSetName>;
/* Two marks the set has no drawing for yet: a day's open ring in History, and the injection-site pin. Same box and line as the set. */
const marks = {
  ring: 'M12 5A7 7 0 1 0 12 19A7 7 0 1 0 12 5',
  site: 'M12 21Q5 14 5 9.5A7 7 0 0 1 19 9.5Q19 14 12 21ZM12 7A2.5 2.5 0 1 0 12 12A2.5 2.5 0 1 0 12 7',
} as const;
export type GlyphName = keyof typeof icons | keyof typeof marks;

export function Glyph({ name, size = 22, color, testID }: { name: GlyphName; size?: number; color?: ColorValue; testID?: string }) {
  const { colors } = useTheme();
  if (name !== 'ring' && name !== 'site') return <Icon name={icons[name]} size={size} color={color} testID={testID} />;
  return <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={marks[name]} fill="none" stroke={color ?? colors.text} strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
