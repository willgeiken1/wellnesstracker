import { useMemo, type ComponentRef, type PropsWithChildren, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ColorValue, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Card } from '../../components/card';
import { ThemedText } from '../../components/themed-text';
import { touchTarget } from '../../components/button';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { terrain } from '../home/contour';
import { t } from '../../i18n/en';
import { ONBOARDING_STEPS, onboardingProgress } from './model';

export const semibold = { fontWeight: '600' } as const;
/** The card of the rebuilt Home: softer corners than the shared default. */
export const panel: ViewStyle = { borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[3] };

/** Where the person is in setup: one bar per screen and the count in words. */
export function StepProgress({ step }: { step: number }) {
  const { colors } = useTheme();
  const total = ONBOARDING_STEPS.length;
  return <View testID="onboarding-progress" accessible accessibilityRole="progressbar" accessibilityLabel={onboardingProgress(step)}
    accessibilityValue={{ min: 1, max: total, now: step }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
    <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
      {ONBOARDING_STEPS.map((name, index) => <View key={name} testID={index < step ? 'onboarding-progress-done' : 'onboarding-progress-todo'}
        style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: index < step ? colors.accent : colors['hair-2'] }} />)}
    </View>
    <ThemedText muted variant="caption">{onboardingProgress(step)}</ThemedText>
  </View>;
}

/** The frame every setup and sign-in screen shares: safe areas, room for the keyboard, back and progress on one row. */
export type ShellScroll = ComponentRef<typeof ScrollView>;
export function Shell({ step, onBack, scrollRef, children }: PropsWithChildren<{ step?: number; onBack?: () => void; scrollRef?: RefObject<ShellScroll | null> }>) {
  const { colors } = useTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg as ColorValue }} edges={['top', 'left', 'right', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} testID="screen-scroll" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: tokens.spacing[3], gap: tokens.spacing[3], flexGrow: 1 }}>
        {(onBack || step) && <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: touchTarget }}>
          {onBack && <Pressable testID="onboarding-back" accessibilityRole="button" accessibilityLabel={t('onboardingBack')} onPress={onBack}
            style={({ pressed }) => ({ width: touchTarget, height: touchTarget, borderRadius: touchTarget / 2, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}>
            <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
              <Path d="M15 5L8 12L15 19" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>}
          {step ? <StepProgress step={step} /> : null}
        </View>}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

/** The one title of a screen, with an optional plain line under it. */
export function Heading({ title, body }: { title: string; body?: string }) {
  return <View style={{ gap: tokens.spacing[0] }}>
    <ThemedText variant="title" accessibilityRole="header" style={[semibold, { fontSize: 26, lineHeight: 32 }]}>{title}</ThemedText>
    {body && <ThemedText muted>{body}</ThemedText>}
  </View>;
}

/** A titled group of fields or choices. */
export function Group({ title, body, children, testID }: PropsWithChildren<{ title?: string; body?: string; testID?: string }>) {
  return <Card style={panel} testID={testID}>
    {(title || body) && <View style={{ gap: 2 }}>
      {title && <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{title}</ThemedText>}
      {body && <ThemedText muted variant="caption" style={{ lineHeight: 19 }}>{body}</ThemedText>}
    </View>}
    {children}
  </Card>;
}

/** The single main action of a screen. */
export function PrimaryButton({ label, onPress, disabled = false, busy = false, testID }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[1],
      paddingVertical: tokens.spacing[2], paddingHorizontal: tokens.spacing[3], borderRadius: 16, backgroundColor: colors.accent, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}>
    {busy && <ActivityIndicator accessibilityRole="progressbar" color={colors['on-accent']} />}
    <ThemedText variant="headline" style={[semibold, { color: colors['on-accent'], textAlign: 'center' }]}>{label}</ThemedText>
  </Pressable>;
}

