import { useEffect, useId, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, Path } from 'react-native-svg';
import Animated, { Easing, interpolateColor, ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { alpha, useKit } from '@/components/kit';
import { PEAK_D, PEAK_LENGTH, PEAK_VIEWBOX as VB } from './peak-path';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const never = { reduceMotion: ReduceMotion.Never } as const;

/**
 * The progress mountain: the Lit Peaks line with a track, a soft glow and a line, lit from the left by `frac` (0 to 1).
 * The lit part moves over 0.9 s; the colour changes over 0.45 s. Reduce Motion: the lit part jumps and the colour fades
 * in 0.2 s. With a `label` it is a progress bar for VoiceOver; without one it is hidden.
 */
export function Peak({ frac, color, width = 104, label, testID }: { frac: number; color: string; width?: number; label?: string; testID?: string }) {
  const k = useKit(), reduced = k.reduceMotion;
  const scale = width / VB.w, height = width * VB.h / VB.w;
  const lit = Math.max(0, Math.min(1, frac));
  const shown = useSharedValue(lit);
  const from = useSharedValue(color), to = useSharedValue(color), mixed = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return;
    shown.value = reduced ? lit : withTiming(lit, { duration: 900, easing: EASE, ...never });
  }, [lit, reduced, shown]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    from.value = to.value; to.value = color; mixed.value = 0;
    mixed.value = withTiming(1, { duration: reduced ? 200 : 450, easing: Easing.linear, ...never });
  }, [color, reduced, from, to, mixed]);
  const dash = useAnimatedProps(() => ({
    // The lit part is the first dash; at 0 it is a dot, as the design shows on the first step.
    strokeDasharray: [PEAK_LENGTH * shown.value, PEAK_LENGTH + 40],
    stroke: interpolateColor(mixed.value, [0, 1], [from.value, to.value]),
  }));
  const id = `obg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pt = (n: number) => n / scale;
  const track = k.dark ? alpha(k.c.text, 0.22) : k.c['hair-2'];
  const a11y = label ? { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel: label, accessibilityValue: { min: 0, max: 100, now: Math.round(lit * 100) } }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };
  return <View testID={testID} {...a11y} style={{ width, height }}>
    <Svg width={width} height={height} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} style={{ overflow: 'visible' }} pointerEvents="none">
      <Defs>
        <Filter id={id} x="-10%" y="-40%" width="120%" height="180%"><FeGaussianBlur stdDeviation={14} /></Filter>
      </Defs>
      <Path d={PEAK_D} fill="none" stroke={track} strokeWidth={pt(1.5)} strokeLinecap="round" strokeLinejoin="round" />
      <AnimatedPath d={PEAK_D} fill="none" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" opacity={k.dark ? 0.55 : 0.38}
        filter={`url(#${id})`} animatedProps={dash} />
      <AnimatedPath d={PEAK_D} fill="none" strokeWidth={pt(2)} strokeLinecap="round" strokeLinejoin="round"
        animatedProps={dash} />
    </Svg>
  </View>;
}
