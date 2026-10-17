import { Platform, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { ThemedText } from './themed-text';
export const touchTarget = Platform.OS === 'ios' ? tokens.touch.ios : tokens.touch.android;
export function Button({ label, onPress, variant = 'primary', selected, disabled = false }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'destructive'; selected?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const backgroundColor = variant === 'primary' ? colors.accent : variant === 'destructive' ? colors.danger : colors['surface-2'];
  const color = variant === 'primary' ? colors['on-accent'] : variant === 'destructive' ? colors['on-danger'] : colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}>
    <ThemedText style={{ color, textAlign: 'center' }}>{label}</ThemedText>
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: touchTarget, minWidth: touchTarget,
  justifyContent: 'center', padding: tokens.spacing[2], borderRadius: tokens.radii.input } });
