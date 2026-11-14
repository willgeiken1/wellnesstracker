import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { CORNER_RADIUS, DEFAULT_APPEARANCE, formatAppearance, parseAppearance, PRESETS, presetOf, resetLooks } from '../src/design/looks';
import { Card, Panel, PROTOTYPE_RADIUS } from '../src/components/card';
import { Button } from '../src/components/button';
import { ThemedText } from '../src/components/themed-text';
import { tokens } from '../src/design/tokens';
import Appearance from '../src/features/settings/appearance';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';

function settingsRepository(accent?: string) {
  let saved: Row[] = accent ? [{ ...syntheticRow('settings'), data: { accent } }] : [];
  const listeners = new Set<() => void>();
  return {
    list: () => saved,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    save: (_table: unknown, data: Row['data']) => { saved = [{ ...syntheticRow('settings'), data }]; listeners.forEach(l => l()); return saved[0]; },
  } as unknown as Repository;
}
const savedAccent = (repository: Repository) => repository.list('settings')[0]?.data.accent;
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
afterEach(() => jest.restoreAllMocks());

describe('surface, corner and heading looks', () => {
  test('default to the plan: flat panels, soft 12 pt corners, Lexend headings', () => {
    expect(DEFAULT_APPEARANCE).toMatchObject({ surface: 'flat', corners: 'soft', heading: 'lexend' });
    expect(CORNER_RADIUS.soft).toBe(tokens.radii.card);
  });
  test('save only what differs, read back, and fall back alone on anything unknown', () => {
    const looks = { ...DEFAULT_APPEARANCE, surface: 'raised', corners: 'round', heading: 'system' } as const;
    expect(formatAppearance(looks)).toBe('seaGlassTide;surface=raised;corners=round;heading=system');
    expect(parseAppearance(formatAppearance(looks))).toEqual(looks);
    expect(parseAppearance('goldenHour;surface=bevel;corners=round;heading=comic')).toEqual({ ...DEFAULT_APPEARANCE, palette: 'goldenHour', corners: 'round' });
    // Older saved text has none of these and reads as the plan's defaults.
    expect(parseAppearance('goldenHour;ring=liquid')).toMatchObject({ surface: 'flat', corners: 'soft', heading: 'lexend' });
  });
  test('the Floating preset sets the floating tab bar and is recognised', () => {
    expect(PRESETS.floating).toMatchObject({ bar: 'floating' });
    expect(presetOf(PRESETS.floating)).toBe('floating');
  });
  test('reset puts every look back but keeps the theme', () => {
    const mixed = { ...DEFAULT_APPEARANCE, palette: 'forestEmber', ring: 'glass', bar: 'floating', surface: 'raised', corners: 'square', heading: 'system' } as const;
    expect(resetLooks(mixed)).toEqual({ ...DEFAULT_APPEARANCE, palette: 'forestEmber' });
  });
});

describe('panels, cards and buttons follow the looks', () => {
  const blocks = (accent?: string) => render(<ThemeProvider repository={settingsRepository(accent)}>
    <Panel testID="panel" /><Card testID="card" /><Panel testID="big" style={{ borderRadius: PROTOTYPE_RADIUS }} />
    <Button testID="button" label="Save" onPress={() => {}} /><Button testID="small" size="small" label="Start" onPress={() => {}} />
    <ThemedText testID="title" variant="title">Push day</ThemedText>
  </ThemeProvider>);
  test('flat: a panel has no shadow and the card keeps its own', async () => {
    await blocks();
    expect(flat('panel').shadowOpacity).toBeUndefined();
    expect(flat('panel').borderRadius).toBe(12);
    expect(flat('card').borderRadius).toBe(12);
    expect(flat('big').borderRadius).toBe(18);
  });
  test('raised: a panel is drawn as the card', async () => {
    await blocks('seaGlassTide;surface=raised');
    expect(flat('panel')).toEqual(flat('card'));
  });
  test('corners reach panels, cards and both button sizes', async () => {
    await blocks('seaGlassTide;corners=round');
    expect(flat('panel').borderRadius).toBe(20);
    expect(flat('card').borderRadius).toBe(20);
    expect(flat('small').borderRadius).toBe(20);
    expect(flat('button').borderRadius).toBe(13);
    // Panels drawn with the prototype's larger corners keep them a step rounder than the rest.
    expect(flat('big').borderRadius).toBe(28);
  });
  test('the small button sits at its own width at the full touch target, with no slop to fall outside its parent', async () => {
    await blocks();
    expect(flat('small')).toMatchObject({ alignSelf: 'flex-start', minHeight: tokens.touch.ios });
    expect(screen.getByTestId('small').props.hitSlop).toBeUndefined();
  });
  test('the card is raised with a shadow on iOS and elevation on Android, on the same surface as panels', async () => {
    const { Platform } = require('react-native');
    await blocks();
    expect(flat('card').shadowOpacity).toBeGreaterThan(0);
    expect(flat('card').backgroundColor).toBe(flat('panel').backgroundColor);
    const os = Platform.OS; Platform.OS = 'android';
    try {
      await blocks();
      expect(StyleSheet.flatten(screen.getAllByTestId('card').at(-1)!.props.style).elevation).toBeGreaterThan(0);
      expect(StyleSheet.flatten(screen.getAllByTestId('card').at(-1)!.props.style).backgroundColor).toBe(StyleSheet.flatten(screen.getAllByTestId('panel').at(-1)!.props.style).backgroundColor);
    } finally { Platform.OS = os; }
  });
  test('raised: a prototype panel keeps its larger corners as well as the shadow', async () => {
    await blocks('seaGlassTide;surface=raised');
    expect(flat('big')).toMatchObject({ borderRadius: 18 });
    expect(flat('big').shadowOpacity).toBeGreaterThan(0);
  });
  test('square corners make the prototype panels clearly square too', async () => {
    await blocks('seaGlassTide;corners=square');
    expect(flat('panel').borderRadius).toBe(6);
    expect(flat('big').borderRadius).toBe(8);
  });
  test('the heading look switches titles between Lexend and the system font', async () => {
    const view = await blocks();
    expect(StyleSheet.flatten(screen.getByTestId('title').props.style).fontFamily).toBe(tokens.font.heading);
    await view.unmount();
    await blocks('seaGlassTide;heading=system');
    expect(StyleSheet.flatten(screen.getByTestId('title').props.style).fontFamily).toBeUndefined();
  });
});

