import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { DISTANCES, FADES, SPRINGS } from '@/components/kit-motion';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { alpha, mix, shellColors } from './colors';

/** A short note above the bar: a coloured dot and one line, gone after 2.6 seconds. `color` is a theme colour key. */
export interface ToastOptions { color?: 'success' | 'warning' | 'accent' | 'training' | 'food' | 'recovery' | 'sleep' | 'water'; ms?: number;
  /** A button at the right, such as Undo. Pressing it runs `onAction` and closes the toast. */
  action?: { label: string; onAction: () => void } }
let current: { text: string; color: NonNullable<ToastOptions['color']>; ms: number; at: number; id: number; action?: ToastOptions['action'] } | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(l => l());
export function showToast(text: string, options: ToastOptions = {}) {
  current = { text, color: options.color ?? 'success', ms: options.ms ?? 2600, at: Date.now(), id: ++seq, action: options.action };
  changed();
}
/**
 * Ends a toast for every screen, not just the one showing it: once it has faded or its button was pressed, a screen that
 * mounts later never shows it again, and its action (an Undo that restores a snapshot) can't run a second time.
 */
function expireToast(id: number) { if (current?.id === id) { current = null; changed(); } }
/** Takes a toast's action once: the first press gets it and ends the toast, any later press gets nothing. */
function takeAction(id: number) { const act = current?.id === id ? current.action : undefined; expireToast(id); return act; }
/** Clears the toast for every screen, so one test's toast never stands in for the next test's. */
export function resetToast() { current = null; changed(); }
const useToast = () => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);

/** How the toast moves (motion.css): it springs up 16 pt from 96 percent on the toast spring while it fades in over 180 ms, and
 * leaves quickly, a 160 ms fade as it drops back in 220 ms. Under Reduce Motion it only fades, 200 ms each way. */
export function toastMotion(reduced: boolean) {
  const lin = (duration: number) => ({ duration, easing: Easing.linear });
  if (reduced) return { in: { fade: lin(FADES.reduced), move: null }, out: { fade: lin(FADES.reduced), move: null, ms: FADES.reduced } };
  return {
    in: { fade: lin(180), move: { mass: 1, stiffness: SPRINGS.toast.stiffness, damping: SPRINGS.toast.damping } },
    out: { fade: lin(160), move: { duration: 220, easing: Easing.bezier(0.4, 0, 1, 1) }, ms: 220 },
  };
}

/** Where the toast shows: 92 points above the bar's bottom edge. */
export function ShellToast({ bottom }: { bottom: number }) {
  const toast = useToast();
  const { colors, mode, reduceMotion } = useTheme();
  const shell = shellColors(colors, mode);
  // The toast on screen is the latest one until its own fade-out ends.
  const [goneId, setGoneId] = useState(0);
  const shown = toast && toast.id !== goneId ? toast : null;
  const o = useSharedValue(0), m = useSharedValue(0);
  useEffect(() => {
    if (!toast) return;
    const t = toastMotion(reduceMotion);
    o.value = withTiming(1, t.in.fade);
    m.value = t.in.move ? withSpring(1, t.in.move) : 1;
    let gone: ReturnType<typeof setTimeout> | undefined;
    // A screen that mounts while a toast is up shows it only for what is left of its time.
    const timer = setTimeout(() => {
      o.value = withTiming(0, t.out.fade);
      if (t.out.move) m.value = withTiming(0, t.out.move);
      gone = setTimeout(() => { setGoneId(toast.id); expireToast(toast.id); }, t.out.ms);
    }, Math.max(0, toast.at + toast.ms - Date.now()));
    return () => { clearTimeout(timer); if (gone) clearTimeout(gone); };
  }, [toast, o, m, reduceMotion]);
  const motion = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: DISTANCES.toastRise * (1 - m.value) }, { scale: DISTANCES.toastScale + (1 - DISTANCES.toastScale) * m.value }] }));
  if (!shown) return null;
  const dot = shell.dark ? colors[shown.color] : mix(colors[shown.color], 0.6, shell.pillInk);
  return <Animated.View pointerEvents={shown.action ? 'box-none' : 'none'} accessibilityLiveRegion="polite" accessibilityRole="alert" testID="shell-toast"
    style={[{ position: 'absolute', left: 16, right: 16, bottom: 92 + bottom, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, backgroundColor: mix(shell.pillInk, 0.06, shell.pill),
      boxShadow: `${shell.lift}, inset 0px 0px 0px 1px ${alpha(shell.pillInk, 0.12)}` }, motion]}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
    <ThemedText style={{ flex: 1, color: shell.pillInk, fontFamily: tokens.font.bodyStrong, fontSize: 14, lineHeight: 18, letterSpacing: -0.07 }}>{shown.text}</ThemedText>
    {shown.action && <Tappable dim="text" accessibilityRole="button" accessibilityLabel={shown.action.label} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      onPress={() => { setGoneId(shown.id); takeAction(shown.id)?.onAction(); }}
      style={{ minHeight: 44, marginVertical: -6, marginRight: -8, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' }}>
      <ThemedText style={{ color: shell.dark ? colors.accent : mix(colors.accent, 0.45, shell.pillInk), fontFamily: tokens.font.heading, fontSize: 14, lineHeight: 18 }}>{shown.action.label}</ThemedText>
    </Tappable>}
  </Animated.View>;
}
