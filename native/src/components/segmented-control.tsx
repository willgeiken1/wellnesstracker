import { View, Pressable } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { ThemedText } from './themed-text';
import { touchTarget } from './button';
/** Space between the track's edge and the choices, and between the choices. */
const TRACK_GAP = 3;
export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  // Four choices sit two by two, so no label is cut short at large text sizes. Three stay in one row.
  const four = options.length === 4;
  // One track holds the choices, so the ones not chosen still read as part of a control on any background:
  // the fill shows on a card, the hairline on the page.
  return <View accessibilityRole="tablist" accessibilityLabel={label}
    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: TRACK_GAP, padding: TRACK_GAP, borderRadius: tokens.radii.card,
      backgroundColor: colors['surface-2'], borderWidth: 1, borderColor: colors['hair-2'] }}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label}
      accessibilityState={{ selected: option.value === value }} onPress={() => onChange(option.value)}
      style={{ flexGrow: 1, flexBasis: four ? '45%' : '28%', minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center',
        padding: tokens.spacing[1], borderRadius: tokens.radii.card - TRACK_GAP,
        backgroundColor: option.value === value ? colors.accent : 'transparent' }}>
      <ThemedText style={{ color: option.value === value ? colors['on-accent'] : colors.text, textAlign: 'center', fontWeight: option.value === value ? '600' : '400' }}>{option.label}</ThemedText>
    </Pressable>)}
  </View>;
}
