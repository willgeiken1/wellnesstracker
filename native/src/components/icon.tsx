import { Platform, type ColorValue } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';
const symbols = { home: 'house', workouts: 'dumbbell', food: 'fork.knife', progress: 'chart.xyaxis.line', insights: 'chart.bar', avatar: 'person.crop.circle', chevron: 'chevron.right' } as const;
const paths = {
  home: 'M3 10L12 3L21 10M5 9V21H10V14H14V21H19V9',
  workouts: 'M3 7V17M6 5V19M18 5V19M21 7V17M6 12H18',
  food: 'M4 3V8Q4 11 7 11Q10 11 10 8V3M7 3V21M20 21V3Q14 6 15 12H20',
  progress: 'M3 3V21H21M6 16L11 11L15 14L21 6',
  insights: 'M4 21V13H8V21M10 21V3H14V21M16 21V8H20V21',
  avatar: 'M20 21Q20 14 12 14Q4 14 4 21M12 3A4 4 0 1 0 12 11A4 4 0 1 0 12 3',
  chevron: 'M9 5L16 12L9 19',
};
export type IconName = keyof typeof paths;
/** Decorative icon: the enclosing control supplies its accessible label. */
export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color?: ColorValue }) {
  const { colors } = useTheme();
  const tint = color ?? colors.text;
  if (Platform.OS === 'ios') return <SymbolView name={symbols[name]} size={size} tintColor={tint} accessible={false} />;
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={paths[name]} fill="none" stroke={tint} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
