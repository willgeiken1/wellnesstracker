/* A small stand-in for Reanimated in Jest: values settle at once, styles are computed once. Shared by every test. */
/* eslint-disable @typescript-eslint/no-require-imports */
export function reanimatedMock() {
  const RN = require('react-native');
  const React = require('react');
  const id = (v: unknown) => v;
  const ease = Object.assign(() => 0, { bezier: () => id, inOut: () => id, ease: id, linear: id, out: () => id });
  return {
    __esModule: true,
    default: { View: RN.View, ScrollView: RN.ScrollView, Text: RN.Text, createAnimatedComponent: id },
    Easing: ease,
    cancelAnimation: () => {}, interpolate: (_v: number, _i: number[], o: number[]) => o[o.length - 1],
    measure: () => null, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f, scrollTo: () => {},
    useAnimatedRef: () => React.useRef(null), useAnimatedStyle: (f: () => unknown) => f(),
    useFrameCallback: () => ({ setActive: () => {}, isActive: false, callbackId: 0 }),
    useScrollOffset: () => ({ value: 0 }), useSharedValue: (v: unknown) => React.useRef({ value: v }).current,
    withDelay: (_d: number, v: unknown) => v, withRepeat: (v: unknown) => v, withSequence: (...v: unknown[]) => v[v.length - 1], withTiming: id,
    withSpring: id, withDecay: id, useDerivedValue: (f: () => unknown) => ({ value: f() }), useAnimatedProps: (f: () => unknown) => f(),
    useAnimatedReaction: () => {}, useAnimatedScrollHandler: () => () => {}, useReducedMotion: () => false,
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' }, makeMutable: (v: unknown) => ({ value: v }),
    View: RN.View, ScrollView: RN.ScrollView, Text: RN.Text, Image: RN.Image, FlatList: RN.FlatList, createAnimatedComponent: id,
    // Entering, exiting and layout builders: every chained call returns the same builder.
    ...Object.fromEntries(['FadeIn', 'FadeOut', 'FadeInDown', 'FadeInUp', 'FadeOutDown', 'FadeOutUp', 'SlideInDown', 'SlideOutDown', 'SlideInRight', 'SlideOutRight',
      'ZoomIn', 'ZoomOut', 'LinearTransition', 'Layout', 'CurvedTransition', 'SequencedTransition'].map(name => [name, builder()])),
  };
  function builder(): unknown { const b: Record<string, unknown> = new Proxy({}, { get: (_t, k) => (k === 'build' ? () => () => ({}) : () => b) }); return b; }
}
/* Gestures are exercised on a device; here the detectors just draw their child. */
export function gestureHandlerMock() {
  const RN = require('react-native');
  const gesture = () => ({});
  return { GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: RN.View,
    usePanGesture: gesture, useTapGesture: gesture, useLongPressGesture: gesture };
}
