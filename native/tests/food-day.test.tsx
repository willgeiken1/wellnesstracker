import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useFoodDay } from '../src/features/food/use-food-day';

let wake: ((state: AppStateStatus) => void) | undefined;
beforeEach(() => {
  jest.useFakeTimers();
  // Monday evening, after dinner, on a made-up day.
  jest.setSystemTime(new Date(2026, 10, 9, 20, 0));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => { wake = handler as (state: AppStateStatus) => void; return { remove: jest.fn() } as never; });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); wake = undefined; });
const comeBack = async (at: Date) => { jest.setSystemTime(at); await act(async () => wake?.('active')); };

test('after a night in the background the Food day moves to today', async () => {
  const { result } = await renderHook(() => useFoodDay());
  expect(result.current[0]).toBe('2026-11-09');
  await comeBack(new Date(2026, 10, 10, 8, 0));
  expect(result.current[0]).toBe('2026-11-10');
});

test('a day the person picked stays while the food day lasts, and gives way the next morning', async () => {
  const { result } = await renderHook(() => useFoodDay());
  await act(async () => result.current[1]('2026-11-07'));
  expect(result.current[0]).toBe('2026-11-07');
  // Still Monday's food day at 1 a.m. (the day turns at 4 a.m.).
  await comeBack(new Date(2026, 10, 10, 1, 0));
  expect(result.current[0]).toBe('2026-11-07');
  await comeBack(new Date(2026, 10, 10, 8, 0));
  expect(result.current[0]).toBe('2026-11-10');
});
