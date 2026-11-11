import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';

/** A small round control (month arrows and the like). Text children are drawn as a label; anything else, such as an icon, is drawn as given. */
export function FoodAction({ label, children, disabled = false, selected = false, onPress }: { label: string; children: ReactNode; disabled?: boolean; selected?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const text = typeof children === 'string' || typeof children === 'number';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
    <View style={{ minHeight: 36, minWidth: 36, paddingHorizontal: text ? 8 : 0, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.accent : colors['surface-2'] }}>
      {text ? <ThemedText style={{ fontWeight: '600', color: selected ? colors['on-accent'] : colors.text }}>{children}</ThemedText> : children}
    </View>
  </Pressable>;
}
