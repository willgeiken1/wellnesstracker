import { Children, type PropsWithChildren } from 'react';
import { PRESSED_ROW_OPACITY, PRESSED_FILL_OPACITY } from '@/components/tappable';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Pressable, Switch, View, type ColorValue } from 'react-native';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { touchTarget } from '@/components/button';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';

/** The shared parts of the Settings screens: grouped inset lists, rows, switches and choice chips. */
export const semibold = { fontWeight: '600' } as const;
const ROW_HEIGHT = 52;

/** The small heading above a group. Sentence case, semibold. */
export function SectionLabel({ children }: { children: string }) {
  return <ThemedText muted variant="caption" accessibilityRole="header"
    style={[semibold, { marginTop: tokens.spacing[1], marginHorizontal: tokens.spacing[0], marginBottom: -tokens.spacing[0] }]}>{children}</ThemedText>;
}

/** An inset list: one rounded surface, a hairline between rows. */
export function Group({ children, testID }: PropsWithChildren<{ testID?: string }>) {
  const { colors } = useTheme();
  return <Card testID={testID} style={{ borderRadius: 18, gap: 0, paddingVertical: 0, paddingHorizontal: tokens.spacing[3] }}>
    {Children.toArray(children).map((child, index) =>
      <View key={index} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.hair }}>{child}</View>)}
  </Card>;
}

/** A row that opens something: icon, label, an optional current value, chevron. */
export function NavRow({ label, value, icon, onPress, testID }: {
  label: string; value?: string; icon?: IconName; onPress: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label}
    accessibilityValue={value ? { text: value } : undefined} onPress={onPress}
    style={({ pressed }) => ({ minHeight: ROW_HEIGHT, paddingVertical: tokens.spacing[1], flexDirection: 'row', alignItems: 'center',
      gap: tokens.spacing[2], opacity: pressed ? PRESSED_ROW_OPACITY : 1 })}>
    {icon && <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['accent-tint'] }}>
      <Icon name={icon} size={18} color={colors.accent} />
    </View>}
    <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
    {!!value && <ThemedText muted variant="caption" style={{ flexShrink: 1, maxWidth: '45%', textAlign: 'right' }}>{value}</ThemedText>}
    <Icon name="forward" size={14} color={colors['text-muted']} />
  </Pressable>;
}

/** A row that only states something: label, optional line underneath, optional value at the end. */
export function InfoRow({ label, hint, value, children }: PropsWithChildren<{ label: string; hint?: string; value?: string }>) {
  return <View style={{ minHeight: ROW_HEIGHT, paddingVertical: tokens.spacing[2], gap: tokens.spacing[1] }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={semibold}>{label}</ThemedText>
        {!!hint && <ThemedText muted variant="caption">{hint}</ThemedText>}
      </View>
      {!!value && <ThemedText muted>{value}</ThemedText>}
    </View>
    {children}
  </View>;
}

/** The system switch in theme colours. The off track uses the muted text colour so it stands out from the card in light and dark. */
export function ThemedSwitch({ label, value, onValueChange, disabled, testID }: {
  label: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; testID?: string;
}) {
  const { colors } = useTheme();
  return <Switch hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={testID} accessibilityLabel={label} value={value} onValueChange={onValueChange} disabled={disabled}
    trackColor={{ false: colors['text-muted'], true: colors.accent }} ios_backgroundColor={colors['text-muted']}
    thumbColor={value ? colors['on-accent'] : colors.surface} />;
}

/** A setting that is on or off: label, a line on what it does, the switch at the end. */
export function ToggleRow({ label, hint, value, onValueChange, testID, title }: {
  label: string; hint?: string; value: boolean; onValueChange: (value: boolean) => void; testID?: string;
  /** Shorter text to show when the spoken label is a full sentence. */
  title?: string;
}) {
  return <View style={{ minHeight: ROW_HEIGHT, paddingVertical: tokens.spacing[2], flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText style={semibold}>{title ?? label}</ThemedText>
      {!!hint && <ThemedText muted variant="caption">{hint}</ThemedText>}
    </View>
    <ThemedSwitch testID={testID} label={label} value={value} onValueChange={onValueChange} />
  </View>;
}

/** Pick one of a few. The chosen chip is filled with the accent, set in semibold, and says so to VoiceOver.
 * `stacked` lists long choices one per line with a check at the end of the chosen one. */
export function ChoiceChips<T extends string | number>({ options, value, onChange, disabled = false, stacked = false }: {
  options: readonly { value: T; label: string; accessibilityLabel?: string }[]; value: T; onChange: (value: T) => void; disabled?: boolean; stacked?: boolean;
}) {
  const { colors } = useTheme();
  const haptic = useSelectionHaptic();
  return <View style={stacked ? { gap: tokens.spacing[1] } : { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
    {options.map(option => {
      const selected = option.value === value;
      return <Pressable key={String(option.value)} accessibilityRole="button" accessibilityLabel={option.accessibilityLabel ?? option.label}
        accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => { if (!selected) haptic(); onChange(option.value); }}
        style={({ pressed }) => ({ minHeight: touchTarget, minWidth: 52, paddingHorizontal: stacked ? tokens.spacing[3] : tokens.spacing[2], paddingVertical: tokens.spacing[1],
          borderRadius: stacked ? 14 : 99, alignItems: 'center', justifyContent: stacked ? 'flex-start' : 'center', flexDirection: 'row', gap: tokens.spacing[1],
          backgroundColor: selected ? colors.accent : colors['surface-2'], opacity: disabled ? 0.5 : pressed ? PRESSED_FILL_OPACITY : 1 })}>
        <ThemedText numeric={typeof option.value === 'number'}
          style={[{ color: selected ? colors['on-accent'] : colors.text }, stacked && { flex: 1 }, selected && semibold]}>{option.label}</ThemedText>
        {stacked && selected && <ChipCheck color={colors['on-accent']} />}
      </Pressable>;
    })}
  </View>;
}
function ChipCheck({ color }: { color: ColorValue }) {
  return <View testID="chip-selected-mark"><Icon name="check" size={16} color={color} /></View>;
}

/** A quiet card for a screen that has nothing to show yet. States the fact, no badge, no button. */
export function QuietCard({ title, body, testID }: { title: string; body?: string; testID?: string }) {
  return <Card testID={testID} style={{ borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[0] }}>
    <ThemedText variant="headline" style={semibold}>{title}</ThemedText>
    {!!body && <ThemedText muted>{body}</ThemedText>}
  </Card>;
}

/** m:ss for a rest length, so 90 reads 1:30. */
export const restClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
