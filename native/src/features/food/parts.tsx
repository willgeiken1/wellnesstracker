import { PROTOTYPE_RADIUS } from '../../components/card';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { en, foodDayLabel, t } from '../../i18n/en';

/** Shared parts for the food logging screens: one look for fields, rows, notices and actions. */
export const semibold = { fontWeight: '600' } as const;
export const foodCard = { borderRadius: PROTOTYPE_RADIUS, padding: tokens.spacing[3] } as const;

export const GLYPH = {
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13M15.5 15.5L20 20',
  scan: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M16.5 9v6',
  snap: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 10.5a3 3 0 1 0 0 6a3 3 0 0 0 0-6',
  describe: 'M4 5h16v11H10l-5 4v-4H4z',
  saved: 'M12 4l2.5 5.2 5.5.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.5-.8z',
  pencil: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 5l7 7-7 7',
  back: 'M15 5l-7 7 7 7',
  torch: 'M9 3h6v4l-2 3v11h-2V10L9 7zM9 7h6',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 10.5a3 3 0 1 0 0 6a3 3 0 0 0 0-6',
  cameraOff: 'M4 8h3l1.5-2h7L17 8h3v11H4zM4 4l16 17',
  close: 'M6 6l12 12M18 6L6 18',
} as const;
export type GlyphName = keyof typeof GLYPH;

/** Decorative line icon; the control around it carries the label. */
export function Glyph({ name, size = 20, color, width = 1.8 }: { name: GlyphName; size?: number; color?: string; width?: number }) {
  const { colors } = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={GLYPH[name]} fill="none" stroke={color ?? colors.text} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

/** "today", "yesterday" or a short date, for use inside a sentence. */
export function dayInSentence(day: string, today: string) {
  const label = foodDayLabel(day, today);
  return label === en.today || label === en.yesterday ? label.toLowerCase() : label;
}

/** A small semibold label above a group. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <ThemedText muted variant="caption" accessibilityRole="header" style={semibold}>{children}</ThemedText>;
}

/** A rounded group of rows with hairlines between them. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ borderRadius: 14, backgroundColor: colors['surface-2'], overflow: 'hidden' }, style]}>{children}</View>;
}

/**
 * One field inside a group: the name on the left, the value on the right with its unit after it.
 * An empty number shows the placeholder (for example "Unknown") and is never read as zero.
 */
export function FieldRow({ label, title, unit, value, onChange, placeholder, numeric = false, integer = false, first = false, disabled = false, problem, autoFocus = false }: {
  /** Spoken label; names the unit. */ label: string; /** Short visible name. */ title: string; unit?: string; value: string; onChange: (text: string) => void;
  placeholder?: string; numeric?: boolean; integer?: boolean; first?: boolean; disabled?: boolean; problem?: string; autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const keyboard: KeyboardTypeOptions = integer ? 'number-pad' : numeric ? 'decimal-pad' : 'default';
  return <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors['hair-2'], paddingHorizontal: tokens.spacing[2] }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1], minHeight: 50 }}>
      <ThemedText style={[semibold, { fontSize: 15, paddingVertical: 6 }]} accessible={false}>{title}</ThemedText>
      <View style={{ flexGrow: 1, flexBasis: 96, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled} autoFocus={autoFocus}
          placeholder={placeholder} placeholderTextColor={colors['text-muted']} keyboardType={keyboard}
          autoCapitalize={numeric ? 'none' : 'sentences'} autoCorrect={false} returnKeyType="done"
          style={{ flex: 1, minHeight: touchTarget, paddingVertical: 8, color: colors.text, fontSize: 16, textAlign: 'right',
            fontFamily: numeric ? tokens.font.numeral : undefined, fontVariant: numeric ? ['tabular-nums'] : undefined, opacity: disabled ? 0.5 : 1 }} />
        {!!unit && <ThemedText muted variant="caption" accessible={false} style={{ minWidth: 30 }}>{unit}</ThemedText>}
      </View>
    </View>
    {!!problem && <ThemedText muted variant="caption" style={{ paddingBottom: 8 }}>{problem}</ThemedText>}
  </View>;
}

