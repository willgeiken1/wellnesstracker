import { kitSpring, listItemEntering, popEntering, sheetItemEntering, tabPageEntering, toastEntering } from '../src/components/kit-motion-reanimated';
// Reanimated needs its own Jest resolver to load; these tests only check the presets' values, so a light stand-in is enough.
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'Animated.View' },
  Easing: { linear: 'linear', bezier: (...p: number[]) => `bezier(${p.join(',')})` },
  ReduceMotion: { System: 'system', Never: 'never' },
  withSpring: (to: number, config: object) => ({ spring: to, config }),
  withTiming: (to: number, config: object) => ({ timing: to, config }),
  withDelay: (delay: number, animation: object) => ({ delay, animation }),
  useSharedValue: (v: number) => ({ value: v, get() { return this.value; }, set(n: number) { this.value = n; } }), useAnimatedStyle: (f: () => object) => f(), useReducedMotion: () => false,
}));

const run = (f: unknown) => (f as () => { initialValues: Record<string, unknown>; animations: Record<string, unknown> })();

test('springs carry the mockup values and follow the system Reduce Motion setting', () => {
  expect(kitSpring('sheet')).toEqual({ mass: 1, stiffness: 260, damping: 32, overshootClamping: false, reduceMotion: 'system' });
  expect(kitSpring('press')).toMatchObject({ stiffness: 700, damping: 32 });
});

test('a tab page fades in after 40 ms and rises 8 pt on the tab spring', () => {
  const a = run(tabPageEntering(false));
  expect(a.initialValues).toEqual({ opacity: 0, transform: [{ translateY: 8 }] });
  expect(a.animations.opacity).toEqual({ delay: 40, animation: { timing: 1, config: { duration: 180, easing: 'linear' } } });
  expect((a.animations.transform as { translateY: { config: object } }[])[0].translateY.config).toMatchObject({ stiffness: 560, damping: 46 });
});

test('list items settle 10 pt, 28 ms apart; sheet items trail 18 pt, 22 ms apart for the first 8', () => {
  const third = run(listItemEntering(2, false));
  expect(third.initialValues).toEqual({ opacity: 0, transform: [{ translateY: 10 }] });
  expect((third.animations.opacity as { delay: number }).delay).toBe(30 + 2 * 28);
  const ninth = run(sheetItemEntering(9, false));
  expect(ninth.initialValues).toEqual({ transform: [{ translateY: 18 }] });
  expect((ninth.animations.transform as { translateY: { delay: number } }[])[0].translateY.delay).toBe(7 * 22);
});

test('under Reduce Motion nothing travels: every preset is a 200 ms fade, and the tab icon does not pop', () => {
  for (const preset of [tabPageEntering(true), listItemEntering(3, true), sheetItemEntering(1, true), toastEntering(true)]) {
    const a = run(preset);
    expect(a.initialValues).toEqual({ opacity: 0 });
    expect(JSON.stringify(a.animations)).toContain('"duration":200');
    expect(a.animations.transform).toBeUndefined();
  }
  expect(popEntering(true)).toBeUndefined();
  expect(run(popEntering(false)).initialValues).toEqual({ transform: [{ scale: 0.78 }] });
});

test('a toast rises 16 pt from 96 percent on the toast spring', () => {
  const a = run(toastEntering(false));
  expect(a.initialValues).toEqual({ opacity: 0, transform: [{ translateY: 16 }, { scale: 0.96 }] });
});
