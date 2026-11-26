import { act, render } from '@testing-library/react-native';
import { tabArrival } from '../src/components/kit-motion';
import { resetTabScenes, TabScene, type SceneNavigation } from '../src/features/shell/tab-scene';

// Record what each move asks Reanimated for, so the test can read the mockup's timings back.
const mockValues: { value: unknown }[] = ((globalThis as Record<string, unknown>).__tabSceneValues ??= []) as { value: unknown }[];
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true, default: { View },
    Easing: { linear: 'linear' },
    withSpring: (to: number, config: object) => ({ spring: to, config }),
    withTiming: (to: number, config: object) => ({ timing: to, config }),
    withDelay: (delay: number, animation: object) => ({ delay, animation }),
    useSharedValue: (v: unknown) => React.useState(() => { const s = { value: v }; ((globalThis as Record<string, unknown>).__tabSceneValues as { value: unknown }[]).push(s); return s; })[0],
    useAnimatedStyle: (f: () => object) => f(),
  };
});
let mockReduce = false;
jest.mock('../src/design/theme-provider', () => ({ useTheme: () => ({ reduceMotion: mockReduce }) }));

function tabs(open: string) {
  let state = { index: ['a', 'b', 'c'].indexOf(open), routes: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] };
  const listeners = new Set<(e: { data: { state: typeof state } }) => void>();
  const add = (type: string, l: (e: { data: { state: typeof state } }) => void) => {
    if (type !== 'state') return () => {};
    listeners.add(l); return () => { listeners.delete(l); };
  };
  const navigation = { getState: () => state, addListener: add } as unknown as SceneNavigation;
  const go = (key: string) => act(async () => { state = { ...state, index: ['a', 'b', 'c'].indexOf(key) }; listeners.forEach(l => l({ data: { state } })); });
  return { navigation, go };
}
const scene = async (navigation: SceneNavigation, key: string, home = false) => {
  const before = mockValues.length;
  await render(<TabScene routeKey={key} home={home} navigation={navigation}>{null}</TabScene>);
  return { opacity: mockValues[before], rise: mockValues[before + 1] };
};
beforeEach(() => { resetTabScenes(); mockValues.length = 0; mockReduce = false; });

test('the timings are the mockup\'s: a 180 ms fade after 40 ms and an 8 pt rise, a first visit only fades, Reduce Motion fades 200 ms', () => {
  expect(tabArrival(false, false, false)).toEqual({ fade: 180, delay: 40, rise: 8 });
  expect(tabArrival(true, false, false)).toEqual({ fade: 180, delay: 0, rise: 0 });
  expect(tabArrival(true, true, false)).toEqual({ fade: 180, delay: 40, rise: 8 });
  expect(tabArrival(false, false, true)).toEqual({ fade: 200, delay: 0, rise: 0 });
});

test('a tab that opens fades in and rises on the tab spring; the one that leaves fades out in 110 ms underneath', async () => {
  const { navigation, go } = tabs('a');
  const a = await scene(navigation, 'a', true), b = await scene(navigation, 'b');
  expect(a.opacity.value).toEqual({ delay: 40, animation: { timing: 1, config: { duration: 180, easing: 'linear' } } });
  expect(a.rise.value).toEqual({ spring: 0, config: { mass: 1, stiffness: 560, damping: 46 } });
  await go('b');
  expect(a.opacity.value).toEqual({ timing: 0, config: { duration: 110, easing: 'linear' } });
  // b was already drawn and had never been open: its first visit only fades.
  expect(b.opacity.value).toEqual({ delay: 0, animation: { timing: 1, config: { duration: 180, easing: 'linear' } } });
  expect(b.rise.value).toBe(0);
  await go('a'); await go('b');
  expect(b.rise.value).toEqual({ spring: 0, config: { mass: 1, stiffness: 560, damping: 46 } });
});

test('a page drawn for its first visit after another tab only fades in', async () => {
  const { navigation, go } = tabs('a');
  await scene(navigation, 'a', true);
  await go('c');
  const c = await scene(navigation, 'c');
  expect(c.opacity.value).toEqual({ delay: 0, animation: { timing: 1, config: { duration: 180, easing: 'linear' } } });
  expect(c.rise.value).toBe(0);
});

test('under Reduce Motion a page only cross-fades: 200 ms in, nothing travels', async () => {
  mockReduce = true;
  const { navigation, go } = tabs('a');
  const a = await scene(navigation, 'a', true), b = await scene(navigation, 'b');
  await go('b'); await go('a');
  expect(a.opacity.value).toEqual({ delay: 0, animation: { timing: 1, config: { duration: 200, easing: 'linear' } } });
  expect(a.rise.value).toBe(0);
  expect(b.opacity.value).toEqual({ timing: 0, config: { duration: 110, easing: 'linear' } });
});

test('a page under the navigator starts unseen, so it never shows for a frame before it fades in', async () => {
  const { navigation } = tabs('a');
  const b = await scene(navigation, 'b');
  expect(b.opacity.value).toBe(0);
});

test('a state change that keeps the same tab open moves nothing', async () => {
  const { navigation, go } = tabs('a');
  const a = await scene(navigation, 'a', true);
  const before = a.opacity.value;
  await go('a');
  expect(a.opacity.value).toBe(before);
});
