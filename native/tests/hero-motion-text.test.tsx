import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { countAt, TEXT_MOTION, useCountTo } from '../src/features/home/hero/text-motion';
import { WEEK_MOTION } from '../src/features/home/hero/week';

test('the day score counts to its new value in 620 ms on an out-cubic curve', () => {
  expect(TEXT_MOTION.count).toBe(620);
  expect(countAt(40, 80, 0)).toBe(40);
  expect(countAt(40, 80, 0.5)).toBe(75);
  expect(countAt(40, 80, 1)).toBe(80);
  expect(countAt(80, 40, 2)).toBe(40);
});

test('the words follow the mockup: lines fade up 4 pt in 280 ms, values in 300 ms, readouts fade in 300 ms', () => {
  expect(TEXT_MOTION).toMatchObject({ line: 280, value: 300, readout: 300, focus: 260, rise: 4 });
});

test('the week: the glow settles in 500 ms, a day lights from 42 and 62 percent in 340 ms, its name grows to 110 percent', () => {
  expect(WEEK_MOTION.settle.duration).toBe(500);
  expect(WEEK_MOTION.light.duration).toBe(340);
  expect([WEEK_MOTION.beamsOff, WEEK_MOTION.gaugesOff]).toEqual([0.42, 0.62]);
  expect(WEEK_MOTION.grow.duration).toBe(420);
  expect(WEEK_MOTION.on).toBe(1.1);
  expect(WEEK_MOTION.tick).toMatchObject({ up: 1.2, duration: 110 });
});

function Count({ to, animate }: { to: number; animate: boolean }) { return <Text testID="n">{useCountTo(to, animate)}</Text>; }

test('without motion the number jumps straight to the new value', async () => {
  const view = await render(<Count to={40} animate={false} />);
  await act(async () => { view.rerender(<Count to={72} animate={false} />); });
  expect(screen.getByTestId('n').props.children).toBe(72);
});

test('with motion it reaches the new value once the count has run', async () => {
  jest.useFakeTimers({ now: 0 });
  const view = await render(<Count to={40} animate />);
  await act(async () => { view.rerender(<Count to={72} animate />); });
  const first = screen.getByTestId('n').props.children;
  expect(first).toBeLessThan(72);
  await act(async () => { jest.setSystemTime(700); jest.advanceTimersByTime(700); });
  expect(screen.getByTestId('n').props.children).toBe(72);
  jest.useRealTimers();
});
