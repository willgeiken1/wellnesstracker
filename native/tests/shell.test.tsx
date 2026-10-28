jest.mock('../src/features/workout/use-workout',()=>({useWorkout:()=>({store:null,auth:{pending:0,syncStatus:'idle'}})}));
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, PixelRatio, StyleSheet, Text, View } from 'react-native';
import type { TestInstance } from 'test-renderer';
import Home from '../src/app/(tabs)/index';
import Workouts from '../src/app/(tabs)/workouts';
import Food from '../src/app/(tabs)/food';
import Progress from '../src/app/(tabs)/progress';
import Insights from '../src/app/(tabs)/insights';
import Settings from '../src/app/settings/index';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import Appearance from '../src/features/settings/appearance';
import AppTabs from '../src/components/app-tabs';

// The native host is unavailable in Jest. Keep the real tab declarations and labels.
// Keep components outside the hoisted factory: React Compiler can add module imports.
function mockNativeTabs({ children }: any) { return <View>{children}</View>; }
function mockTrigger({ children, accessibilityLabel }: any) { return <View accessibilityLabel={accessibilityLabel}>{children}</View>; }
function mockLabel({ children }: any) { return <Text>{children}</Text>; }
function mockIcon() { return null; }
jest.mock('expo-router/native-tabs', () => {
  return { NativeTabs: Object.assign(mockNativeTabs, {
    Trigger: Object.assign(mockTrigger, { Label: mockLabel, Icon: mockIcon }),
  }) };
});
function ThemeProbe() {
  const { mode, accent, colors } = useTheme();
  return <Text testID="theme">{`${mode}/${accent}/${colors.bg}`}</Text>;
}
test('tab shell renders the five native tab labels', async () => {
  await render(<ThemeProvider><AppTabs /></ThemeProvider>);
  for (const label of ['Home', 'Workouts', 'Food', 'Progress', 'Insights']) {
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText(label)).toBeTruthy();
  }
});
test('Appearance changes theme, accent, and restores system following', async () => {
  await render(<ThemeProvider><Appearance /><ThemeProbe /></ThemeProvider>);
  await fireEvent.press(screen.getByRole('tab', { name: 'Light' }));
  expect(screen.getByTestId('theme')).toHaveTextContent('light/sea/#F3F4F1');
  await fireEvent.press(screen.getByRole('tab', { name: 'Dark' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Sea Glass' }));
  expect(screen.getByTestId('theme')).toHaveTextContent('dark/sea/#0F0F11');
  expect(screen.getByRole('button', { name: 'Sea Glass' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'System' }));
  expect(screen.getByRole('tab', { name: 'System' })).toBeSelected();
});

function textContent(node: TestInstance): string {
  return node.children.map(child => typeof child === 'string' ? child : textContent(child)).join(' ');
}

test.each([
  ['Home tab', Home], ['Workouts tab', Workouts], ['Food tab', Food],
  ['Progress tab', Progress], ['Insights tab', Insights], ['Settings list', Settings], ['Appearance', Appearance],
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
      expect(node.props.accessibilityRole).toMatch(/^(button|tab)$/);
      expect((node.props.accessibilityLabel ?? textContent(node)).trim().length).toBeGreaterThan(0);
    }
    const texts = result.container.queryAll(node => node.type === 'Text');
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      expect(node.props.allowFontScaling).toBe(true);
      expect(node.props.maxFontSizeMultiplier).toBe(0);
      expect(node.props.numberOfLines).toBeUndefined();
      // Any fixed-height text ancestor could clip large type; decorative swatches aren't ancestors.
      for (let ancestor: TestInstance | null = node; ancestor; ancestor = ancestor.parent) {
        const style = StyleSheet.flatten(ancestor.props.style) ?? {};
        expect(style.height).toBeUndefined();
        expect(style.maxHeight).toBeUndefined();
      }
    }
  } finally { dimensions.mockRestore(); fontScale.mockRestore(); }
});
