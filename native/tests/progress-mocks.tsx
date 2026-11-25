/** Stand-ins shared by the Progress tests: call each from a jest.mock factory. */
export function reanimatedMock() {
  const RN = require('react-native'), React = require('react'), id = (v: unknown) => v;
  const ease = Object.assign(() => 0, { bezier: () => id, inOut: () => id, ease: id, linear: id, out: () => id });
  const Animated = { View: RN.View, ScrollView: RN.ScrollView, Text: RN.Text, createAnimatedComponent: id };
  return {
    __esModule: true, default: Animated, ...Animated, Easing: ease,
    cancelAnimation: () => {}, interpolate: (_v: number, _i: number[], o: number[]) => o[o.length - 1], measure: () => null,
    runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f, scrollTo: () => {}, useAnimatedRef: () => React.useRef(null),
    useAnimatedStyle: (f: () => unknown) => f(), useFrameCallback: () => ({ setActive: () => {}, isActive: false, callbackId: 0 }),
    useScrollOffset: () => ({ value: 0 }), useSharedValue: (v: unknown) => React.useRef({ value: v }).current,
    withDelay: (_d: number, v: unknown) => v, withRepeat: (v: unknown) => v, withSequence: (...v: unknown[]) => v[v.length - 1], withTiming: id, withSpring: id,
  };
}
export function gestureMock() {
  const RN = require('react-native'), gesture = () => ({});
  // Gesture.Tap().runOnJS(true).onEnd(...) and the like: every builder call hands back the same builder.
  const chain = (): unknown => new Proxy({}, { get: () => () => chain() });
  const Gesture = { Tap: chain, Pan: chain, LongPress: chain, Race: chain, Simultaneous: chain, Exclusive: chain };
  return { Gesture, GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: RN.View, usePanGesture: gesture, useTapGesture: gesture, useLongPressGesture: gesture };
}
