import { View, Pressable, ScrollView } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { ThemedText } from './themed-text';
import { touchTarget } from './button';
/** Space between the track's edge and the choices, and between the choices. */
const TRACK_GAP = 3;
export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const { colors, selectorLook } = useTheme();
  if (selectorLook === 'pills') return <Pills label={label} options={options} value={value} onChange={onChange} />;
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

/** The pill look from Settings: each choice is its own rounded chip in one row, which scrolls sideways when the
 * choices or a large text size need more room than the screen has. Choices never wrap into a grid. */
function Pills<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="selector-pills" accessibilityRole="tablist" accessibilityLabel={label}
    style={{ flexGrow: 0 }} contentContainerStyle={{ gap: tokens.spacing[1], paddingVertical: 1 }}>
    {options.map(option => {
      const on = option.value === value;
      return <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected: on }}
        onPress={() => onChange(option.value)} testID={`pill-${option.value}`}
        style={({ pressed }) => ({ minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center', paddingHorizontal: tokens.spacing[2],
          borderRadius: touchTarget / 2, borderWidth: 1, borderColor: on ? colors.accent : colors['hair-2'],
          backgroundColor: on ? colors.accent : colors.surface, opacity: pressed ? 0.8 : 1 })}>
        <ThemedText style={{ color: on ? colors['on-accent'] : colors.text, textAlign: 'center', fontWeight: on ? '600' : '400' }}>{option.label}</ThemedText>
      </Pressable>;
    })}
  </ScrollView>;
}
