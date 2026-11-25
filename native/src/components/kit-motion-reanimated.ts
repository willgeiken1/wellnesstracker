import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
  type EntryExitAnimationFunction, type WithSpringConfig, type WithTimingConfig,
} from 'react-native-reanimated';
import { DISTANCES, FADES, SPRINGS, type SpringName } from './kit-motion';

/* The mockup's motion presets (motion.css) as Reanimated helpers. Each one checks Reduce Motion itself: with it on,
   nothing travels and every move is a 200 ms cross-fade, as the mockup does.
   Tests that render these need Reanimated's Jest resolver (see KIT.md). */

export { Animated };

/** The Reanimated withSpring config for one of the kit's springs. Follows the system's Reduce Motion setting. */
export function kitSpring(name: SpringName): WithSpringConfig {
  const { mass, stiffness, damping } = SPRINGS[name];
  return { mass, stiffness, damping, overshootClamping: false, reduceMotion: ReduceMotion.System };
}
/** A linear fade of `ms`. */
export const kitFade = (ms: number): WithTimingConfig => ({ duration: ms, easing: Easing.linear, reduceMotion: ReduceMotion.Never });

/** The `.press` look on a Reanimated view: 97 percent and 88 percent opacity in 90 ms, back on the press spring.
 * Reduce Motion: a dim to 70 percent only. Spread `handlers` on the Pressable and put `style` on the Animated.View. */
export function useKitPress(disabled = false) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1), opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }], opacity: opacity.get() }));
  const onPressIn = () => {
    if (disabled) return;
    if (reduced) { opacity.set(DISTANCES.pressOpacityReduced); return; }
    scale.set(withTiming(DISTANCES.pressScale, { duration: FADES.pressIn, easing: Easing.bezier(0.25, 0.6, 0.4, 1) }));
    opacity.set(withTiming(DISTANCES.pressOpacity, kitFade(60)));
  };
  const onPressOut = () => {
    if (reduced) { opacity.set(1); return; }
    scale.set(withSpring(1, kitSpring('press')));
    opacity.set(withTiming(1, kitFade(220)));
  };
  return { style, handlers: { onPressIn, onPressOut } };
}

const fadeOnly = (delay = 0): EntryExitAnimationFunction => () => {
  'worklet';
  return { initialValues: { opacity: 0 }, animations: { opacity: withDelay(delay, withTiming(1, { duration: FADES.reduced, easing: Easing.linear })) } };
};

/** A tab page as it opens: fades in over 180 ms after 40 ms and rises 8 pt on the tab spring. */
export function tabPageEntering(reduced: boolean): EntryExitAnimationFunction {
  if (reduced) return fadeOnly();
  const spring = kitSpring('tab');
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: DISTANCES.tabRise }] },
      animations: {
        opacity: withDelay(FADES.tabDelay, withTiming(1, { duration: FADES.tab, easing: Easing.linear })),
        transform: [{ translateY: withSpring(0, spring) }],
      },
    };
  };
}
/** The page that leaves when another tab opens: fades out in 110 ms. */
export function tabPageExiting(): EntryExitAnimationFunction {
  return () => {
    'worklet';
    return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, { duration: FADES.tabOut, easing: Easing.linear }) } };
  };
}

/** Item `index` of a tab's first visit: fades in over 240 ms and settles 10 pt on the soft spring, 28 ms after the one before. */
export function listItemEntering(index: number, reduced: boolean): EntryExitAnimationFunction {
  if (reduced) return fadeOnly();
  const i = Math.min(index, 7), delay = DISTANCES.tabStaggerDelay + i * DISTANCES.tabStaggerStep, spring = kitSpring('soft');
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: DISTANCES.tabStagger }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: DISTANCES.tabStaggerFade, easing: Easing.linear })),
        transform: [{ translateY: withDelay(delay, withSpring(0, spring)) }],
      },
    };
  };
}

/** Item `index` of a rising sheet: trails the sheet by 18 pt and settles on the soft spring, 22 ms apart for the first 8
 * items, then together. The content is always visible while it moves. */
export function sheetItemEntering(index: number, reduced: boolean): EntryExitAnimationFunction {
  if (reduced) return fadeOnly();
  const i = Math.min(index, DISTANCES.sheetStaggerItems - 1), delay = i * DISTANCES.sheetStaggerStep, spring = kitSpring('soft');
  return () => {
    'worklet';
    return {
      initialValues: { transform: [{ translateY: DISTANCES.sheetTrail }] },
      animations: { transform: [{ translateY: withDelay(delay, withSpring(0, spring)) }] },
    };
  };
}

/** A toast arriving: opacity in 180 ms, a 16 pt rise from 96 percent on the toast spring. */
export function toastEntering(reduced: boolean): EntryExitAnimationFunction {
  if (reduced) return fadeOnly();
  const spring = kitSpring('toast');
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: DISTANCES.toastRise }, { scale: DISTANCES.toastScale }] },
      animations: {
        opacity: withTiming(1, { duration: 180, easing: Easing.linear }),
        transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }],
      },
    };
  };
}
/** A toast leaving quickly: 160 ms fade while it drops back. */
export function toastExiting(reduced: boolean): EntryExitAnimationFunction {
  return () => {
    'worklet';
    if (reduced) return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, { duration: FADES.reduced, easing: Easing.linear }) } };
    const ease = Easing.bezier(0.4, 0, 1, 1);
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
      animations: {
        opacity: withTiming(0, { duration: 160, easing: Easing.linear }),
        transform: [{ translateY: withTiming(DISTANCES.toastRise, { duration: 220, easing: ease }) }, { scale: withTiming(DISTANCES.toastScale, { duration: 220, easing: ease }) }],
      },
    };
  };
}

/** The selected tab icon landing: from 78 percent on the pop spring (about 4 percent overshoot). None under Reduce Motion. */
export function popEntering(reduced: boolean): EntryExitAnimationFunction | undefined {
  if (reduced) return undefined;
  const spring = kitSpring('pop');
  return () => {
    'worklet';
    return { initialValues: { transform: [{ scale: DISTANCES.popFrom }] }, animations: { transform: [{ scale: withSpring(1, spring) }] } };
  };
}

/** Reduce Motion as Reanimated sees it, for choosing a preset above. */
export { useReducedMotion };
