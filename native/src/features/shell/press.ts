import { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { DISTANCES, FADES, SPRINGS } from '@/components/kit-motion';

/** Touch down: the mockup's press-in curve, 90 ms. */
export const PRESS_IN = { duration: FADES.pressIn, easing: Easing.bezier(0.25, 0.6, 0.4, 1) };
const RELEASE = { mass: 1, stiffness: SPRINGS.press.stiffness, damping: SPRINGS.press.damping };

/**
 * A control on the bar or the arc under a finger (motion.css): it shrinks to `to` in 90 ms and springs back on the press
 * spring when let go; with `dimTo` it also dims (the kit's .press: 97 percent and 88 percent). Under Reduce Motion it does not shrink; it dims to 70 percent while held.
 */
export function useSpringPress(to: number, reduced: boolean, dimTo = 1) {
  const scale = useSharedValue(1), dim = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: dim.value, transform: [{ scale: scale.value }] }));
  const onPressIn = () => {
    if (reduced) { dim.value = DISTANCES.pressOpacityReduced; return; }
    scale.value = withTiming(to, PRESS_IN);
    if (dimTo < 1) dim.value = withTiming(dimTo, { duration: 60, easing: Easing.linear });
  };
  const onPressOut = () => {
    dim.value = reduced || dimTo >= 1 ? 1 : withTiming(1, { duration: 220, easing: Easing.linear });
    scale.value = reduced ? 1 : withSpring(1, RELEASE);
  };
  return { style, onPressIn, onPressOut };
}
