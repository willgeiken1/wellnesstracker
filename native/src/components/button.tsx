import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { ThemedText } from './themed-text';
export const touchTarget = Platform.OS === 'ios' ? tokens.touch.ios : tokens.touch.android;
/**
 * The one button (UX-6). `regular` fills its row, for a screen's main actions. `small` is a compact pill that sits
 * at its own width inside a panel (Home's Start, Log food); its 40 pt height reaches the touch target with hitSlop.
 */
export function Button({ label, onPress, variant = 'primary', size = 'regular', selected, disabled = false, busy = false, testID, accessibilityLabel }: {
  accessibilityLabel?: string; testID?: string; label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'destructive'; size?: 'regular' | 'small'; selected?: boolean; disabled?: boolean; busy?: boolean;
}) {
  const { colors, radius } = useTheme();
  const backgroundColor = variant === 'primary' ? colors.accent : variant === 'destructive' ? colors.danger : colors['surface-2'];
  const color = variant === 'primary' ? colors['on-accent'] : variant === 'destructive' ? colors['on-danger'] : colors.text;
  const small = size === 'small';
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, busy, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    hitSlop={small ? { top: 4, bottom: 4 } : undefined}
    style={({ pressed }) => [small ? styles.small : styles.button, { borderRadius: small ? radius.card : radius.input, backgroundColor, opacity: disabled ? 0.5 : pressed ? (small ? 0.8 : 0.75) : 1 }]}>
    {busy && <ActivityIndicator accessibilityRole="progressbar" color={color}/> }
    <ThemedText style={[{ color, textAlign: 'center' }, small && { fontSize: 14, fontWeight: '600' }]}>{label}</ThemedText>
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: touchTarget, minWidth: touchTarget,
  justifyContent: 'center', padding: tokens.spacing[2] },
  small: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 } });
