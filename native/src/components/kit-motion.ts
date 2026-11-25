import { useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useTheme } from '@/design/theme-provider';

/* The mockup's motion system (motion.css): one set of springs for every move in the app. Values are the Reanimated
   withSpring configs the mockup was sampled from, so React Native's Animated.spring and Reanimated's withSpring draw
   the same curve. Under Reduce Motion nothing travels: every move becomes a short cross-fade. */

export type SpringName = 'push' | 'sheet' | 'tab' | 'soft' | 'press' | 'pop' | 'toast' | 'switch';
/** { mass, stiffness, damping } for each spring, with the time the mockup samples it over (ms). */
export const SPRINGS: Record<SpringName, { mass: 1; stiffness: number; damping: number; ms: number }> = {
  push: { mass: 1, stiffness: 300, damping: 35, ms: 530 },
  sheet: { mass: 1, stiffness: 260, damping: 32, ms: 540 },
  tab: { mass: 1, stiffness: 560, damping: 46, ms: 340 },
  soft: { mass: 1, stiffness: 220, damping: 30, ms: 620 },
  press: { mass: 1, stiffness: 700, damping: 32, ms: 380 },
  pop: { mass: 1, stiffness: 520, damping: 21, ms: 550 },
  toast: { mass: 1, stiffness: 400, damping: 28, ms: 490 },
  switch: { mass: 1, stiffness: 620, damping: 38, ms: 320 },
};
/** Linear fades (ms): the incoming tab page (after a 40 ms delay), the outgoing one, the sheet scrim, every move under
 * Reduce Motion, and a press going down. */
export const FADES = { tab: 180, tabDelay: 40, tabOut: 110, scrim: 300, reduced: 200, pressIn: 90 } as const;
/** How far things travel (pt, or a fraction where noted). */
export const DISTANCES = {
  /** The page under a pushed screen shifts left by this share of its width and dims. */ underX: -0.3,
  /** The dim on a page pushed under, dark and light. */ dimDark: 0.32, dimLight: 0.1,
  /** The page behind a large sheet becomes a card: scale, corner radius and top. */ cardScale: 0.94, cardRadius: 12, cardTop: 50,
  /** A tab page rises this far as it fades in. */ tabRise: 8,
  /** A tab's first visit: items rise this far, one after another. */ tabStagger: 10, tabStaggerStep: 28, tabStaggerDelay: 30, tabStaggerFade: 240,
  /** A rising sheet's content trails it by this much, item by item for the first 8. */ sheetTrail: 18, sheetStaggerStep: 22, sheetStaggerItems: 8,
  /** A pressed control. */ pressScale: 0.97, pressOpacity: 0.88, pressOpacityReduced: 0.7,
  /** A toast springs up this far from this scale. */ toastRise: 16, toastScale: 0.96,
  /** The selected tab icon lands from this scale. */ popFrom: 0.78,
} as const;

/** An Animated.spring config for one of the kit's springs. */
export function springConfig(name: SpringName, toValue: number, useNativeDriver = true): Animated.SpringAnimationConfig {
  const { mass, stiffness, damping } = SPRINGS[name];
  return { toValue, mass, stiffness, damping, overshootClamping: false, useNativeDriver };
}

/**
 * The mockup's `.press`: a control dips to 97 percent and 88 percent opacity in 90 ms when touched, and springs back on
 * release. Under Reduce Motion it only dims to 70 percent. Spread `handlers` on the Pressable and `style` on the
 * Animated.View that draws the control.
 */
export function usePressScale(disabled = false) {
  const { reduceMotion } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [opacity] = useState(() => new Animated.Value(1));
  const down = () => {
    if (disabled) return;
    if (reduceMotion) { opacity.setValue(DISTANCES.pressOpacityReduced); return; }
    Animated.parallel([
      Animated.timing(scale, { toValue: DISTANCES.pressScale, duration: FADES.pressIn, easing: Easing.bezier(0.25, 0.6, 0.4, 1), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: DISTANCES.pressOpacity, duration: 60, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  };
  const up = () => {
    if (reduceMotion) { opacity.setValue(1); scale.setValue(1); return; }
    Animated.parallel([
      Animated.spring(scale, springConfig('press', 1)),
      Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  };
  return { style: { transform: [{ scale }], opacity }, handlers: { onPressIn: down, onPressOut: up } };
}
