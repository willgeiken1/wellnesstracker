import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { alpha, mix, shellColors } from './colors';

/** A short note above the bar: a coloured dot and one line, gone after 2.6 seconds. `color` is a theme colour key. */
export interface ToastOptions { color?: 'success' | 'warning' | 'accent' | 'training' | 'food' | 'recovery' | 'sleep' | 'water'; ms?: number;
  /** A button at the right, such as Undo. Pressing it runs `onAction` and closes the toast. */
  action?: { label: string; onAction: () => void } }
let current: { text: string; color: NonNullable<ToastOptions['color']>; ms: number; id: number; action?: ToastOptions['action'] } | null = null;
let seq = 0;
const listeners = new Set<() => void>();
export function showToast(text: string, options: ToastOptions = {}) {
  current = { text, color: options.color ?? 'success', ms: options.ms ?? 2600, id: ++seq, action: options.action };
  listeners.forEach(l => l());
}
const useToast = () => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);

/** Where the toast shows: 92 points above the bar's bottom edge. */
export function ShellToast({ bottom }: { bottom: number }) {
  const toast = useToast();
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  // The toast on screen is the latest one until its own fade-out ends.
  const [goneId, setGoneId] = useState(0);
  const shown = toast && toast.id !== goneId ? toast : null;
  const appear = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!toast) return;
    Animated.timing(appear, { toValue: 1, duration: reduceMotion ? 0 : 300, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: false }).start();
    const timer = setTimeout(() => Animated.timing(appear, { toValue: 0, duration: reduceMotion ? 0 : 200, useNativeDriver: false }).start(() => setGoneId(toast.id)), toast.ms);
    return () => clearTimeout(timer);
  }, [toast, appear, reduceMotion]);
  if (!shown) return null;
  const dot = shell.dark ? colors[shown.color] : mix(colors[shown.color], 0.6, shell.pillInk);
  return <Animated.View pointerEvents={shown.action ? 'box-none' : 'none'} accessibilityLiveRegion="polite" accessibilityRole="alert" testID="shell-toast"
    style={{ position: 'absolute', left: 16, right: 16, bottom: 92 + bottom, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, backgroundColor: mix(shell.pillInk, 0.06, shell.pill),
      boxShadow: `${shell.lift}, inset 0px 0px 0px 1px ${alpha(shell.pillInk, 0.12)}`,
      opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
    <ThemedText style={{ flex: 1, color: shell.pillInk, fontFamily: tokens.font.bodyStrong, fontSize: 14, lineHeight: 18, letterSpacing: -0.07 }}>{shown.text}</ThemedText>
    {shown.action && <Pressable accessibilityRole="button" accessibilityLabel={shown.action.label} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      onPress={() => { const act = shown.action; setGoneId(shown.id); act?.onAction(); }}
      style={({ pressed }) => ({ minHeight: 44, marginVertical: -6, marginRight: -8, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', opacity: pressed ? 0.45 : 1 })}>
      <ThemedText style={{ color: shell.dark ? colors.accent : mix(colors.accent, 0.45, shell.pillInk), fontFamily: tokens.font.heading, fontSize: 14, lineHeight: 18 }}>{shown.action.label}</ThemedText>
    </Pressable>}
  </Animated.View>;
}
