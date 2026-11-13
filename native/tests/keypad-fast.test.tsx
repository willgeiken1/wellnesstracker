import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { Keypad } from '../src/features/workout/keypad';

const pad = (value: string, onChange: (v: string) => void, inputId = 'set-1') =>
  <ThemeProvider><Keypad inputId={inputId} label="Bench Press" field="reps" equipment="barbell" unit="lb" value={value} previous="" onChange={onChange} onNext={() => {}} onClose={() => {}} /></ThemeProvider>;

test('two quick digits before the store redraws make 12, not 2', async () => {
  const onChange = jest.fn();
  // The value prop never updates here, like taps landing before the logger redraws.
  await render(pad('8', onChange));
  await fireEvent.press(screen.getByTestId('keypad-key-1'));
  await fireEvent.press(screen.getByTestId('keypad-key-2'));
  expect(onChange.mock.calls.map(c => c[0])).toEqual(['1', '12']);
});

test('once the store catches up, typing carries on from it, and a change from elsewhere wins', async () => {
  const onChange = jest.fn();
  const view = await render(pad('8', onChange));
  await fireEvent.press(screen.getByTestId('keypad-key-1'));
  await view.rerender(pad('1', onChange));
  await fireEvent.press(screen.getByTestId('keypad-key-0'));
  expect(onChange).toHaveBeenLastCalledWith('10');
  // Something else set the value (an undo, say): the next digit joins that, not the old typing.
  await view.rerender(pad('5', onChange));
  await fireEvent.press(screen.getByTestId('keypad-key-2'));
  expect(onChange).toHaveBeenLastCalledWith('52');
});

test('coming back to a field starts it fresh, so the first digit replaces the old value', async () => {
  const onChange = jest.fn();
  const view = await render(pad('8', onChange, 'set-1'));
  await fireEvent.press(screen.getByTestId('keypad-key-9'));
  await view.rerender(pad('9', onChange, 'set-2'));
  await view.rerender(pad('9', onChange, 'set-1'));
  await fireEvent.press(screen.getByTestId('keypad-key-6'));
  expect(onChange).toHaveBeenLastCalledWith('6');
});

test('a value the store never shows is let go after a moment', async () => {
  jest.useFakeTimers({ now: new Date(2026, 10, 13, 9), doNotFake: ['nextTick', 'setImmediate'] });
  const onChange = jest.fn();
  await render(pad('8', onChange));
  await fireEvent.press(screen.getByTestId('keypad-key-1'));
  jest.setSystemTime(new Date(2026, 10, 13, 9, 0, 2));
  await fireEvent.press(screen.getByTestId('keypad-key-2'));
  // The store kept 8, so the next digit builds on what the screen shows, not on the refused 1.
  expect(onChange).toHaveBeenLastCalledWith('82');
  jest.useRealTimers();
});
