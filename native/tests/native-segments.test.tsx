import { fireEvent, render, screen } from '@testing-library/react-native';
import { SegmentedControl } from '../src/components/segmented-control.ios';
import { ThemeProvider } from '../src/design/theme-provider';

const options = [{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }] as const;
test('iOS uses a standard segmented Picker, sized for touch and bound to the caller', async () => {
  const onChange = jest.fn();
  await render(<ThemeProvider><SegmentedControl label="Sections" options={options} value="first" onChange={onChange} /></ThemeProvider>);
  const picker = screen.getByTestId('native-segmented-picker');
  expect(picker.props.modifiers).toEqual(expect.arrayContaining([
    { $type: 'pickerStyle', style: 'segmented' },
    expect.objectContaining({ $type: 'frame', minHeight: expect.any(Number) }),
  ]));
  expect(picker.props.modifiers.find((modifier: any) => modifier.$type === 'frame').minHeight).toBeGreaterThanOrEqual(44);
  expect(screen.getByRole('tab', { name: 'First' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'Second' }));
  expect(onChange).toHaveBeenCalledWith('second');
});
