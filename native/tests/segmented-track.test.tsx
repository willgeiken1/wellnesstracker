import { render, screen, fireEvent } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SegmentedControl } from '../src/components/segmented-control';
import { ThemeProvider } from '../src/design/theme-provider';
import { contrast } from '../src/core/contrast';
import * as design from '../src/design/tokens';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const options = [{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }, { value: 'c', label: 'Third' }] as const;

test('the choices sit in one visible track: filled for a card, outlined for the page', async () => {
  const onChange = jest.fn();
  await render(<SegmentedControl label="Made-up choices" options={options} value="a" onChange={onChange} />, { wrapper });
  const track = StyleSheet.flatten(screen.root!.props.style);
  expect(track.backgroundColor).toBeTruthy();
  expect(track.borderWidth).toBe(1);
  const chosen = StyleSheet.flatten(screen.getByRole('tab', { name: 'First' }).props.style);
  const other = StyleSheet.flatten(screen.getByRole('tab', { name: 'Second' }).props.style);
  expect(other.backgroundColor).toBe('transparent');
  expect(chosen.backgroundColor).not.toBe('transparent');
  expect(other.minHeight).toBeGreaterThanOrEqual(44);
  await fireEvent.press(screen.getByRole('tab', { name: 'Second' }));
  expect(onChange).toHaveBeenCalledWith('b');
});
test.each(['dark', 'light'] as const)('in %s mode a choice that is not chosen keeps 4.5:1 text on the track', mode => {
  const c = (design.createTheme as (mode: string, palette?: unknown) => Record<string, string>)(mode);
  expect(contrast(c.text, c['surface-2'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c['on-accent'], c.accent)).toBeGreaterThanOrEqual(4.5);
});
