import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { useSpringPress } from '../src/features/shell/press';

// Record what a press asks Reanimated for, so the test reads the mockup's timings back.
const mockValues: { value: unknown }[] = ((globalThis as Record<string, unknown>).__pressValues ??= []) as { value: unknown }[];
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    __esModule: true,
    Easing: { linear: 'linear', bezier: (...p: number[]) => `bezier(${p.join(',')})` },
    withSpring: (to: number, config: object) => ({ spring: to, config }),
    withTiming: (to: number, config: object) => ({ timing: to, config }),
    useSharedValue: (v: unknown) => React.useState(() => { const s = { value: v, set(next: unknown) { s.value = next; } }; ((globalThis as Record<string, unknown>).__pressValues as { value: unknown }[]).push(s); return s; })[0],
    useAnimatedStyle: (f: () => object) => f(),
  };
});
function Probe({ to, reduced, dimTo }: { to: number; reduced: boolean; dimTo?: number }) {
  const p = useSpringPress(to, reduced, dimTo);
  return <Pressable testID="probe" onPressIn={p.onPressIn} onPressOut={p.onPressOut} />;
}
const press = async (phase: 'pressIn' | 'pressOut') => act(async () => { fireEvent(screen.getByTestId('probe'), phase); });
beforeEach(() => { mockValues.length = 0; });

test('a tab shrinks to 86 percent in 90 ms and springs back on the press spring', async () => {
  await render(<Probe to={0.86} reduced={false} />);
  const [scale, dim] = mockValues;
  await press('pressIn');
  expect(scale.value).toEqual({ timing: 0.86, config: { duration: 90, easing: 'bezier(0.25,0.6,0.4,1)' } });
  expect(dim.value).toBe(1);
  await press('pressOut');
  expect(scale.value).toEqual({ spring: 1, config: { mass: 1, stiffness: 700, damping: 32 } });
});

test('the avatar dips to 97 percent and 88 percent opacity, as the kit press does', async () => {
  await render(<Probe to={0.97} reduced={false} dimTo={0.88} />);
  const [scale, dim] = mockValues;
  await press('pressIn');
  expect(scale.value).toMatchObject({ timing: 0.97 });
  expect(dim.value).toEqual({ timing: 0.88, config: { duration: 60, easing: 'linear' } });
  await press('pressOut');
  expect(dim.value).toEqual({ timing: 1, config: { duration: 220, easing: 'linear' } });
});

test('under Reduce Motion nothing shrinks: the control dims to 70 percent while held', async () => {
  await render(<Probe to={0.86} reduced />);
  const [scale, dim] = mockValues;
  await press('pressIn');
  expect(scale.value).toBe(1);
  expect(dim.value).toBe(0.7);
  await press('pressOut');
  expect(dim.value).toBe(1);
  expect(scale.value).toBe(1);
});

test('a toast springs up on the toast spring and leaves quickly; under Reduce Motion it only fades', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toastMotion } = require('../src/features/shell/toast') as typeof import('../src/features/shell/toast');
  const t = toastMotion(false);
  expect(t.in.fade).toEqual({ duration: 180, easing: 'linear' });
  expect(t.in.move).toEqual({ mass: 1, stiffness: 400, damping: 28 });
  expect(t.out).toEqual({ fade: { duration: 160, easing: 'linear' }, move: { duration: 220, easing: 'bezier(0.4,0,1,1)' }, ms: 220 });
  const r = toastMotion(true);
  expect(r.in).toEqual({ fade: { duration: 200, easing: 'linear' }, move: null });
  expect(r.out.move).toBeNull();
});
