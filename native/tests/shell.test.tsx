// Shell-only fixtures have no signed-in repository; feature behavior is covered by body-ui.
jest.mock('../src/auth/provider',()=>({useAuth:()=>({repository:null})}));
// Home is rendered here outside the route tree, where the router has no focus to report.
jest.mock('../src/features/home/use-focused',()=>({useFocused:()=>true}));
jest.mock('../src/features/workout/use-workout',()=>({useWorkout:()=>({store:null,auth:{pending:0,syncStatus:'idle'}}),useWorkoutStore:()=>null}));
import { fireEvent, render, screen } from '@testing-library/react-native';
import { renderRouter, screen as routerScreen } from 'expo-router/testing-library';
import { Dimensions, PixelRatio, StyleSheet, Text } from 'react-native';
import type { TestInstance } from 'test-renderer';
import { DEFAULT_PALETTE, createTheme, paletteName } from '../src/design/tokens';
import Home from '../src/app/(tabs)/index';
import Workouts from '../src/app/(tabs)/workouts';
import Food from '../src/app/(tabs)/food';
import Progress from '../src/app/(tabs)/progress';
import { InsightsPage } from '../src/app/(tabs)/insights';
import Routines from '../src/app/(tabs)/routines';
import Settings from '../src/app/settings/index';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import Appearance from '../src/features/settings/appearance';
import AppTabs from '../src/components/app-tabs';

function ThemeProbe() {
  const { mode, palette, colors } = useTheme();
  return <Text testID="theme">{`${mode}/${palette}/${colors.bg}`}</Text>;
}
// The mockup's shell replaces the system tab bar: one floating bar on every look, with Routines on it and Insights folded into Progress.
test('tab shell shows Home, Training, Food, Progress and Routines as labelled tabs, and no Insights tab', async () => {
  const page = () => null;
  await renderRouter({
    _layout: () => <ThemeProvider><AppTabs /></ThemeProvider>,
    index: page, workouts: page, food: page, progress: page, routines: page, insights: page,
  });
  const tabs = routerScreen.getAllByRole('tab');
  expect(tabs.map(tab => tab.props.accessibilityLabel)).toEqual(['Home', 'Training', 'Food', 'Progress', 'Routines']);
  expect(routerScreen.getByRole('tab', { name: 'Home' })).toBeSelected();
  expect(routerScreen.queryByRole('tab', { name: 'Insights' })).toBeNull();
  expect(routerScreen.getByRole('button', { name: 'Home quick actions' })).toBeTruthy();
});
test('Appearance changes theme, accent, and restores system following', async () => {
  // The redesigned Appearance shows Theme and Palette as radio groups.
  await render(<ThemeProvider><Appearance /><ThemeProbe /></ThemeProvider>);
  await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
  expect(screen.getByTestId('theme')).toHaveTextContent(`light/${DEFAULT_PALETTE}/${createTheme('light').bg}`);
  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Forest Ember' }));
  expect(screen.getByTestId('theme')).toHaveTextContent(`dark/forestEmber/${createTheme('dark', 'forestEmber').bg}`);
  expect(screen.getByRole('radio', { name: 'Forest Ember' })).toBeChecked();
  expect(screen.getByRole('radio', { name: paletteName('seaGlassTide') })).not.toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'System' }));
  expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
});

function textContent(node: TestInstance): string {
  return node.children.map(child => typeof child === 'string' ? child : textContent(child)).join(' ');
}

test.each([
  ['Home tab', Home], ['Workouts tab', Workouts], ['Food tab', Food],
  ['Progress tab', Progress], ['Routines tab', Routines], ['Insights page, kept for Progress', InsightsPage], ['Settings list', Settings], ['Appearance', Appearance],
] as const)('%s pressables are labeled and text can grow at fontScale 2', async (_name, Component) => {
  const getDimensions = Dimensions.get;
  const dimensions = jest.spyOn(Dimensions, 'get').mockImplementation(key => ({ ...getDimensions(key), fontScale: 2 }));
  const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
  try {
    const result = await render(<ThemeProvider><Component /></ThemeProvider>);
    // Walk host responders independently of role queries: missing roles must not hide controls.
    const pressables = result.container.queryAll(node => typeof node.props.onPress === 'function' ||
      typeof node.props.onResponderRelease === 'function');
    expect(pressables.length).toBeGreaterThan(0);
    for (const node of pressables) {
      if (node.type === 'RNSVGPath') {
        if (node.props.testID?.startsWith('atlas-hit-')) {
          // Invisible duplicates expand touch areas; only the visible path is
          // an accessibility element. The complete list is the precise path.
          expect(node.props.accessible).not.toBe(true);
          expect(node.props.strokeWidth).toBeGreaterThanOrEqual(44);
          expect(screen.getByRole('button', { name: 'Muscle list' })).toBeTruthy();
          continue;
        }
        expect(node.props.accessible).toBe(true);
        expect(node.props.accessibilityRole).toBe('button');
        expect(typeof node.props.accessibilityState.selected).toBe('boolean');
        expect(screen.getByRole('button', { name: 'Muscle list' })).toBeTruthy();
      } else {
        // Appearance's theme, palette and icon choices are radios, as in the design, and True black is a switch; each says if it is on.
        expect(node.props.accessibilityRole).toMatch(/^(button|tab|radio|switch)$/);
        if (/^(radio|switch)$/.test(node.props.accessibilityRole)) expect(typeof node.props.accessibilityState?.checked).toBe('boolean');
      }
      expect((node.props.accessibilityLabel ?? textContent(node)).trim().length).toBeGreaterThan(0);
    }
    // The tile grid and Home's hero are fixed-size cards in the design (S, M and L tiles; the hero's art card): their text is
    // laid out to the card and is checked on its own pages. Every other text on a page must grow with Dynamic Type.
    const inFixedCard = (node: TestInstance) => {
      for (let a: TestInstance | null = node; a; a = a.parent)
        if ((a.props.accessibilityRole === 'list' && / tiles$/.test(a.props.accessibilityLabel ?? '')) || a.props.testID === 'home-hero') return true;
      return false;
    };
    const texts = result.container.queryAll(node => node.type === 'Text' && !inFixedCard(node));
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      // Scaling on, with no cap: React Native's defaults (unset) mean the same as true and 0.
      expect(node.props.allowFontScaling).not.toBe(false);
      expect(node.props.maxFontSizeMultiplier ?? 0).toBe(0);
      // A page's nav bar title stays on one line, as an iOS navigation bar's does; the page's own text wraps instead.
      const navTitle = node.props.accessibilityRole === 'header' && StyleSheet.flatten(node.parent?.props.style)?.maxWidth === 190;
      if (!navTitle) expect(node.props.numberOfLines).toBeUndefined();
      // Any fixed-height text ancestor could clip large type; decorative swatches aren't ancestors.
      for (let ancestor: TestInstance | null = node; ancestor; ancestor = ancestor.parent) {
        const style = StyleSheet.flatten(ancestor.props.style) ?? {};
        expect(style.height).toBeUndefined();
        expect(style.maxHeight).toBeUndefined();
      }
    }
  } finally { dimensions.mockRestore(); fontScale.mockRestore(); }
});
