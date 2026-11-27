import { useState } from 'react';
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
export function SegmentedControl<T extends string>({ label, options, value, onChange, testID, compact, track, height }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; testID?: string;
  compact?: boolean; track?: string;
  /** A choice height of its own, where the design sets one (36 in Containers, 32 in Log weight). */ height?: number;
}) {
  const { selectorLook } = useTheme();
  const k = useKit();
  const haptic = useSelectionHaptic();
  const [track_, setTrack] = useState(0);
  const [labels, setLabels] = useState<Record<string, number>>({});
  // A tick only when the choice really changes, so tapping the chosen one again stays quiet.
  const choose = (next: T) => { if (next !== value) haptic(); onChange(next); };
  if (selectorLook === 'pills') return <Pills label={label} options={options} value={value} onChange={choose} />;
  const pad = compact ? 6 : 10;
  const inner = track_ - 4 - 2 * (options.length - 1);
  const natural = options.map(o => labels[o.value]);
  // Too little room for every label on one line (a narrow row at a large text size): the choices share the track
  // equally and their labels wrap, as before. The widths measured so far are kept, since wrapped ones would be wrong.
  const tight = inner > 0 && natural.every(w => w != null) && natural.reduce<number>((sum, w) => sum + (w as number) + 2 * pad, 0) > inner;
  const widths = tight ? null : segmentWidths(natural, inner, pad);
  return <View testID={testID} accessibilityRole="tablist" accessibilityLabel={label} onLayout={e => setTrack(e.nativeEvent.layout.width)}
    style={{ flexDirection: 'row', gap: 2, padding: 2, borderRadius: KIT.radius.seg, backgroundColor: track ?? (k.dark ? k.c['surface-2'] : k.fill) }}>
    {options.map((option, i) => {
      const on = option.value === value;
      return <Tappable key={option.value} dim={on ? 'none' : 'seg'} accessibilityRole="tab" accessibilityLabel={option.label}
        accessibilityState={{ selected: on }} onPress={() => choose(option.value)} hitSlop={{ top: compact ? 7 : 6, bottom: compact ? 7 : 6 }}
        style={[widths ? { width: widths[i] } : { flex: 1 }, { minHeight: height ?? (compact ? 32 : 34), paddingHorizontal: pad, borderRadius: KIT.radius.segItem, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          backgroundColor: on ? k.segOn : 'transparent',
          boxShadow: on ? '0px 1px 3px rgba(0, 0, 0, 0.14), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.06)' : undefined }]}>
        {/* Never shrunk, so its measured width is the label's own: the widths above are worked out from it. */}
        <KitText weight={600} size={compact ? 13 : 13.5} tracking={-0.005} color={on ? 'text' : 'text-muted'}
          onLayout={e => { if (tight) return; const w = e.nativeEvent.layout.width; setLabels(m => Math.abs((m[option.value] ?? 0) - w) < 0.25 ? m : { ...m, [option.value]: w }); }}
          style={{ textAlign: 'center', flexShrink: tight ? 1 : 0, marginHorizontal: tight ? -pad + 2 : 0 }}>{option.label}</KitText>
      </Tappable>;
    })}
  </View>;
}

/**
 * How wide each choice is, as the design's flex row shares the track (`.seg button { flex: 1 }`): equal parts, except
 * that a choice never gets narrower than its label and side padding; a long label takes what it needs and the others
 * share the rest. `null` until every label and the track have been measured (the choices then share equally).
 */
export function segmentWidths(labels: readonly (number | undefined)[], inner: number, pad: number): number[] | null {
  if (!(inner > 0) || labels.some(w => w == null)) return null;
  const min = labels.map(w => (w as number) + 2 * pad), out = min.map(() => 0), frozen = min.map(() => false);
  for (let pass = 0; pass < min.length; pass++) {
    const free = frozen.filter(f => !f).length;
    if (!free) break;
    const share = (inner - min.reduce((sum, w, i) => sum + (frozen[i] ? w : 0), 0)) / free;
    let changed = false;
    min.forEach((w, i) => { if (!frozen[i]) { if (w > share) { frozen[i] = true; out[i] = w; changed = true; } else out[i] = share; } });
    if (!changed) break;
  }
  return out;
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
