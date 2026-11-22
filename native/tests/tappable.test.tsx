import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { Tappable, PRESSED_OPACITY, tappableStyle } from '../src/components/tappable';

const at = (pressed: boolean) => ({ pressed, hovered: false });

test('a control dims while it is held and comes back when it is let go', () => {
  expect(StyleSheet.flatten(tappableStyle({ padding: 4 }, at(true)))).toEqual({ padding: 4, opacity: PRESSED_OPACITY });
  expect(StyleSheet.flatten(tappableStyle({ padding: 4 }, at(false)))).toEqual({ padding: 4 });
});

test('it keeps a style function of its own and adds the dim on top', () => {
  const own = ({ pressed }: { pressed: boolean }) => ({ backgroundColor: pressed ? 'red' : 'blue' });
  expect(StyleSheet.flatten(tappableStyle(own, at(true)))).toEqual({ backgroundColor: 'red', opacity: PRESSED_OPACITY });
  expect(StyleSheet.flatten(tappableStyle(own, at(false)))).toEqual({ backgroundColor: 'blue' });
});

test('a disabled control never dims', () => {
  expect(StyleSheet.flatten(tappableStyle({ padding: 2 }, at(true), true))?.opacity).toBeUndefined();
});

test('it still presses and draws with its own style at rest', async () => {
  const onPress = jest.fn();
  await render(<Tappable testID="t" accessibilityRole="button" accessibilityLabel="Go" onPress={onPress} style={{ padding: 4 }}><Text>Go</Text></Tappable>);
  expect(StyleSheet.flatten(screen.getByTestId('t').props.style)).toEqual({ padding: 4 });
  await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('rows, keys and cards that had no press look now use it', () => {
  const files = ['src/components/list-row.tsx', 'src/features/workout/keypad.tsx', 'src/features/workout/set-row.tsx',
    'src/features/settings/appearance.tsx', 'src/features/home-widgets/home-widget-card.tsx', 'src/features/food/search.tsx'];
  for (const f of files) expect(readFileSync(join(__dirname, '..', f), 'utf8')).toMatch(/Tappable as Pressable/);
});
