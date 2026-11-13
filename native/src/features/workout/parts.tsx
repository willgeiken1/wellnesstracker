import { useMemo, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { touchTarget } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import type { WorkoutStore } from '@/data/workout/store';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { printData, workoutPrint, type PrintData } from '@/features/home/contour';
import { t } from '@/i18n/en';
import { entryVolumeKg } from './volume';

/** Shared parts for the screens around the logger (summary, day, routine editor, cardio), so they read as one app. */
export const semibold = { fontWeight: '600' } as const;
export const card = { borderRadius: 18, padding: tokens.spacing[3] } as const;
export const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const GLYPHS = { back: 'M15 5l-7 7 7 7', forward: 'M9 5l7 7-7 7', close: 'M6 6l12 12M18 6L6 18' } as const;

/** Goes back when there is somewhere to go back to; otherwise opens Workouts, so a screen is never a dead end. */
export function leave() {
  if (router.canGoBack?.()) router.back();
  else router.replace('/workouts');
}

/** A round icon button with a full-size touch area around a smaller disc. */
export function Round({ label, glyph, disabled = false, onSurface = false, onPress, testID }: { label: string; glyph: keyof typeof GLYPHS; disabled?: boolean; onSurface?: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: onSurface ? colors['surface-2'] : colors.surface }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}><Path d={GLYPHS[glyph]} fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </View>
  </Pressable>;
}

/** Earlier and later as one joined capsule, so a day stepper never reads as a second Back button beside the real one. */
export function Stepper({ previous, next, testID }: { previous: { label: string; onPress: () => void; disabled?: boolean; testID?: string }; next: { label: string; onPress: () => void; disabled?: boolean; testID?: string }; testID?: string }) {
  const { colors, radius } = useTheme();
  const half = (side: typeof previous, glyph: 'back' | 'forward') => <Pressable testID={side.testID} accessibilityRole="button" accessibilityLabel={side.label}
    accessibilityState={{ disabled: !!side.disabled }} disabled={side.disabled} onPress={side.onPress}
    style={({ pressed }) => ({ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', opacity: side.disabled ? 0.35 : pressed ? 0.7 : 1 })}>
    <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}><Path d={GLYPHS[glyph]} fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
  </Pressable>;
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.card, backgroundColor: colors['surface-2'] }}>
    {half(previous, 'back')}
    <View style={{ width: 1, height: 20, backgroundColor: colors['hair-2'] }} />
    {half(next, 'forward')}
  </View>;
}

/** The bar at the top of a pushed screen: one way out on the left, the screen's only title, and room for one action. */
export function PageBar({ title, left, right, testID }: { title: string; left: ReactNode; right?: ReactNode; testID?: string }) {
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: touchTarget }}>
    {left}
    <ThemedText variant="title" accessibilityRole="header" style={[semibold, { flex: 1 }]}>{title}</ThemedText>
    {right}
  </View>;
}

/** A rounded choice or small action. Selected (or `strong`, for the one that saves) is filled with the accent; the rest sit quietly. */
export function Pick({ text, label, selected, strong = false, disabled = false, onPress, onSurface = false, testID }: {
  text: string; label?: string; selected?: boolean; strong?: boolean; disabled?: boolean; onPress: () => void; onSurface?: boolean; testID?: string;
}) {
  const filled = selected || strong;
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label ?? text}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: touchTarget, justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
    <View style={{ minHeight: 34, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, justifyContent: 'center',
      backgroundColor: filled ? colors.accent : onSurface ? colors['surface-2'] : colors.surface }}>
      <ThemedText style={[{ fontSize: 15, color: filled ? colors['on-accent'] : colors.text }, filled && semibold]}>{text}</ThemedText>
    </View>
  </Pressable>;
}

