import { fireEvent, render, screen } from '@testing-library/react-native';
import { SegmentedControl } from '../src/components/segmented-control.android';
import { ThemeProvider } from '../src/design/theme-provider';

// Compose views cannot mount in Jest; preserve their selection and click contract.
jest.mock('@expo/ui/jetpack-compose', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  const SegmentedButton = ({ selected, onClick, children }: any) => React.createElement(Pressable,
    { accessibilityRole: 'tab', accessibilityState: { selected }, onPress: onClick }, children);
  SegmentedButton.Label = ({ children }: any) => children;
  return { SingleChoiceSegmentedButtonRow: View, SegmentedButton, Text };
});

const options = [{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }] as const;
test('Android renders each option, reports selection and labels its Host', async () => {
  const onChange = jest.fn();
  const result = await render(<ThemeProvider><SegmentedControl label="Sections" options={options} value="first" onChange={onChange} /></ThemeProvider>);
  expect(screen.getByLabelText('Sections').type).toBe('ExpoUIHost');
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.getByRole('tab', { name: 'First' })).toBeSelected();
  expect(screen.getByRole('tab', { name: 'Second' })).not.toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'Second' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('second');
  await result.rerender(<ThemeProvider><SegmentedControl label="Sections" options={options} value="second" onChange={onChange} /></ThemeProvider>);
  expect(screen.getByRole('tab', { name: 'Second' })).toBeSelected();
  expect(screen.getByRole('tab', { name: 'First' })).not.toBeSelected();
});
