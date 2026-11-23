import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet, View } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import AppTabs from '../src/components/app-tabs';
import { Screen } from '../src/components/screen';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DOCK_ACTIVE, DOCK_FADE, DOCK_ITEM, DOCK_NIGHT, DOCK_SIDE, TabDock, dockMetrics, dockWidth, setDockAction, dockBottom, dockSpace, type DockItem } from '../src/components/floating-tabs';
import { tabs } from '../src/features/shell/tabs';
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
  const names = ['index', 'workouts', 'food', 'progress'];
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
  { key: 'progress', label: 'Progress', icon: 'progress' }, { key: 'routines', label: 'Routines', icon: 'routines' },
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
    await view.rerender(<ThemeProvider repository={saved('seaGlassTide')}><TabDock items={items} active={items.length - 1} onPress={() => {}} /></ThemeProvider>);
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
    await fireEvent.press(screen.getByRole('tab', { name: 'Food' }));
    expect(press).toHaveBeenCalledWith(2);
  });
  test('screens are told how much room the bar takes', () => {
    expect(dockBottom(34)).toBe(24);
    expect(dockBottom(0)).toBe(12);
    expect(dockSpace(34)).toBeGreaterThan(34 + DOCK_ACTIVE / 2);
    expect(dockSpace(0)).toBeGreaterThanOrEqual(12 + DOCK_ACTIVE);
  });
});

describe('the floating bar on narrow and wide phones', () => {
  const flat = (node: { props: Record<string, any> }) => StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);
  // 320 is Display Zoom on the smallest phones; 375 and 430 are the narrowest and widest ordinary ones.
  test.each([[320, 'compact'], [357, 'compact'], [358, 'regular'], [375, 'regular'], [393, 'regular'], [430, 'regular'], [440, 'regular']] as const)('at %i points the bar is %s', (width, size) => {
    expect(dockMetrics(width).size).toBe(size);
  });
  test.each([320, 375, 430])('five tabs fit at %i points whichever tab is open, with the + Home and Routines put beside them', (width) => {
    expect(tabs).toHaveLength(5);
    // The two screens with a + of their own are the first tab and the last.
    expect([tabs[0].route, tabs[tabs.length - 1].route]).toEqual(['index', 'routines']);
    const metrics = dockMetrics(width), last = tabs.length - 1;
    for (let active = 0; active < tabs.length; active += 1) {
      const ends = active === 0 || active === last;
      expect(dockWidth(metrics, tabs.length, active, ends)).toBeLessThanOrEqual(width - 2 * DOCK_SIDE);
      // Should a middle tab ever get a + too, the bar still stays on the screen.
      expect(dockWidth(metrics, tabs.length, active, true)).toBeLessThan(width);
    }
  });
  test('the widest bar is an end tab with its + beside it: 334 at the ordinary size, 296 on a narrow phone', () => {
    expect(dockWidth(dockMetrics(430), 5, 0, true)).toBe(334);
    expect(dockWidth(dockMetrics(430), 5, 4, true)).toBe(334);
    expect(dockWidth(dockMetrics(430), 5, 2)).toBe(284);
    expect(dockWidth(dockMetrics(320), 5, 0, true)).toBe(296);
    expect(dockWidth(dockMetrics(320), 5, 2)).toBe(252);
  });
  test('the ordinary size is the one the bar always had', () => {
    expect(dockMetrics(402)).toMatchObject({ open: DOCK_ACTIVE, item: DOCK_ITEM, pad: 5, gap: 4, groupGap: 8 });
    expect(dockSpace(34, dockMetrics(402))).toBe(dockSpace(34));
    // A smaller bar leaves a little less room under the page.
    expect(dockSpace(34, dockMetrics(320))).toBe(dockBottom(34) + 52 + 12);
  });
  test.each([320, 430])('at %i points every tab is a target at least 44 points wide and tall', async (width) => {
    const metrics = dockMetrics(width);
    await render(<ThemeProvider repository={saved('seaGlassTide')}><TabDock items={items} active={0} metrics={metrics} onPress={() => {}} /></ThemeProvider>);
    for (const item of items) {
      const tab = screen.getByRole('tab', { name: item.label }), box = flat(tab), slop = tab.props.hitSlop || { top: 0, bottom: 0, left: 0, right: 0 };
      expect(box.width + slop.left + slop.right).toBeGreaterThanOrEqual(44);
      expect(box.height + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
      expect(tab.props.accessibilityLargeContentTitle).toBe(item.label);
    }
    // Neighbouring targets meet half way and never overlap.
    expect(screen.getByTestId('tab-food').props.hitSlop.left * 2).toBe(metrics.gap);
    expect(flat(screen.getByTestId('tab-index'))).toMatchObject({ width: metrics.open, height: metrics.open });
    expect(flat(screen.getByTestId('tab-food'))).toMatchObject({ width: metrics.item, height: metrics.item });
  });
  test('on a 320 point screen the whole bar, its + and the room under the page all take the smaller size', async () => {
    const real = Dimensions.get;
    const spy = jest.spyOn(Dimensions, 'get').mockImplementation(key => ({ ...real(key), width: 320 }));
    try {
      await render(<ThemeProvider repository={saved('seaGlassTide;bar=floating')}><AppTabs /></ThemeProvider>);
      await act(() => setDockAction({ label: 'Add', expanded: false, onPress: () => {} }));
      expect(flat(screen.getByTestId('tab-index'))).toMatchObject({ width: 52, height: 52 });
      expect(flat(screen.getByTestId('tab-food'))).toMatchObject({ width: 42, height: 42 });
      expect(flat(screen.getByTestId('dock-action'))).toMatchObject({ width: 50, height: 50 });
      expect(flat(screen.getByTestId('tab-fade')).height).toBe(dockSpace(0, dockMetrics(320)) + DOCK_FADE);
      await act(() => setDockAction(null));
    } finally { spy.mockRestore(); }
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
  test('a screen can put its own button in line with the tabs, and take it away again', async () => {
    const onPress = jest.fn();
    await render(<ThemeProvider repository={saved('seaGlassTide;bar=floating')}><AppTabs /></ThemeProvider>);
    expect(screen.queryByTestId('dock-action')).toBeNull();
    await act(() => setDockAction({ label: 'Add', expanded: false, onPress }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    // Same size as the pills, so the row reads as one bar.
    expect(StyleSheet.flatten(screen.getByTestId('dock-action').props.style).height).toBe(StyleSheet.flatten(screen.getAllByTestId('tab-pill')[0].props.style).borderRadius * 2);
    await act(() => setDockAction(null));
    expect(screen.queryByTestId('dock-action')).toBeNull();
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
    await render(<ThemeProvider repository={saved('seaGlassTide;bar=floating')}><AppTabs /></ThemeProvider>);
    const fade = screen.getByTestId('tab-fade');
    expect(fade.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(fade.props.style).height).toBeGreaterThan(dockSpace(0));
  });
});