describe('Appearance', () => {
  test('offers Panels, Corners and Headings, each saved as a look', async () => {
    const repository = settingsRepository();
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getByRole('tab', { name: 'Raised' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Round' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'System font' }));
    expect(savedAccent(repository)).toBe('seaGlassTide;surface=raised;corners=round;heading=system');
    expect(screen.getByRole('tab', { name: 'Raised' })).toBeSelected();
  });
  test('shows a preview of the current looks at the top', async () => {
    await render(<ThemeProvider repository={settingsRepository('seaGlassTide;corners=square')}><Appearance /></ThemeProvider>);
    expect(screen.getByTestId('appearance-preview')).toBeTruthy();
    expect(screen.getByText('Push day')).toBeTruthy();
  });
  test('Reset looks asks first, then puts the looks back and keeps the theme', async () => {
    const repository = settingsRepository('forestEmber;ring=glass;bar=floating;surface=raised');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.[1]?.onPress?.(); });
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getByRole('button', { name: /^Reset looks\./ }));
    expect(alert.mock.calls[0][2]?.[1]).toMatchObject({ style: 'destructive' });
    expect(savedAccent(repository)).toBe('forestEmber');
    expect(screen.getByText('Looks reset to the default.')).toBeTruthy();
    // The note goes as soon as a look changes again.
    await fireEvent.press(screen.getByRole('tab', { name: 'Round' }));
    expect(screen.queryByText('Looks reset to the default.')).toBeNull();
  });
  test('the Floating preset is offered with the others', async () => {
    const repository = settingsRepository();
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getByTestId('preset-floating'));
    expect(savedAccent(repository)).toBe('seaGlassTide;bar=floating');
  });
});

test('in dark mode a raised card also takes a hairline edge, since a shadow barely shows there', async () => {
  const { Appearance } = require('react-native');
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
  const repository = settingsRepository();
  repository.save('settings', { theme_override: 'dark' } as never);
  await render(<ThemeProvider repository={repository}><Panel testID="panel" /><Card testID="card" /></ThemeProvider>);
  expect(flat('card')).toMatchObject({ borderWidth: 1 });
  expect(flat('panel').borderWidth).toBeUndefined();
});

describe('weight chart colour', () => {
  const { BodyChart } = require('../src/features/body/chart');
  const { createTheme } = require('../src/design/tokens');
  /** Made-up weigh-ins only. */
  const points = [{ day: '2026-11-01', kg: 80, trendKg: 80 }, { day: '2026-11-02', kg: 79.6, trendKg: 79.8 }];
  test('is saved as a look, recovery by default and left out of the saved text', () => {
    expect(DEFAULT_APPEARANCE.weightChart).toBe('recovery');
    expect(formatAppearance(DEFAULT_APPEARANCE)).toBe('seaGlassTide');
    expect(parseAppearance('seaGlassTide;weight=accent').weightChart).toBe('accent');
    expect(parseAppearance('seaGlassTide;weight=plum').weightChart).toBe('recovery');
    expect(resetLooks({ ...DEFAULT_APPEARANCE, weightChart: 'accent' }).weightChart).toBe('recovery');
  });
  test.each([[undefined, 'recovery'], ['seaGlassTide;weight=accent', 'accent']] as const)('the trend line follows the look (%s)', async (accent, role) => {
    await render(<ThemeProvider repository={settingsRepository(accent)}><BodyChart points={points} raw={[]} unit="kg" /></ThemeProvider>);
    const colors = createTheme('light');
    // react-native-svg hands colours to native as ARGB numbers.
    const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;
    expect(screen.getByTestId('body-chart-line').props.stroke.payload).toBe(argb(colors[role]));
    expect(colors.accent).not.toBe(colors.recovery);
  });
  test('Appearance offers it and saves the choice', async () => {
    const repository = settingsRepository();
    await render(<ThemeProvider repository={repository}><Appearance /></ThemeProvider>);
    await fireEvent.press(screen.getByRole('tab', { name: 'Accent' }));
    expect(savedAccent(repository)).toBe('seaGlassTide;weight=accent');
  });
});
