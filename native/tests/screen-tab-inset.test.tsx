import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '@/components/screen';
import { ThemeProvider } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';

const frame = { x: 0, y: 0, width: 390, height: 844 };
const show = (bottom: number, tabHeader: boolean) => render(
  <SafeAreaProvider initialMetrics={{ frame, insets: { top: 59, left: 0, right: 0, bottom } }}>
    <ThemeProvider><Screen title="Food" tabHeader={tabHeader}><Text>Last row</Text></Screen></ThemeProvider>
  </SafeAreaProvider>);
const endPadding = () => {
  const style = StyleSheet.flatten(screen.getByTestId('screen-scroll').props.contentContainerStyle);
  return style.paddingBottom ?? style.padding;
};

test('a tab screen leaves room at the end of its scroll for the floating tab bar', async () => {
  await show(83, true);
  expect(endPadding()).toBe(tokens.spacing[3] + 83);
});

test('a tab screen with no bottom inset keeps its normal padding', async () => {
  await show(0, true);
  expect(endPadding()).toBe(tokens.spacing[3]);
});

test('a pushed screen is unchanged, because its safe area already clears the bottom', async () => {
  await show(34, false);
  expect(endPadding()).toBe(tokens.spacing[3]);
});
