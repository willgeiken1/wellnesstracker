import source from '../src/design/tokens.json';
import { createTheme, DEFAULT_PALETTE, paletteLocked, palettes, resolvePalette, tokens } from '../src/design/tokens';
import { appPalettes, PALETTES } from '../scripts/ins01-palette-contrast';
import { contrast } from '../src/core/contrast';

test('JSON is the sole token source and maps semantic roles', () => {
  expect(tokens).toBe(source);
  expect(tokens.spacing).toEqual([4, 8, 12, 16, 20, 24, 32]);
  for (const mode of ['dark', 'light'] as const) {
    for (const palette of palettes) {
      const theme = createTheme(mode, palette);
      expect(theme.bg).toBe(source.palettes[palette][mode].bg);
      expect(theme.accent).toBe(source.palettes[palette][mode].accent);
      expect(theme.danger).toBe(source.themes[mode].danger);
    }
  }
});

test('palettes are the 11 open INS-01 palettes, generated, with Sea Glass Tide as the default', () => {
  expect(source.palettes).toEqual(appPalettes());
  expect(palettes).toEqual(PALETTES.filter(p => !p.secret).map(p => p.id));
  expect(palettes).toHaveLength(11);
  expect(DEFAULT_PALETTE).toBe('seaGlassTide');
  expect(createTheme('dark')).toEqual(createTheme('dark', 'seaGlassTide'));
  expect(palettes.some(paletteLocked)).toBe(false);
});

test('a saved accent from before palettes maps to its closest palette', () => {
  expect(resolvePalette('sea')).toBe('seaGlassTide');
  expect(resolvePalette('dusk')).toBe('moonlightDusk');
  expect(resolvePalette('sand')).toBe('desertMirage');
  expect(resolvePalette('citrus')).toBe('springCitrus');
  expect(resolvePalette('goldenHour')).toBe('goldenHour');
  for (const unknown of ['midnightNeon', 'nope', '', null, undefined, 3]) expect(resolvePalette(unknown)).toBe('seaGlassTide');
});

test('pillar colours in the default palette match the shared pillar tokens other screens still read', () => {
  for (const mode of ['dark', 'light'] as const) for (const pillar of ['training', 'food', 'sleep'] as const)
    expect(source.palettes.seaGlassTide[mode][pillar]).toBe(source.color.pillar[pillar][mode]);
});

describe.each(['dark', 'light'] as const)('%s contrast', mode => {
  test.each(palettes)('%s text and glyphs meet WCAG', palette => {
    const theme = createTheme(mode, palette);
    for (const background of [theme.bg, theme.surface, theme['surface-2']]) {
      for (const role of ['accent', 'accent-2', 'success', 'warning', 'danger', 'ring-oura', 'training', 'food', 'recovery', 'sleep', 'water'] as const) {
        expect(contrast(theme[role], background)).toBeGreaterThanOrEqual(3);
      }
      // Text color audit: ThemedText, native tabs, web tabs, Button, SegmentedControl.
      // on-accent/on-danger are checked against their filled backgrounds below.
      for (const role of ['text', 'text-muted', 'accent', 'accent-2'] as const) {
        expect(contrast(theme[role], background)).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const role of ['text', 'text-muted'] as const) expect(contrast(theme[role], theme['accent-tint'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme['on-accent'], theme.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme['on-danger'], theme.danger)).toBeGreaterThanOrEqual(4.5);
  });
});

test('contrast agrees with known WCAG reference ratios', () => {
  expect(contrast('#000000', '#FFFFFF').toFixed(2)).toBe('21.00');
  expect(contrast('#777777', '#FFFFFF').toFixed(2)).toBe('4.48');
  expect(contrast('#5E7A00', '#5E7A00')).toBe(1);
});
