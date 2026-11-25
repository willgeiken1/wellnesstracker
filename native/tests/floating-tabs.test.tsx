import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import AppTabs from '../src/components/app-tabs';
import { Screen } from '../src/components/screen';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DOCK_ACTIVE, DOCK_FADE, DOCK_ITEM, setDockAction, dockBottom, dockSpace } from '../src/components/floating-tabs';
import { fadeHeight } from '../src/features/shell/geometry';
import { resetMemoryPrefs } from '../src/features/shell/prefs';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';

// The bar was rebuilt to the mockup's shell: the open tab is the accent circle, the tabs before and after it sit in pills either
// side, and the + button closes the row. These tests assert that design in place of the older single-pill bar.
const mockNavigate = jest.fn(), mockEmit = jest.fn(() => ({ defaultPrevented: false }));
let mockIndex = 0;
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router/native-tabs', () => {
  const React = require('react');
  const { View: Host } = require('react-native');
  const NativeTabs = ({ children }: any) => React.createElement(Host, { testID: 'native-tabs' }, children);
  const Trigger = () => null; Trigger.Label = () => null; Trigger.Icon = () => null;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});
jest.mock('expo-router', () => {
  const React = require('react');
  const { View: Host } = require('react-native');
  const names = ['index', 'workouts', 'food', 'progress', 'routines', 'insights'];
  const Tabs = ({ tabBar, screenLayout }: any) => React.createElement(Host, { testID: 'js-tabs' },
    screenLayout({ children: React.createElement(Host, { testID: 'scene' }) }),
    tabBar({ state: { index: mockIndex, routes: names.map(name => ({ key: `${name}-key`, name })) }, emitter: { emit: mockEmit }, navigateToTab: mockNavigate }));
  Tabs.Screen = () => null;
  return { Tabs, router: { push: jest.fn() } };
});
const saved = (accent: string, theme = 'dark') => ({
  list: () => [{ ...syntheticRow('settings'), data: { theme_override: theme, accent } } as Row],
  subscribe: () => () => {}, save: jest.fn(),
}) as unknown as Repository;
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const pills = () => screen.getAllByTestId('tab-pill').map(node => StyleSheet.flatten(node.props.style));
const shownPills = () => pills().filter(pill => pill.opacity !== 0);
const bar = (accent = 'seaGlassTide', theme = 'dark') => render(<ThemeProvider repository={saved(accent, theme)}><View><AppTabs /></View></ThemeProvider>);
beforeEach(() => { mockIndex = 0; mockNavigate.mockClear(); mockEmit.mockClear(); resetMemoryPrefs(); });

describe('the floating tab bar', () => {
  test('the open tab stands alone in the accent colour, and the other tabs sit in one pill after it', async () => {
    const dark = createTheme('dark', 'seaGlassTide');
    await bar();
    expect(style('tab-bubble')).toMatchObject({ backgroundColor: dark.accent, width: DOCK_ACTIVE, height: DOCK_ACTIVE });
    expect(StyleSheet.flatten(screen.getByTestId('tab-food').parent!.props.style).width).toBe(DOCK_ITEM);
    expect(shownPills()).toHaveLength(1);
    // In dark themes the pill is the card colour, a step off the page.
    expect(shownPills()[0].backgroundColor).toBe(dark.surface);
  });
  test('a tab in the middle splits the pill either side of it, and the last tab has one pill before it', async () => {
    mockIndex = 2;
    const view = await bar();
    expect(shownPills()).toHaveLength(2);
    // Drawn fresh rather than glided there, so the pills are read at rest.
    await view.unmount();
    mockIndex = 4;
    await bar();
    expect(shownPills()).toHaveLength(1);
  });
  test('in a light theme the pill is the theme ink, on every palette', async () => {
    for (const palette of ['seaGlassTide', 'forestEmber', 'goldenHour'] as const) {
      mockIndex = 1;
      const light = createTheme('light', palette);
      const view = await bar(palette, 'light');
      for (const pill of shownPills()) expect(pill.backgroundColor).toBe(light.text);
      expect(style('tab-bubble').backgroundColor).toBe(light.accent);
      await view.unmount();
    }
  });
  test('every tab is a labelled tab that says whether it is open, at 44 points or more', async () => {
    mockIndex = 3;
    await bar();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.props.accessibilityLabel)).toEqual(['Home', 'Training', 'Food', 'Progress', 'Routines']);
    for (const [index, tab] of tabs.entries()) {
      expect(tab.props.accessibilityState.selected).toBe(index === 3);
      const holder = StyleSheet.flatten(tab.parent!.props.style);
      expect(Math.min(holder.width, holder.height)).toBeGreaterThanOrEqual(44);
    }
    expect(screen.getByRole('button', { name: 'Progress quick actions' })).toBeTruthy();
  });
  test('pressing a tab opens it, and pressing the open tab tells the screen without opening it again', async () => {
    mockIndex = 1;
    await bar();
    await fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
    expect(mockEmit).toHaveBeenCalledWith({ type: 'tabPress', target: 'progress-key', canPreventDefault: true });
    expect(mockNavigate).toHaveBeenCalledWith('progress-key');
    await fireEvent.press(screen.getByRole('tab', { name: 'Training' }));
    expect(mockEmit).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
  test('an old Insights link lights Progress on the bar', async () => {
    mockIndex = 5;
    await bar();
    expect(screen.getByRole('tab', { name: 'Progress' }).props.accessibilityState.selected).toBe(true);
  });
  test('screens are told how much room the bar takes', () => {
    expect(dockBottom(34)).toBe(28);
    expect(dockBottom(0)).toBe(24);
    expect(dockSpace(34)).toBeGreaterThan(28 + DOCK_ACTIVE);
    expect(dockSpace(0)).toBeGreaterThanOrEqual(24 + DOCK_ACTIVE);
  });
});

describe('one bar for every look', () => {
  test('Standard, Glass and Floating all draw the floating bar, never the system tab bar', async () => {
    for (const accent of ['seaGlassTide', 'seaGlassTide;bar=glass', 'seaGlassTide;bar=floating']) {
      const view = await bar(accent);
      expect(screen.queryByTestId('native-tabs')).toBeNull();
      expect(screen.getByTestId('scene')).toBeTruthy();
      expect(screen.getByTestId('dock')).toBeTruthy();
      await view.unmount();
    }
  });
  test('a screen\'s older round button no longer sits on the bar: the + button is the shell\'s own', async () => {
    const onPress = jest.fn();
    await bar();
    await act(() => setDockAction({ label: 'Add', expanded: false, onPress }));
    expect(screen.queryByTestId('dock-action')).toBeNull();
    expect(screen.getByTestId('dock-plus').props.accessibilityLabel).toBe('Home quick actions');
    await act(() => setDockAction(null));
  });
  test('tab screens leave room past the fade as well as the bar, so a last button rests in the clear', async () => {
    const metrics = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };
    const padding = async (accent: string) => {
      const view = await render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider repository={saved(accent)}><Screen tabHeader><Text>Log weigh-in</Text></Screen></ThemeProvider></SafeAreaProvider>);
      const value = StyleSheet.flatten(screen.getByTestId('screen-scroll').props.contentContainerStyle).paddingBottom;
      await view.unmount();
      return value;
    };
    expect(await padding('seaGlassTide;bar=floating') - await padding('seaGlassTide')).toBe(DOCK_FADE);
  });
  test('a fade of the page colour sits behind the bar and never takes a touch', async () => {
    await bar();
    const fade = screen.getByTestId('tab-fade');
    expect(fade.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(fade.props.style).height).toBe(fadeHeight(0));
  });
});
