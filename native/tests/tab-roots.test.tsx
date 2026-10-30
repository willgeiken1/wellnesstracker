import * as ReactNative from 'react-native';
import { Platform } from 'react-native';
import { createTheme } from '../src/design/tokens';
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

afterEach(() => jest.restoreAllMocks());

describe.each(['light', 'dark'] as const)('%s tab header colours', mode => {
  test.each(['ios', 'android', 'web'] as const)('%s uses the intended platform colours', async platform => {
    jest.replaceProperty(Platform, 'OS', platform);
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(mode);
    const colors = createTheme(mode, 'sea');
    await render(<ThemeProvider><HomeLayout /></ThemeProvider>);
    const props = screen.getByTestId('tab-stack').props;
    expect(props.contentStyle.backgroundColor).toBe(colors.bg);
    if (platform === 'ios') {
      expect(props.headerStyle).toBeUndefined();
      expect(props.headerTintColor).toBe(colors.accent);
    } else {
      expect(props.headerStyle).toEqual({ backgroundColor: colors.surface });
      expect(props.headerTintColor).toBe(colors.text);
    }
  });
});
