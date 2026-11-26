import { useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { font } from '@/components/kit-style';
import { t } from '@/i18n/en';
import { PEAK, PEAK_VIEWBOX, peakHeight, peakStroke } from './peak';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The launch's own colours: neutral, the same for every palette and app icon (ONBOARDING.md, ob-launch). */
export const LAUNCH_COLORS = { dark: { bg: '#0B0B0C', ink: '#F4F4F5' }, light: { bg: '#FAFAFA', ink: '#141416' } } as const;

/** The timing in ms (pages/onboarding.js `.ob-launch`): the line draws in, the name fades up, then the whole cover fades. */
export const LAUNCH_TIMING = {
  draw: { delay: 40, duration: 720 },
  name: { delay: 380, duration: 420 },
  out: { delay: 860, duration: 260 },
  /** Reduce Motion: a still, finished frame that fades. */
  still: { delay: 450, duration: 200 },
} as const;

/** When the cover is gone and leaves the tree. */
export const launchEnd = (reduced: boolean) => reduced ? LAUNCH_TIMING.still.delay + LAUNCH_TIMING.still.duration : LAUNCH_TIMING.out.delay + LAUNCH_TIMING.out.duration;

const WIDTH = 176;
const DRAW = Easing.bezier(0.45, 0.05, 0.2, 1), EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * The launch animation, on every cold start, over whatever the app is drawing underneath: the mountain line draws in over
 * a faint copy of itself, "Insight" fades up under it, then the cover fades away in about 1.1 seconds. It never waits for
 * fonts or data and never takes a touch (the app below is live from the first frame). No sound, no haptic, hidden from
 * VoiceOver. Reduce Motion shows the finished frame and fades it at 0.45 seconds.
 */
export function LaunchOverlay() {
  const scheme = useColorScheme();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(true);
  const [still] = useState(reduced);
  const draw = useSharedValue(still ? 1 : 0), name = useSharedValue(still ? 1 : 0), cover = useSharedValue(1);
  useEffect(() => {
    const T = LAUNCH_TIMING;
    if (still) cover.value = withDelay(T.still.delay, withTiming(0, { duration: T.still.duration, easing: Easing.linear }));
    else {
      draw.value = withDelay(T.draw.delay, withTiming(1, { duration: T.draw.duration, easing: DRAW }));
      name.value = withDelay(T.name.delay, withTiming(1, { duration: T.name.duration, easing: EASE }));
      cover.value = withDelay(T.out.delay, withTiming(0, { duration: T.out.duration, easing: Easing.linear }));
    }
    const done = setTimeout(() => setShown(false), launchEnd(still) + 40);
    return () => clearTimeout(done);
  }, [still, draw, name, cover]);
  const line = useAnimatedProps(() => ({ strokeDashoffset: PEAK.len * (1 - draw.value) }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: name.value, transform: [{ translateY: 4 * (1 - name.value) }] }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  if (!shown) return null;
  const c = LAUNCH_COLORS[scheme === 'light' ? 'light' : 'dark'];
  return <Animated.View testID="launch-overlay" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }, coverStyle]}>
    <View style={{ alignItems: 'center', gap: 18, marginTop: -28 }}>
      <Svg width={WIDTH} height={peakHeight(WIDTH)} viewBox={PEAK_VIEWBOX} style={{ overflow: 'visible' }}>
        <Path d={PEAK.d} fill="none" stroke={c.ink} strokeOpacity={0.16} strokeWidth={peakStroke(1.5, WIDTH)} strokeLinecap="round" strokeLinejoin="round" />
        <AnimatedPath d={PEAK.d} fill="none" stroke={c.ink} strokeWidth={peakStroke(2.2, WIDTH)} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={[PEAK.len, PEAK.len + 1]} animatedProps={line} />
      </Svg>
      <Animated.Text allowFontScaling={false} style={[font(700, 28, 1, -0.035), { color: c.ink }, nameStyle]}>{t('obaLaunchName')}</Animated.Text>
    </View>
  </Animated.View>;
}
