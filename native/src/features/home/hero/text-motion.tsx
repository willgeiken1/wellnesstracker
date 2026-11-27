import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { G } from 'react-native-svg';

/** How the hero's words and numbers follow a day change (s9.js and mapplain.js): the day score counts to its new value in
 * 620 ms; a changed line fades up 4 pt in 280 ms (a plain value in 300 ms); an arc's readout fades in over 300 ms; a readout's
 * dim when one pillar is in focus takes 260 ms. */
export const TEXT_MOTION = { count: 620, line: 280, value: 300, readout: 300, focus: 260, rise: 4 } as const;
const UP = Easing.bezier(0.2, 0.7, 0.2, 1);
const outCubic = (k: number) => 1 - Math.pow(1 - k, 3);

/** The number shown while counting from `from` to `to`, `k` of the way through (0..1), on the out-cubic curve. */
export const countAt = (from: number, to: number, k: number) => Math.round(from + (to - from) * outCubic(Math.max(0, Math.min(1, k))));

/** A number that counts to each new value in 620 ms when `animate` is on, and jumps there otherwise. */
export function useCountTo(to: number, animate: boolean, from?: number) {
  const [shown, setShown] = useState(from ?? to);
  const at = useRef(from ?? to);
  useEffect(() => {
    const start = at.current;
    if (!animate || start === to) { at.current = to; setShown(to); return; }
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / TEXT_MOTION.count), n = countAt(start, to, k);
      at.current = n; setShown(n);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [to, animate]);
  return shown;
}

/** A block that fades up into place (4 pt, `ms`) each time `k` changes while `animate` is on; the first draw shows it at once. */
export function FadeUp({ k, animate, ms = TEXT_MOTION.line, style, children, testID }: {
  k: string; animate: boolean; ms?: number; style?: StyleProp<ViewStyle>; children: ReactNode; testID?: string }) {
  const v = useSharedValue(1);
  const last = useRef(k);
  useEffect(() => {
    if (last.current === k) return;
    last.current = k;
    if (!animate) { v.value = 1; return; }
    v.value = 0;
    v.value = withTiming(1, { duration: ms, easing: UP });
  }, [k, animate, ms, v]);
  const anim = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * TEXT_MOTION.rise }] }));
  return <Animated.View style={[style, anim]} testID={testID}>{children}</Animated.View>;
}

const AnimatedG = Animated.createAnimatedComponent(G);
/** An SVG group at `opacity` that eases to a new opacity in `ms` (linear), and fades in from nothing over 300 ms when `k`
 * changes while `animate` is on. Without `animate` it simply draws at `opacity`. */
export function FadeG({ k = '', opacity, animate, ms = TEXT_MOTION.focus, children }: { k?: string; opacity: number; animate: boolean; ms?: number; children: ReactNode }) {
  const v = useSharedValue(opacity);
  const last = useRef(k);
  useEffect(() => {
    const changed = last.current !== k;
    last.current = k;
    if (!animate) { v.value = opacity; return; }
    if (changed) { v.value = 0; v.value = withTiming(opacity, { duration: TEXT_MOTION.readout, easing: Easing.linear }); }
    else v.value = withTiming(opacity, { duration: ms, easing: Easing.linear });
  }, [k, opacity, animate, ms, v]);
  const props = useAnimatedProps(() => ({ opacity: v.value }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}
