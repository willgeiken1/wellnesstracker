import { Platform, View, type ViewProps } from 'react-native';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme();
  return <View {...props} style={[{ backgroundColor: Platform.OS === 'android' ? colors['surface-2'] : colors.surface,
    padding: tokens.spacing[3], borderRadius: tokens.radii.card, gap: tokens.spacing[2] },
    Platform.OS === 'ios' && tokens.elevation.ios, style]} />;
}
