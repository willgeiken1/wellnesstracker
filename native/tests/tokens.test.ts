import source from '../src/design/tokens.json';
import { accents, createTheme, tokens } from '../src/design/tokens';
import { contrast } from '../src/core/contrast';

test('JSON is the sole token source and maps semantic roles', () => {
  expect(tokens).toBe(source);
  expect(tokens.spacing).toEqual([4, 8, 12, 16, 20, 24, 32]);
  for (const mode of ['dark', 'light'] as const) {
    for (const accent of accents) {
      const theme = createTheme(mode, accent);
      expect(theme.bg).toBe(source.themes[mode].bg);
      expect(theme.accent).toBe(source.accents[accent][mode].accent);
      expect(theme['accent-2']).toBe(source.accents[accent][mode]['accent-2']);
    }
  }
});

describe.each(['dark', 'light'] as const)('%s contrast', mode => {
  test.each(accents)('%s text and glyphs meet WCAG', accent => {
    const theme = createTheme(mode, accent);
    for (const background of [theme.bg, theme.surface, theme['surface-2']]) {
      expect(contrast(theme.text, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme['text-muted'], background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.accent, background)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(theme['on-accent'], theme.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme['on-danger'], theme.danger)).toBeGreaterThanOrEqual(4.5);
  });
});
