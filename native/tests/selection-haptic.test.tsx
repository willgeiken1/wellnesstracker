import { render, screen, fireEvent, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { selectionAsync } from 'expo-haptics';
import { SegmentedControl } from '../src/components/segmented-control';
import { FloatingTabs } from '../src/components/floating-tabs';
import { ChoiceChips } from '../src/features/settings/parts';
import { FoodLogModes } from '../src/features/food/modes';
import { FoodCalendar } from '../src/features/food/calendar';
import { tick } from '../src/features/workout/haptics';
import type { Repository } from '../src/data/repository';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/design/theme-provider';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  const { View: Host } = require('react-native');
  const names = ['index', 'workouts', 'food', 'progress'];
  const Tabs = ({ tabBar }: any) => React.createElement(Host, null,
    tabBar({ state: { index: 0, routes: names.map(name => ({ key: `${name}-key`, name })) }, emitter: { emit: () => ({ defaultPrevented: false }) }, navigateToTab: mockNavigate }));
  Tabs.Screen = function Screen() { return null; };
  return { Tabs };
});
let mockHaptics: boolean | undefined;
let mockSignedIn = true;
jest.mock('../src/auth/provider', () => ({
  useAuth: () => {
    if (!mockSignedIn) throw new Error('AuthProvider is required.');
    return { repository: { localGet: (key: string) => (key === 'haptics' ? mockHaptics : undefined) } };
  },
}));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const options = [{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }] as const;
const draw = (onChange = jest.fn()) => render(<SegmentedControl label="Made-up choices" options={options} value="a" onChange={onChange} />, { wrapper });

beforeEach(() => { Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true }); (selectionAsync as jest.Mock).mockClear(); mockHaptics = undefined; mockSignedIn = true; });

test('picking a new segment gives one light tick, and picking the chosen one again stays quiet', async () => {
  const onChange = jest.fn();
  await draw(onChange);
  await fireEvent.press(screen.getByRole('tab', { name: 'Second' }));
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('b');
  await fireEvent.press(screen.getByRole('tab', { name: 'First' }));
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith('a');
});

test('the Haptics switch in Settings turns the tick off', async () => {
  mockHaptics = false;
  await draw();
  await fireEvent.press(screen.getByRole('tab', { name: 'Second' }));
  expect(selectionAsync).not.toHaveBeenCalled();
});

test('a control drawn outside the app still works, with no tick and no crash', async () => {
  mockSignedIn = false;
  const onChange = jest.fn();
  await draw(onChange);
  await fireEvent.press(screen.getByRole('tab', { name: 'Second' }));
  expect(onChange).toHaveBeenCalledWith('b');
  expect(selectionAsync).not.toHaveBeenCalled();
});

test('the app in the background gets no tick', async () => {
  await draw();
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  await fireEvent.press(screen.getByRole('tab', { name: 'Second' }));
  expect(selectionAsync).not.toHaveBeenCalled();
});

test('switching tabs on the floating bar ticks once, and pressing the open tab stays quiet', async () => {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
  await render(<SafeAreaProvider initialMetrics={metrics}><FloatingTabs /></SafeAreaProvider>, { wrapper });
  await fireEvent.press(screen.getByTestId('tab-index'));
  expect(selectionAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('tab-food'));
  expect(mockNavigate).toHaveBeenCalledWith('food-key');
  expect(selectionAsync).toHaveBeenCalledTimes(1);
});

test('settings choice chips tick only when the choice changes', async () => {
  const onChange = jest.fn();
  await render(<ChoiceChips options={[{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }]} value="a" onChange={onChange} />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'First' }));
  expect(selectionAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Second' }));
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith('b');
});

test('the ways to log food tick only when the way changes', async () => {
  const onChange = jest.fn();
  await render(<FoodLogModes value="search" onChange={onChange} />, { wrapper });
  await fireEvent.press(screen.getByTestId('food-log-mode-search'));
  expect(selectionAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('food-log-mode-scan'));
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith('scan');
});

test('the food day strip ticks on a new day and stays quiet on the chosen one', async () => {
  const onSelect = jest.fn();
  const repo = { list: () => [], localGet: () => undefined } as unknown as Repository;
  await render(<FoodCalendar day="2026-03-10" today="2026-03-10" onSelect={onSelect} repo={repo} />, { wrapper });
  const strip = within(screen.getByTestId('food-cal-recent')).getAllByRole('button');
  await fireEvent.press(strip[0]);
  expect(selectionAsync).not.toHaveBeenCalled();
  await fireEvent.press(strip[1]);
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenLastCalledWith('2026-03-09');
});

test('the month grid ticks on a new day, not on the chosen one or a future one', async () => {
  const onSelect = jest.fn();
  const repo = { list: () => [], localGet: () => undefined } as unknown as Repository;
  await render(<FoodCalendar day="2026-03-10" today="2026-03-10" onSelect={onSelect} repo={repo} />, { wrapper });
  await fireEvent.press(screen.getByTestId('food-cal-2026-03-10'));
  await fireEvent.press(screen.getByTestId('food-cal-2026-03-11'));
  expect(selectionAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('food-cal-2026-03-04'));
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenLastCalledWith('2026-03-04');
});

test('the workout tick is the same tick, under the same Settings switch', () => {
  const repo = (haptics?: boolean) => ({ localGet: () => haptics }) as unknown as Repository;
  tick(repo());
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  tick(repo(false));
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  tick(repo());
  expect(selectionAsync).toHaveBeenCalledTimes(1);
});
