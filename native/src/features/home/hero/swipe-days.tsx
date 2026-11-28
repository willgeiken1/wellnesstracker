import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { GLIDE, SWIPE, swipeDrag, swipeLean, swipeTarget } from './day-swipe';

const GLIDE_IN = { duration: GLIDE.inMs, easing: Easing.bezier(0.2, 0.75, 0.2, 1) };
/** Writes a shared value handed down as a prop (Home owns the swipe; the compiler lint can't see that it's meant to be written). */
const put = (sv: SharedValue<number>, v: number) => { 'worklet'; sv.value = v; };
const GLIDE_BACK = { duration: GLIDE.backMs, easing: Easing.bezier(0.3, 1.25, 0.5, 1) };

/**
 * The same day swipe as the Aurora map, for Ridgeline and numbers only: the map leans with the finger (swipeLean), a swipe
 * past the commit distance or a flick picks the next day, and the new day glides in from the side it came from while its
 * peaks, bars and numbers ease to their new values. A short swipe springs back. Reduce Motion keeps the swipe and drops the lean.
 */
export function SwipeDays({ sel, swipe, reduceMotion, onSwipeDay, children }: {
  sel: number; swipe: SharedValue<number>; reduceMotion: boolean; onSwipeDay: (sel: number) => void; children: ReactNode;
}) {
  const at = useSharedValue(sel), x = useSharedValue(0), o = useSharedValue(1), last = useRef(sel);
  useLayoutEffect(() => {
    const dir = Math.sign(sel - last.current);
    last.current = sel; at.value = sel;
    if (!dir || reduceMotion) { x.value = 0; o.value = 1; return; }
    // The lean the finger left folds into the glide, so the map never jumps back to the middle first.
    const lean = swipeLean(swipe.value);
    x.value = lean.x + dir * GLIDE.inX; o.value = Math.min(lean.opacity, 0.55);
    x.value = withTiming(0, GLIDE_IN); o.value = withTiming(1, GLIDE_IN);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = (dx: number, vx: number, canceled: boolean) => {
    const to = canceled ? null : swipeTarget(dx, vx, sel);
    if (to != null) onSwipeDay(to);
    else put(swipe, reduceMotion ? 0 : withTiming(0, GLIDE_BACK));
  };
  const rm = reduceMotion;
  const pan = usePanGesture({
    activeOffsetX: [-SWIPE.start, SWIPE.start], failOffsetY: [-SWIPE.cancel, SWIPE.cancel],
    onUpdate: e => { 'worklet'; if (!rm) put(swipe, swipeDrag(e.translationX, at.value)); },
    onDeactivate: e => { 'worklet'; runOnJS(end)(e.translationX, e.velocityX, e.canceled); },
  });
  const style = useAnimatedStyle(() => {
    const lean = swipeLean(swipe.value);
    return { opacity: o.value * lean.opacity, transform: [{ translateX: x.value + lean.x }] };
  });
  return <GestureDetector gesture={pan}><Animated.View style={style}>{children}</Animated.View></GestureDetector>;
}