/** The main action on a screen: full width, filled with the accent. */
export function Primary({ label, onPress, disabled = false, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 50, paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[1], borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.accent, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
    <ThemedText style={[semibold, { color: colors['on-accent'], fontSize: 17, textAlign: 'center' }]}>{label}</ThemedText>
  </Pressable>;
}
/** A second action beside or under the main one. */
export function Secondary({ label, onPress, disabled = false, onSurface = false, testID }: { label: string; onPress: () => void; disabled?: boolean; onSurface?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 50, paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[1], borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: onSurface ? colors['surface-2'] : colors.surface, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
    <ThemedText style={[semibold, { textAlign: 'center' }]}>{label}</ThemedText>
  </Pressable>;
}

/** A section heading above a card. */
export function SectionTitle({ children }: PropsWithChildren) {
  return <ThemedText variant="headline" accessibilityRole="header" style={[semibold, { marginTop: tokens.spacing[1] }]}>{children}</ThemedText>;
}

/** A quiet gray line beside the thing that failed, read out when it appears. Retry is offered when there is something to retry. */
export function Trouble({ text, onRetry, testID }: { text: string; onRetry?: () => void; testID?: string }) {
  const { colors, radius } = useTheme();
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], borderRadius: radius.card, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[1], backgroundColor: colors['surface-2'] }}>
    <ThemedText muted accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flex: 1 }}>{text}</ThemedText>
    {onRetry && <Pressable accessibilityRole="button" accessibilityLabel={t('tryAgain')} onPress={onRetry} style={{ minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText style={semibold}>{t('tryAgain')}</ThemedText>
    </Pressable>}
  </View>;
}

/** A labelled text field. The label is also what a screen reader says for the field. */
export function Field({ label, style, inputStyle, onSurface = true, hint, ...input }: Omit<TextInputProps, 'style'> & { label: string; onSurface?: boolean; hint?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  const { colors, radius } = useTheme();
  return <View style={[{ gap: 6 }, style]}>
    <ThemedText muted variant="caption" style={semibold}>{label}</ThemedText>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors['text-muted']} {...input}
      style={[{ minHeight: 48, borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 10, fontSize: tokens.type.body, color: colors.text, backgroundColor: onSurface ? colors['surface-2'] : colors.surface }, inputStyle]} />
    {!!hint && <ThemedText muted variant="caption">{hint}</ThemedText>}
  </View>;
}

/** Volume per exercise for one workout, in kg, as the workout print needs it. A set without weight still counts by its reps. */
export function sessionPrint(store: WorkoutStore, sessionId: string): { data: PrintData; totalKg: number } {
  let total = 0;
  const exercises = store.entries(sessionId).filter(entry => !store.skipped(entry.id)).map(entry => {
    const volume = entryVolumeKg(store, entry);
    let body = 0;
    for (const set of store.working(entry)) {
      if (set.warmup || !Number.isFinite(set.reps)) continue;
      if (!(Number.isFinite(set.weight) && set.weight > 0)) body += set.reps;
    }
    total += volume;
    return { name: String(entry.data.exercise), volume: volume + body * 20 };
  });
  return { data: printData(sessionId, exercises), totalKg: total };
}
/** The workout print: one hill per exercise, sized by its share of the volume. Decorative; the numbers beside it carry the facts. */
export function Print({ data, width, height }: { data: PrintData; width: number; height: number }) {
  const color = useTheme().colors.training;
  const lines = useMemo(() => workoutPrint(data, width, height), [data, width, height]);
  return <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} accessible={false}>
    {lines.map((line, i) => <Path key={i} d={line.d} fill="none" stroke={color} strokeWidth={line.width} opacity={line.opacity} strokeLinecap="round" />)}
  </Svg>;
}

/** "Tue, Nov 3", with the year when it is not this year. Falls back to the raw text for a date that cannot be read. */
export function dayLabel(day: unknown, now = new Date()) {
  const date = new Date(`${String(day)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(day)
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}
/** Minutes as people say them: "58 min", "1 h 12 min". Under a minute is "under 1 min", never a made-up zero. */
export function minutesLabel(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return t('flowUnderMinute');
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