/** Quiet gray row that sits beside what it is about. Errors pass `alert`; `action` is usually Retry. */
export function NoticeRow({ text, alert = false, busy = false, action, testID }: {
  text: string; alert?: boolean; busy?: boolean; action?: { label: string; onPress: () => void }; testID?: string;
}) {
  const { colors } = useTheme();
  return <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1], borderRadius: 12,
    backgroundColor: colors['surface-2'], paddingHorizontal: tokens.spacing[2], paddingVertical: 6, minHeight: touchTarget }}>
    {busy && <ActivityIndicator color={colors['text-muted']} />}
    <ThemedText variant="caption" accessibilityRole={alert ? 'alert' : undefined} accessibilityLiveRegion="polite"
      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160, fontSize: 14, paddingVertical: 4 }}>{text}</ThemedText>
    {action && <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={6}
      style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, borderRadius: 99, justifyContent: 'center', backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 })}>
      <ThemedText style={[semibold, { fontSize: 14 }]}>{action.label}</ThemedText>
    </Pressable>}
  </View>;
}

/** The one filled action of a panel. */
export function PrimaryAction({ label, onPress, disabled = false, busy = false, testID }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 50, borderRadius: 14, paddingHorizontal: tokens.spacing[3], paddingVertical: 10, flexDirection: 'row', gap: 8,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 })}>
    {busy && <ActivityIndicator color={colors['on-accent']} />}
    <ThemedText style={[semibold, { color: colors['on-accent'], textAlign: 'center' }]}>{label}</ThemedText>
  </Pressable>;
}

/** A second-rank action: a soft pill the width of its panel. */
export function SoftAction({ label, onPress, disabled = false, glyph }: { label: string; onPress: () => void; disabled?: boolean; glyph?: GlyphName }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: touchTarget, borderRadius: 14, paddingHorizontal: tokens.spacing[3], paddingVertical: 8, flexDirection: 'row', gap: 8,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'], opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
    {glyph && <Glyph name={glyph} size={18} />}
    <ThemedText style={[semibold, { fontSize: 15, textAlign: 'center' }]}>{label}</ThemedText>
  </Pressable>;
}

/** A text-only action in the main text colour, so it keeps full contrast on every theme. */
export function QuietAction({ label, onPress, disabled = false, align = 'center' }: { label: string; onPress: () => void; disabled?: boolean; align?: 'center' | 'flex-start' | 'flex-end' }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
    style={({ pressed }) => ({ minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: 6, alignSelf: align, justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.6 : 1 })}>
    <ThemedText style={[semibold, { fontSize: 15 }]}>{label}</ThemedText>
  </Pressable>;
}

/** Panel heading with one quiet action on the right (usually Cancel). */
export function PanelHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1] }}>
    <ThemedText variant="headline" accessibilityRole="header" style={[semibold, { flexGrow: 1, flexShrink: 1 }]}>{title}</ThemedText>
    {action && <QuietAction label={action.label} onPress={action.onPress} />}
  </View>;
}

/** A tappable list row: name, a muted second line, a value on the right and a small glyph. */
export function ItemRow({ label, title, detail, value, glyph = 'plus', first = false, onPress, testID }: {
  label: string; title: string; detail?: string; value?: string; glyph?: GlyphName | null; first?: boolean; onPress: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8,
      borderTopWidth: first ? 0 : 1, borderTopColor: colors['surface-2'], opacity: pressed ? 0.6 : 1 })}>
    <View style={{ flex: 1 }}>
      <ThemedText>{title}</ThemedText>
      {!!detail && <ThemedText muted numeric variant="caption">{detail}</ThemedText>}
    </View>
    {!!value && <ThemedText muted numeric>{value}</ThemedText>}
    {glyph && <Glyph name={glyph} size={18} color={colors['text-muted']} width={2} />}
  </Pressable>;
}

/** Calories from stored energy, or null when none was entered. */
export const kcalOf = (kj: unknown) => (typeof kj === 'number' && Number.isFinite(kj) ? Math.round(kj / 4.184) : null);
/** "300 kcal", or a plain "kcal not entered" when the value is unknown. Never 0. */
export function energyText(kj: unknown) {
  const value = kcalOf(kj);
  return value === null ? t('foodKcalUnknown') : t('foodEnergy').replace('{value}', value.toLocaleString('en-US'));
}
/** "P 10 · C 54 · F 5" for the macros that are known; null when none are. */
export function macroText(food: Record<string, unknown>) {
  const parts = ([['P', 'protein_g'], ['C', 'carbs_g'], ['F', 'fat_g']] as const)
    .filter(([, key]) => typeof food[key] === 'number').map(([letter, key]) => `${letter} ${Math.round(Number(food[key]))}`);
  return parts.length ? parts.join(' · ') : null;
}
