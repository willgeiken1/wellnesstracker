import { View } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { ThemedText } from './themed-text';
export function Badge({ label }: { label: string }) {
  const { colors, radius } = useTheme();
  return <View style={{ alignSelf: 'flex-start', borderRadius: radius.input, padding: tokens.spacing[1], backgroundColor: colors['surface-2'] }}>
    <ThemedText variant="caption">{label}</ThemedText></View>;
}
