import { View, Pressable, ScrollView } from 'react-native';
import { PRESSED_FILL_OPACITY, Tappable } from './tappable';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { KitText, ThemedText } from './themed-text';
import { KIT, useKit } from './kit-style';
import { touchTarget } from './button';
import { useSelectionHaptic } from './selection-haptic';
/** The kit's `.seg` (`ui.seg`): choices share one row on a surface-2 track (2 pt padding and gaps, 12 pt corners). The
 * chosen one is raised (the text 10 percent over surface 2 in dark, the surface in light) with a soft shadow; the others
 * are muted. Each choice is 34 pt tall, grown to 46 pt to touch. A tick plays when the choice changes. `compact` is the
 * narrow form that sits at the end of a settings row (32 pt tall, 6 pt side padding, 13 pt text). `track` replaces the
 * track colour where a page sets its own (a dark sheet's list on Progress uses the page background). */
export function SegmentedControl<T extends string>({ label, options, value, onChange, testID, compact, track }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; testID?: string;
  compact?: boolean; track?: string;
}) {
  const { selectorLook } = useTheme();
  const k = useKit();
  const haptic = useSelectionHaptic();
  // A tick only when the choice really changes, so tapping the chosen one again stays quiet.
  const choose = (next: T) => { if (next !== value) haptic(); onChange(next); };
  if (selectorLook === 'pills') return <Pills label={label} options={options} value={value} onChange={choose} />;
  return <View testID={testID} accessibilityRole="tablist" accessibilityLabel={label}
    style={{ flexDirection: 'row', gap: 2, padding: 2, borderRadius: KIT.radius.seg, backgroundColor: track ?? (k.dark ? k.c['surface-2'] : k.fill) }}>
    {options.map(option => {
      const on = option.value === value;
      return <Tappable key={option.value} dim={on ? 'none' : 'seg'} accessibilityRole="tab" accessibilityLabel={option.label}
        accessibilityState={{ selected: on }} onPress={() => choose(option.value)} hitSlop={{ top: compact ? 7 : 6, bottom: compact ? 7 : 6 }}
        style={{ flex: 1, minHeight: compact ? 32 : 34, paddingHorizontal: compact ? 6 : 10, borderRadius: KIT.radius.segItem, alignItems: 'center', justifyContent: 'center',
          backgroundColor: on ? k.segOn : 'transparent',
          boxShadow: on ? '0px 1px 3px rgba(0, 0, 0, 0.14), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.06)' : undefined }}>
        <KitText weight={600} size={compact ? 13 : 13.5} tracking={-0.005} color={on ? 'text' : 'text-muted'}
          style={{ textAlign: 'center', marginHorizontal: compact ? -4 : -8 }}>{option.label}</KitText>
      </Tappable>;
    })}
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
          backgroundColor: on ? colors.accent : colors.surface, opacity: pressed ? PRESSED_FILL_OPACITY : 1 })}>
        <ThemedText style={{ color: on ? colors['on-accent'] : colors.text, textAlign: 'center', fontWeight: on ? '600' : '400' }}>{option.label}</ThemedText>
      </Pressable>;
    })}
  </ScrollView>;
}
