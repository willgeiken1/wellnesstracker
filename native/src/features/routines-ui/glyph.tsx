import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';

/* The small line drawings Routines uses, in a 24 box. All are decorative: the
   control around one carries the label. */
const paths = {
  gear: 'M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5M5.3 5.3L7 7M17 17L18.7 18.7M18.7 5.3L17 7M7 17L5.3 18.7',
  plus: 'M12 5V19M5 12H19',
  check: 'M5 12.5L10 17.5L19 7',
  close: 'M6 6L18 18M18 6L6 18',
  back: 'M15 5L8 12L15 19',
  forward: 'M9 5L16 12L9 19',
  down: 'M5 9L12 16L19 9',
  up: 'M5 15L12 8L19 15',
  dash: 'M6 12H18',
  ring: 'M12 5A7 7 0 1 0 12 19A7 7 0 1 0 12 5',
  moon: 'M19 14.5A8 8 0 0 1 9.5 5A8 8 0 1 0 19 14.5Z',
  converter: 'M4 8H20M16 4L20 8L16 12M20 16H4M8 12L4 16L8 20',
  site: 'M12 21Q5 14 5 9.5A7 7 0 0 1 19 9.5Q19 14 12 21ZM12 7A2.5 2.5 0 1 0 12 12A2.5 2.5 0 1 0 12 7',
  warning: 'M12 4L21 20H3ZM12 10V14.5M12 17.2V17.3',
} as const;
export type GlyphName = keyof typeof paths;

export function Glyph({ name, size = 22, color, width = 1.8, testID }: { name: GlyphName; size?: number; color?: ColorValue; width?: number; testID?: string }) {
  const { colors } = useTheme();
  return <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={paths[name]} fill="none" stroke={color ?? colors.text} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
