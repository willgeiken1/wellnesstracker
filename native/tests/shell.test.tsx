import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import Appearance from '../src/features/settings/appearance';
import AppTabs from '../src/components/app-tabs';

// The native host is unavailable in Jest. Keep the real tab declarations and labels.
jest.mock('expo-router/native-tabs', () => {
  const { View, Text } = require('react-native');
  const NativeTabs = ({ children }: any) => <View>{children}</View>;
  const Trigger = ({ children }: any) => <View>{children}</View>;
  Trigger.Label = ({ children }: any) => <Text>{children}</Text>;
  Trigger.Icon = () => null;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});
function ThemeProbe() {
  const { mode, accent, colors } = useTheme();
  return <Text testID="theme">{`${mode}/${accent}/${colors.bg}`}</Text>;
}
test('tab shell renders the five native tab labels', async () => {
  await render(<ThemeProvider><AppTabs /></ThemeProvider>);
  for (const label of ['Home', 'Workouts', 'Food', 'Progress', 'Insights']) expect(screen.getByText(label)).toBeTruthy();
});
test('Appearance changes theme, accent, and restores system following', async () => {
  await render(<ThemeProvider><Appearance /><ThemeProbe /></ThemeProvider>);
  await fireEvent.press(screen.getByRole('tab', { name: 'Light' }));
  expect(screen.getByTestId('theme')).toHaveTextContent('light/citrus/#F3F4F1');
  await fireEvent.press(screen.getByRole('tab', { name: 'Dark' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Sea Glass' }));
  expect(screen.getByTestId('theme')).toHaveTextContent('dark/sea/#0F0F11');
  expect(screen.getByRole('button', { name: 'Sea Glass' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'System' }));
  expect(screen.getByRole('tab', { name: 'System' })).toBeSelected();
});
