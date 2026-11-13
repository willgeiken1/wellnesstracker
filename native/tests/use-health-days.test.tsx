import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import type { HealthSource } from '../src/features/health/source';
import { useHealthDays } from '../src/features/health/use-health-days';

// Made-up values only.
function Probe({ source, focused = true }: { source: HealthSource; focused?: boolean }) {
  const read = useHealthDays(focused, source, 1);
  return <Text testID="steps">{read?.steps ? String(read.steps[0]) : 'none'}</Text>;
}
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const base = { access: async () => 'asked' as const, request: async () => {}, weights: async () => [], sleep: async () => [] };

test('a slow earlier read never overwrites a newer one', async () => {
  const waiting: ((n: number) => void)[] = [];
  let listener: ((state: string) => void) | undefined;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => { listener = fn; return { remove: () => {} }; }) as never);
  const source: HealthSource = { ...base, steps: () => new Promise<number>(resolve => { waiting.push(resolve); }) };
  await render(<Probe source={source} />);
  await settle();
  await act(async () => { listener?.('active'); });
  await settle();
  expect(waiting).toHaveLength(2);
  await act(async () => { waiting[1](222); });
  await settle();
  expect(screen.getByTestId('steps').props.children).toBe('222');
  await act(async () => { waiting[0](111); });
  await settle();
  expect(screen.getByTestId('steps').props.children).toBe('222');
  spy.mockRestore();
});

test('it reads again when the screen comes back to the front, and not while it is behind another', async () => {
  const steps = jest.fn(async () => 4000);
  const source: HealthSource = { ...base, steps };
  const view = await render(<Probe source={source} focused={false} />);
  await settle();
  expect(steps).not.toHaveBeenCalled();
  await view.rerender(<Probe source={source} focused />);
  await settle();
  expect(steps).toHaveBeenCalledTimes(1);
  await view.rerender(<Probe source={source} focused={false} />);
  await view.rerender(<Probe source={source} focused />);
  await settle();
  expect(steps).toHaveBeenCalledTimes(2);
});

test('an app left open overnight reads the new day when it comes forward, not the day it was opened on', async () => {
  jest.useFakeTimers();
  try {
    jest.setSystemTime(new Date(2026, 10, 12, 23, 50));
    let listener: ((state: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => { listener = fn; return { remove: () => {} }; }) as never);
    const windows: [Date, Date][] = [];
    const source: HealthSource = { ...base, steps: async (from, to) => { windows.push([from, to]); return 1; } };
    await render(<Probe source={source} />);
    await settle();
    jest.setSystemTime(new Date(2026, 10, 13, 8, 0));
    await act(async () => { listener?.('active'); });
    await settle();
    expect(windows).toEqual([
      [new Date(2026, 10, 12), new Date(2026, 10, 12, 23, 50)],
      [new Date(2026, 10, 13), new Date(2026, 10, 13, 8, 0)],
    ]);
    spy.mockRestore();
  } finally { jest.useRealTimers(); }
});
