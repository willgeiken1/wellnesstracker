import { View, Pressable } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { ThemedText } from './themed-text';
import { touchTarget } from './button';
export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return <View accessibilityRole="tablist" accessibilityLabel={label}
    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[0] }}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label}
      accessibilityState={{ selected: option.value === value }} onPress={() => onChange(option.value)}
      style={{ flexGrow: 1, flexBasis: '28%', minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center',
        padding: tokens.spacing[1], borderRadius: tokens.radii.input,
        backgroundColor: option.value === value ? colors.accent : colors['surface-2'] }}>
      <ThemedText style={{ color: option.value === value ? colors['on-accent'] : colors.text, textAlign: 'center' }}>{option.label}</ThemedText>
    </Pressable>)}
  </View>;
}
