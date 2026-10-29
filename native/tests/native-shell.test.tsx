import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/design/theme-provider';
import AppTabs from '../src/components/app-tabs';
import { Screen } from '../src/components/screen';

jest.mock('expo-router/native-tabs', () => {
  const React = require('react');
  const { View } = require('react-native');
  const NativeTabs = (props: any) => React.createElement(View, { ...props, testID: 'native-tabs' });
  NativeTabs.Trigger = Object.assign(() => null, { Label: () => null, Icon: () => null });
  return { NativeTabs };
});

test.each([0, 34, 83])('tab scroll content with bottom inset %i adjusts both safe areas and does not draw a duplicate title', async (bottom) => {
  await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, left: 0, right: 0, bottom } }}><ThemeProvider><Screen title="Home" tabHeader><Text>Last row</Text></Screen></ThemeProvider></SafeAreaProvider>);
  const scroll = screen.getByTestId('screen-scroll');
  expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(scroll.props.automaticallyAdjustsScrollIndicatorInsets).toBe(true);
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(bottom);
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
