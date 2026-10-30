import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/design/theme-provider';
import AppTabs from '../src/components/app-tabs';
import { Screen } from '../src/components/screen';
import * as ReactNative from 'react-native';
import { createTheme } from '../src/design/tokens';

afterEach(() => jest.restoreAllMocks());

jest.mock('expo-router/native-tabs', () => {
  const React = require('react');
  const { View } = require('react-native');
  const NativeTabs = (props: any) => React.createElement(View, { ...props, testID: 'native-tabs' });
  NativeTabs.Trigger = Object.assign(() => null, { Label: () => null, Icon: () => null });
  return { NativeTabs };
});

test.each([
  ['ios', 0, 16], ['ios', 34, 16], ['ios', 83, 16],
  ['android', 0, 16], ['android', 34, 50], ['android', 83, 99],
  ['web', 0, 16], ['web', 34, 50], ['web', 83, 99],
] as const)('%s tab content with bottom inset %i has exactly %i points of bottom padding', async (platform, bottom, padding) => {
  jest.replaceProperty(Platform, 'OS', platform);
  await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, left: 0, right: 0, bottom } }}><ThemeProvider><Screen title="Home" tabHeader><Text>Last row</Text></Screen></ThemeProvider></SafeAreaProvider>);
  const scroll = screen.getByTestId('screen-scroll');
  expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(scroll.props.automaticallyAdjustsScrollIndicatorInsets).toBe(true);
  const style = StyleSheet.flatten(scroll.props.contentContainerStyle);
  expect(style.paddingBottom ?? style.padding).toBe(padding);
  expect(screen.queryByText('Home')).toBeNull();
  expect(screen.getByText('Last row')).toBeTruthy();
});

test('Reduce Transparency starts solid, follows OS changes, ignores stale queries and cleans up', async () => {
  let changed: (value: boolean) => void = () => {};
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((name, listener) => {
    if (name === 'reduceTransparencyChanged') { changed = listener; return { remove }; }
    return { remove: jest.fn() };
  });
  let resolve!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockReturnValue(new Promise(done => { resolve = done; }));
  const result = await render(<ThemeProvider><AppTabs /></ThemeProvider>);
  expect(screen.getByTestId('native-tabs').props.blurEffect).toBe('none');
  expect(screen.getByTestId('native-tabs').props.backgroundColor).toBeTruthy();
  await act(async () => { changed(false); });
  expect(screen.getByTestId('native-tabs').props.blurEffect).toBeUndefined();
  await act(async () => { resolve(true); });
  expect(screen.getByTestId('native-tabs').props.blurEffect).toBeUndefined();
  await act(async () => { changed(true); });
  expect(screen.getByTestId('native-tabs').props.blurEffect).toBe('none');
  await result.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  jest.restoreAllMocks();
});

test.each([true, false])('initial Reduce Transparency preference %s controls the tab material', async (reduced) => {
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(reduced);
  try {
    await render(<ThemeProvider><AppTabs /></ThemeProvider>);
    expect(screen.getByTestId('native-tabs').props.blurEffect).toBe(reduced ? 'none' : undefined);
    expect(screen.getByTestId('native-tabs').props.backgroundColor).toEqual(reduced ? expect.any(String) : undefined);
  } finally { jest.restoreAllMocks(); }
});

test('a failed accessibility query preserves the solid fallback', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockRejectedValue(new Error('OS preference unavailable'));
  try {
    await render(<ThemeProvider><AppTabs /></ThemeProvider>);
    expect(screen.getByTestId('native-tabs').props.blurEffect).toBe('none');
    expect(screen.getByTestId('native-tabs').props.backgroundColor).toEqual(expect.any(String));
  } finally { jest.restoreAllMocks(); }
});

describe.each(['light', 'dark'] as const)('%s tab colours', mode => {
  test.each(['ios', 'android', 'web'] as const)('%s preserves platform tab styling', async platform => {
    jest.replaceProperty(Platform, 'OS', platform);
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(mode);
    const colors = createTheme(mode, 'sea');
    await render(<ThemeProvider><AppTabs /></ThemeProvider>);
    const props = screen.getByTestId('native-tabs').props;
    expect(props.tintColor).toBe(colors.accent);
    if (platform === 'ios') {
      expect(props.iconColor).toBeUndefined();
      expect(props.labelStyle).toBeUndefined();
      expect(props.indicatorColor).toBeUndefined();
    } else {
      expect(props.iconColor).toEqual({ default: colors['text-muted'], selected: colors.accent });
      expect(props.labelStyle).toEqual({
        default: { color: colors['text-muted'] }, selected: { color: colors.text },
      });
      expect(props.indicatorColor).toBe(colors['surface-2']);
    }
  });
});
