import { render, screen, fireEvent } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SegmentedControl } from '../src/components/segmented-control';
import { ThemeProvider } from '../src/design/theme-provider';
import { contrast } from '../src/core/contrast';
import * as design from '../src/design/tokens';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const options = [{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }, { value: 'c', label: 'Third' }] as const;

// Rewritten for the final design (kit.css `.seg`): one surface-2 track with no outline, the chosen choice raised on it,
// the others transparent; each choice is drawn 34 pt tall and grows to 46 pt to touch.
test('the choices sit in one visible track, the chosen one raised on it', async () => {
  const onChange = jest.fn();
  await render(<SegmentedControl label="Made-up choices" options={options} value="a" onChange={onChange} />, { wrapper });
  const track = StyleSheet.flatten(screen.root!.props.style);
  expect(track.backgroundColor).toBeTruthy();
  expect(track).toMatchObject({ padding: 2, gap: 2, borderRadius: 12 });
  const chosenTab = screen.getByRole('tab', { name: 'First' }), otherTab = screen.getByRole('tab', { name: 'Second' });
  const chosen = StyleSheet.flatten(chosenTab.props.style), other = StyleSheet.flatten(otherTab.props.style);
  expect(other.backgroundColor).toBe('transparent');
  expect(chosen.backgroundColor).not.toBe('transparent');
  expect(chosen.backgroundColor).not.toBe(track.backgroundColor);
  expect(other.minHeight).toBe(34);
  expect(other.minHeight + otherTab.props.hitSlop.top + otherTab.props.hitSlop.bottom).toBeGreaterThanOrEqual(44);
  await fireEvent.press(otherTab);
  expect(onChange).toHaveBeenCalledWith('b');
});
test.each(['dark', 'light'] as const)('in %s mode a choice that is not chosen keeps 4.5:1 text on the track', mode => {
  const c = (design.createTheme as (mode: string, palette?: unknown) => Record<string, string>)(mode);
  expect(contrast(c.text, c['surface-2'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c['on-accent'], c.accent)).toBeGreaterThanOrEqual(4.5);
});

describe('the Pills look from Settings', () => {
  const { syntheticRow } = jest.requireActual('../fixtures/sync');
  const pills = (theme: 'dark' | 'light', palette = 'seaGlassTide') => ({
    list: () => [{ ...syntheticRow('settings'), data: { theme_override: theme, accent: `${palette};selector=pills` } }],
    subscribe: () => () => {}, save: jest.fn(),
  }) as never;
  const four = [{ value: 'w', label: 'Week' }, { value: 'm', label: 'Month' }, { value: 'q', label: 'Quarter' }, { value: 'y', label: 'Year' }] as const;
  test('each choice is its own rounded chip in one row that scrolls sideways, never a grid', async () => {
    const onChange = jest.fn();
    await render(<ThemeProvider repository={pills('light')}><SegmentedControl label="Made-up range" options={four} value="m" onChange={onChange} /></ThemeProvider>);
    const row = screen.getByTestId('selector-pills');
    expect(row.props.horizontal).toBe(true);
    expect(row.props.accessibilityRole).toBe('tablist');
    const chosen = StyleSheet.flatten(screen.getByRole('tab', { name: 'Month' }).props.style);
    const other = StyleSheet.flatten(screen.getByRole('tab', { name: 'Year' }).props.style);
    expect(chosen.borderRadius).toBe(chosen.minHeight / 2);
    expect(chosen.backgroundColor).not.toBe(other.backgroundColor);
    expect(other.minHeight).toBeGreaterThanOrEqual(44);
    expect(other.flexBasis).toBeUndefined();
    expect(screen.getByRole('tab', { name: 'Month' }).props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByRole('tab', { name: 'Year' }));
    expect(onChange).toHaveBeenCalledWith('y');
  });
  test.each(['seaGlassTide', 'forestEmber', 'goldenHour', 'moonlightDusk'] as const)('on %s the chip text keeps 4.5:1 in light and dark', palette => {
    for (const mode of ['light', 'dark'] as const) {
      const c = (design.createTheme as (mode: string, palette?: unknown) => Record<string, string>)(mode, palette);
      expect(contrast(c.text, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c['on-accent'], c.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
