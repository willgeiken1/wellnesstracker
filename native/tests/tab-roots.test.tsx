import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import HomeLayout from '../src/app/(tabs)/(home)/_layout';
import WorkoutsLayout from '../src/app/(tabs)/workouts/_layout';
import FoodLayout from '../src/app/(tabs)/food/_layout';
import ProgressLayout from '../src/app/(tabs)/progress/_layout';
import InsightsLayout from '../src/app/(tabs)/insights/_layout';

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stack = ({ children, screenOptions }: any) => React.createElement(View, { ...screenOptions, testID: 'tab-stack' }, children);
  Stack.Screen = ({ options }: any) => React.createElement(View, { ...options, testID: 'root-options' }, options.headerRight?.({}));
  return { Stack, router: { push: jest.fn() } };
});

test.each([
  ['Home', HomeLayout], ['Workouts', WorkoutsLayout], ['Food', FoodLayout],
  ['Progress', ProgressLayout], ['Insights', InsightsLayout],
])('%s has a native large title and reachable Settings action', async (title, Layout) => {
  await render(<ThemeProvider><Layout /></ThemeProvider>);
  expect(screen.getByTestId('root-options').props.title).toBe(title);
  expect(screen.getByTestId('root-options').props.headerLargeTitleEnabled).toBe(true);
  const options = screen.getByTestId('root-options').props;
  const item = options.unstable_headerRightItems({})[0];
  expect(item.width).toBeGreaterThanOrEqual(44);
  item.onPress();
  expect(router.push).toHaveBeenLastCalledWith('/settings');
  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
  expect(router.push).toHaveBeenLastCalledWith('/settings');
});
