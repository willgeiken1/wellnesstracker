import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import AppTabs from '../src/components/app-tabs';
import { DOCK_ACTIVE, DOCK_ITEM, DOCK_NIGHT, TabDock, dockBottom, dockSpace, type DockItem } from '../src/components/floating-tabs';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';

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
  const names = ['index', 'workouts', 'food', 'progress', 'insights'];
  const Tabs = ({ tabBar, screenLayout }: any) => React.createElement(Host, { testID: 'js-tabs' },
    screenLayout({ children: React.createElement(Host, { testID: 'scene' }) }),
    tabBar({ state: { index: mockIndex, routes: names.map(name => ({ key: `${name}-key`, name })) }, emitter: { emit: mockEmit }, navigateToTab: mockNavigate }));
  Tabs.Screen = () => null;
  return { Tabs };
});
const saved = (accent: string, theme = 'dark') => ({
  list: () => [{ ...syntheticRow('settings'), data: { theme_override: theme, accent } } as Row],
  subscribe: () => () => {}, save: jest.fn(),
}) as unknown as Repository;
const items: DockItem[] = [
  { key: 'index', label: 'Home', icon: 'home' }, { key: 'workouts', label: 'Workouts', icon: 'workouts' }, { key: 'food', label: 'Food', icon: 'food' },
  { key: 'progress', label: 'Progress', icon: 'progress' }, { key: 'insights', label: 'Insights', icon: 'insights' },
];
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
beforeEach(() => { mockIndex = 0; mockNavigate.mockClear(); mockEmit.mockClear(); });

describe('the floating tab bar', () => {
  test('the open tab stands alone in the accent colour and the rest sit in one dark pill', async () => {
    const dark = createTheme('dark', 'seaGlassTide');
    await render(<ThemeProvider repository={saved('seaGlassTide')}><TabDock items={items} active={0} onPress={() => {}} /></ThemeProvider>);
    expect(style('tab-index')).toMatchObject({ backgroundColor: dark.accent, width: DOCK_ACTIVE, height: DOCK_ACTIVE });
    expect(style('tab-food')).toMatchObject({ width: DOCK_ITEM, height: DOCK_ITEM });
    expect(style('tab-food').backgroundColor).not.toBe(dark.accent);
    expect(screen.getAllByTestId('tab-pill')).toHaveLength(1);
    // Near-black, darker than any card, so it stands off the page in dark themes too.
    expect(style('tab-pill')).toMatchObject({ backgroundColor: DOCK_NIGHT });
    expect(style('tab-food').backgroundColor).toBe('transparent');
    // The open tab is outside the pill.
    expect(screen.getByTestId('tab-index').parent).not.toBe(screen.getByTestId('tab-pill'));
  });
  test('a tab in the middle splits the pill either side of it, and the last tab has one pill before it', async () => {
    const view = await render(<ThemeProvider repository={saved('seaGlassTide')}><TabDock items={items} active={2} onPress={() => {}} /></ThemeProvider>);
    expect(screen.getAllByTestId('tab-pill')).toHaveLength(2);
    await view.rerender(<ThemeProvider repository={saved('seaGlassTide')}><TabDock items={items} active={4} onPress={() => {}} /></ThemeProvider>);
    expect(screen.getAllByTestId('tab-pill')).toHaveLength(1);
  });
  test('in a light theme the pill is the theme ink, on every palette', async () => {
    for (const palette of ['seaGlassTide', 'forestEmber', 'goldenHour'] as const) {
      const light = createTheme('light', palette);
      const view = await render(<ThemeProvider repository={saved(palette, 'light')}><TabDock items={items} active={1} onPress={() => {}} /></ThemeProvider>);
      expect(StyleSheet.flatten(screen.getAllByTestId('tab-pill')[0].props.style).backgroundColor).toBe(light.text);
      expect(style('tab-workouts').backgroundColor).toBe(light.accent);
      await view.unmount();
    }
  });
  test('every tab is a labelled tab that says whether it is open, at 44 points or more', async () => {
    const press = jest.fn();
    await render(<ThemeProvider repository={saved('seaGlassTide')}><TabDock items={items} active={3} onPress={press} /></ThemeProvider>);
    for (const [index, item] of items.entries()) {
      const tab = screen.getByRole('tab', { name: item.label });
      expect(tab.props.accessibilityState.selected).toBe(index === 3);
      const { height } = StyleSheet.flatten(tab.props.style), slop = tab.props.hitSlop || { top: 0, bottom: 0 };
      expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    }
    await fireEvent.press(screen.getByRole('tab', { name: 'Insights' }));
    expect(press).toHaveBeenCalledWith(4);
  });
  test('screens are told how much room the bar takes', () => {
    expect(dockBottom(34)).toBe(24);
    expect(dockBottom(0)).toBe(12);
    expect(dockSpace(34)).toBeGreaterThan(34 + DOCK_ACTIVE / 2);
    expect(dockSpace(0)).toBeGreaterThanOrEqual(12 + DOCK_ACTIVE);
  });
});

describe('choosing the bar in Appearance', () => {
  test('Standard and Glass keep the system tab bar', async () => {
    for (const accent of ['seaGlassTide', 'seaGlassTide;bar=glass']) {
      const view = await render(<ThemeProvider repository={saved(accent)}><AppTabs /></ThemeProvider>);
      expect(screen.getByTestId('native-tabs')).toBeTruthy();
      expect(screen.queryByTestId('js-tabs')).toBeNull();
      await view.unmount();
    }
  });
  test('Floating swaps in the floating bar, and pressing a tab opens it', async () => {
    mockIndex = 1;
    await render(<ThemeProvider repository={saved('seaGlassTide;bar=floating')}><View><AppTabs /></View></ThemeProvider>);
    expect(screen.queryByTestId('native-tabs')).toBeNull();
    expect(screen.getByTestId('scene')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Workouts' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
    expect(mockEmit).toHaveBeenCalledWith({ type: 'tabPress', target: 'progress-key', canPreventDefault: true });
    expect(mockNavigate).toHaveBeenCalledWith('progress-key');
    // Pressing the open tab tells the screen, but does not navigate again.
    await fireEvent.press(screen.getByRole('tab', { name: 'Workouts' }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
  test('a fade of the page colour sits behind the bar and never takes a touch', async () => {
    await render(<ThemeProvider repository={saved('seaGlassTide;bar=floating')}><AppTabs /></ThemeProvider>);
    const fade = screen.getByTestId('tab-fade');
    expect(fade.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(fade.props.style).height).toBeGreaterThan(dockSpace(0));
  });
});
