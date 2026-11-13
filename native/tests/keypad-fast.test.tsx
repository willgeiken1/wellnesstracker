import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { Keypad } from '../src/features/workout/keypad';

const pad = (value: string, onChange: (v: string) => void, inputId = 'set-1', field: 'reps' | 'weight' = 'reps') =>
  <ThemeProvider><Keypad inputId={inputId} label="Bench Press" field={field} equipment="barbell" unit="lb" value={value} previous="" onChange={onChange} onNext={() => {}} onClose={() => {}} /></ThemeProvider>;

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

test('touch and hold Backspace clears the field', async () => {
  const onChange = jest.fn();
  await render(pad('125', onChange));
  await fireEvent(screen.getByTestId('keypad-key-backspace'), 'longPress');
  expect(onChange).toHaveBeenLastCalledWith('');
  expect(screen.getByTestId('keypad-key-backspace').props.accessibilityHint).toBe('Touch and hold to clear.');
});

test('key labels grow with text size only up to 1.4x, and the sheet scrolls rather than run off the screen', async () => {
  const { StyleSheet } = require('react-native');
  await render(pad('', jest.fn()));
  for (const text of ['0', '7', '9']) expect(screen.getByText(text).props.maxFontSizeMultiplier).toBe(1.4);
  expect(StyleSheet.flatten(screen.getByTestId('keypad-scroll').props.style)).toMatchObject({ flexShrink: 1 });
});

// A weight field, so 105 is in range.
test('three digits before the store redraws make 105', async () => {
  const onChange = jest.fn();
  await render(pad('8', onChange, 'set-1', 'weight'));
  for (const key of ['1', '0', '5']) await fireEvent.press(screen.getByTestId(`keypad-key-${key}`));
  expect(onChange.mock.calls.map(c => c[0])).toEqual(['1', '10', '105']);
});

test('a redraw that lags one tap behind still counts as our own typing', async () => {
  const onChange = jest.fn();
  const view = await render(pad('8', onChange, 'set-1', 'weight'));
  await fireEvent.press(screen.getByTestId('keypad-key-1'));
  await fireEvent.press(screen.getByTestId('keypad-key-0'));
  // The store shows the first tap only now, after the second has gone.
  await view.rerender(pad('1', onChange, 'set-1', 'weight'));
  await fireEvent.press(screen.getByTestId('keypad-key-5'));
  expect(onChange).toHaveBeenLastCalledWith('105');
});

test('a key touched while another is still held is typed, in the order the fingers went down', async () => {
  const onChange = jest.fn();
  await render(pad('8', onChange, 'set-1', 'weight'));
  const key = (k: string) => screen.getByTestId(`keypad-key-${k}`);
  await fireEvent.press(key('1'));
  // 0 goes down; 5 lands before 0 lifts, so the touch never reaches 5's own key.
  await fireEvent(key('0'), 'pressIn');
  await fireEvent(key('5'), 'touchStart', { nativeEvent: { touches: [{}, {}] } });
  await fireEvent(key('0'), 'pressOut');
  await fireEvent(key('0'), 'press');
  expect(onChange.mock.calls.map(c => c[0])).toEqual(['1', '10', '105']);
});

test('a single touch on a key is not typed twice', async () => {
  const onChange = jest.fn();
  await render(pad('8', onChange, 'set-1', 'weight'));
  const key = screen.getByTestId('keypad-key-4');
  await fireEvent(key, 'pressIn');
  await fireEvent(key, 'touchStart', { nativeEvent: { touches: [{}] } });
  await fireEvent(key, 'pressOut');
  await fireEvent(key, 'press');
  expect(onChange.mock.calls.map(c => c[0])).toEqual(['4']);
});

test('the plate note has a line kept for it, and the header wraps rather than run off the edge', async () => {
  const { StyleSheet } = require('react-native');
  await render(pad('45', () => {}, 'set-1', 'weight'));
  expect(StyleSheet.flatten(screen.getByTestId('plate-remainder-slot').props.style).minHeight).toBeGreaterThan(0);
  expect(StyleSheet.flatten(screen.getByTestId('keypad-header').props.style)).toMatchObject({ flexWrap: 'wrap' });
});
