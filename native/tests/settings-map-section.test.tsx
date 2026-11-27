import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { MAP_DEFAULTS, resetMemoryMapPrefs } from '../src/features/home/hero/prefs';
import { MapSection, auroraPreview, ridgePreview } from '../src/features/settings/map-section';
import { summary } from '../src/features/settings/home';
import { DEFAULT_PREFS } from '../src/features/settings/prefs';

jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));
beforeEach(() => resetMemoryMapPrefs());
const flip = (name: string, v: boolean) => act(() => { fireEvent(screen.getByRole('switch', { name }), 'valueChange', v); });

test('Appearance › Home edits the Insight map choices Home reads, and Reset brings back the defaults', async () => {
  await render(<ThemeProvider><MapSection /></ThemeProvider>);
  expect(screen.getByText('Every style shows the same numbers. Reduce Motion in iOS also turns movement off here.')).toBeTruthy();
  expect(screen.getByRole('radio', { name: /^Aurora\./ })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: /^Ridgeline\./ }));
  expect(screen.getByRole('radio', { name: /^Ridgeline\./ })).toBeChecked();
  // Map off keeps the numbers: no style list, no Detail or Glow, no values on the map.
  await flip('Map', false);
  expect(screen.queryByText('Map style')).toBeNull();
  expect(screen.queryByText('Detail')).toBeNull();
  expect(screen.getByText('Reduce Motion in iOS also turns movement off here.')).toBeTruthy();
  // The whole hero off leaves one line and keeps the other choices.
  await flip('Insight map', false);
  expect(screen.getByText('Turn it back on any time. Your map settings are kept.')).toBeTruthy();
  await flip('Insight map', true);
  expect(screen.queryByText('Map style')).toBeNull();
  await fireEvent.press(screen.getByTestId('appearance-map-reset'));
  expect(screen.getByText('Map style')).toBeTruthy();
  expect(screen.getByRole('radio', { name: /^Aurora\./ })).toBeChecked();
  expect(MAP_DEFAULTS.style).toBe('aurora');
});

test('both style pictures draw the sample day in the palette colours of either look', () => {
  for (const mode of ['dark', 'light'] as const) {
    const c = createTheme(mode, 'orchidEvening') as unknown as Record<string, string>;
    for (const xml of [auroraPreview(c, mode), ridgePreview(c, mode)]) {
      expect(xml.startsWith('<svg')).toBe(true);
      expect(xml).toContain('>63<');
      expect(xml).toContain(c.training);
    }
  }
});

test('the Settings rows read the real calorie target, and reminders read Off where notifications are missing', () => {
  expect(summary('goals', DEFAULT_PREFS as never, 'System', 0, false, { kcal: 2000 })).toBe('2,000 kcal');
  expect(summary('reminders', DEFAULT_PREFS as never, 'System', 0, false, { limited: true })).toBe('Off');
  expect(summary('reminders', DEFAULT_PREFS as never, 'System', 0, false)).toBe('0 on');
  // The count still follows the switches once some are on.
  expect(summary('reminders', { ...DEFAULT_PREFS, rem: { ...DEFAULT_PREFS.rem, workout: true, weekly: true, food: true, rest: true } } as never, 'System', 0, false)).toBe('4 on');
  // The Reconnect Oura alert is not available yet (its switch shows as coming later), so a saved "on" is not counted.
  expect(summary('reminders', { ...DEFAULT_PREFS, rem: { ...DEFAULT_PREFS.rem, workout: true, weekly: true, oura: true, rest: true } } as never, 'System', 0, false)).toBe('3 on');
});