/** A quiet gray row beside what went wrong. No colour alarm, no popup; Retry only when there is something to retry. */
export function Notice({ text, onRetry, retryLabel, testID }: { text: string; onRetry?: () => void; retryLabel?: string; testID?: string }) {
  const { colors } = useTheme();
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], paddingLeft: tokens.spacing[2], paddingRight: onRetry ? tokens.spacing[0] : tokens.spacing[2],
    minHeight: touchTarget, borderRadius: tokens.radii.card, backgroundColor: colors['surface-2'], borderWidth: 1, borderColor: colors['hair-2'] }}>
    <Svg width={16} height={16} viewBox="0 0 16 16" accessible={false}>
      <Circle cx={8} cy={8} r={7} fill="none" stroke={colors['text-muted']} strokeWidth={1.5} />
      <Path d="M8 4.5V8.5" stroke={colors['text-muted']} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={8} cy={11.2} r={0.9} fill={colors['text-muted']} />
    </Svg>
    <ThemedText accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flex: 1, fontSize: 14, lineHeight: 19, paddingVertical: tokens.spacing[1] }}>{text}</ThemedText>
    {onRetry && <Pressable accessibilityRole="button" accessibilityLabel={retryLabel ?? t('bootRetry')} onPress={onRetry}
      style={({ pressed }) => ({ minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: tokens.spacing[2], alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <ThemedText style={[semibold, { fontSize: 14, color: colors.accent }]}>{retryLabel ?? t('bootRetry')}</ThemedText>
    </Pressable>}
  </View>;
}

/** One choice out of a few, with a line saying what it does. */
export function ChoiceTile({ label, body, selected, onPress, testID }: { label: string; body: string; selected: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="radio" accessibilityLabel={label} accessibilityHint={body} accessibilityState={{ selected, checked: selected }} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: 56, padding: tokens.spacing[2], borderRadius: 14,
      backgroundColor: selected ? colors['accent-tint'] : colors['surface-2'], borderWidth: 2, borderColor: selected ? colors.accent : colors['hair-2'], opacity: pressed ? 0.85 : 1 })}>
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText style={semibold}>{label}</ThemedText>
      <ThemedText variant="caption" style={{ lineHeight: 18, color: selected ? colors.text : colors['text-muted'] }}>{body}</ThemedText>
    </View>
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? colors.accent : colors['text-muted'], alignItems: 'center', justifyContent: 'center' }}>
      {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />}
    </View>
  </Pressable>;
}

/** A row that leads somewhere else, with a line saying where. */
export function LinkRow({ label, body, onPress, disabled = false, first = false, testID }: { label: string; body: string; onPress: () => void; disabled?: boolean; first?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={body} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: 56, paddingVertical: tokens.spacing[2],
      borderTopWidth: first ? 0 : 1, borderTopColor: colors['surface-2'], opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText style={semibold}>{label}</ThemedText>
      <ThemedText muted variant="caption" style={{ lineHeight: 18 }}>{body}</ThemedText>
    </View>
    <Svg width={18} height={18} viewBox="0 0 24 24" accessible={false}>
      <Path d="M9 5L16 12L9 19" fill="none" stroke={colors['text-muted']} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </Pressable>;
}

export type Strand = 'training' | 'food' | 'sleep';
export const STRANDS: readonly Strand[] = ['training', 'food', 'sleep'];
/** The data shapes Home uses: a circle for training, a triangle for food. Services take a square, so colour is never the only cue. */
export function StrandShape({ kind, size = 10 }: { kind: Strand; size?: number }) {
  const { colors } = useTheme(), color = colors[kind];
  return <Svg width={size} height={size} viewBox="0 0 10 10" accessible={false}>
    {kind === 'training' ? <Circle cx={5} cy={5} r={4.2} fill={color} />
      : kind === 'food' ? <Path d="M5 .8L9.4 9H.6z" fill={color} />
        : <Rect x={1} y={1} width={8} height={8} rx={1.6} fill={color} />}
  </Svg>;
}

// Three hills standing for workouts, food and health services. An illustration with fixed heights, never data.
const HILLS = [1, 0.82, 0.9] as const;
/** Home's contour map as a picture: three hills that join into one piece of ground. */
export function ContourArt({ label, footer }: { label: string; footer?: ReactNode }) {
  const { colors } = useTheme();
  const map = useMemo(() => terrain(HILLS, 340, 150, { sd: 0.19, wobble: 0.2, positions: [[0.24, 0.44], [0.52, 0.6], [0.78, 0.4]] }), []);
  return <Card style={[panel, { gap: tokens.spacing[1], padding: tokens.spacing[2] }]} testID="onboarding-contour">
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', aspectRatio: 340 / 150 }}>
      <Svg width="100%" height="100%" viewBox="0 0 340 150" accessible={false}>
        {map.lines.map((line, index) => <Path key={index} d={line.d} fill="none" stroke={colors[STRANDS[line.hill]]} strokeWidth={line.width} opacity={line.opacity} strokeLinecap="round" />)}
        {map.markers.map(marker => <Circle key={marker.hill} cx={marker.x} cy={marker.y} r={2.4} fill={colors[STRANDS[marker.hill]]} />)}
      </Svg>
    </View>
    {footer}
  </Card>;
}
