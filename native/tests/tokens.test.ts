import source from '../src/design/tokens.json';
import { createTheme, DEFAULT_PALETTE, paletteLocked, palettes, resolvePalette, tokens } from '../src/design/tokens';
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

test('palettes are the 18 from the final mockup (v20), in list order, with Orchid Evening as the default', () => {
  expect(palettes).toEqual(['orchidEvening', 'lavenderHaze', 'moonlightDusk', 'mountainMist', 'glacierBloom', 'seaGlassTide', 'auroraFjord', 'forestEmber',
    'springCitrus', 'goldenHour', 'peachNightfall', 'desertMirage', 'coralHarbor', 'rosewood', 'midnightBloom', 'velvetPlum', 'lotusGarden', 'berryMeadow']);
  expect(DEFAULT_PALETTE).toBe('orchidEvening');
  expect(createTheme('dark')).toEqual(createTheme('dark', 'orchidEvening'));
  expect(source.palettes.orchidEvening.dark.accent).toBe('#D693D8');
  expect(palettes.some(paletteLocked)).toBe(false);
});

test('grounds are neutral: colour lives in the accent and pillars, never the base', () => {
  const sat = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); return Math.max(r, g, b) - Math.min(r, g, b); };
  for (const palette of palettes) for (const mode of ['dark', 'light'] as const) for (const role of ['bg', 'surface', 'surface-2'] as const)
    expect({ palette, mode, role, neutral: sat(createTheme(mode, palette)[role]) < 0.03 }).toEqual({ palette, mode, role, neutral: true });
});

test('true black swaps only the dark ground', () => {
  const black = createTheme('dark', 'orchidEvening', true);
  expect(black.bg).toBe('#000000');
  expect(black.surface).toBe(source.palettes.orchidEvening.oled.surface);
  expect(black.accent).toBe(createTheme('dark', 'orchidEvening').accent);
  expect(createTheme('light', 'orchidEvening', true)).toEqual(createTheme('light', 'orchidEvening'));
});

test('a saved accent from before palettes maps to its closest palette', () => {
  expect(resolvePalette('sea')).toBe('seaGlassTide');
  expect(resolvePalette('dusk')).toBe('moonlightDusk');
  expect(resolvePalette('sand')).toBe('desertMirage');
  expect(resolvePalette('citrus')).toBe('springCitrus');
  expect(resolvePalette('goldenHour')).toBe('goldenHour');
  for (const unknown of ['midnightNeon', 'nope', '', null, undefined, 3]) expect(resolvePalette(unknown)).toBe('orchidEvening');
  // Names every object carries must not be read as saved themes.
  for (const builtIn of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) expect(resolvePalette(builtIn)).toBe('orchidEvening');
});

// The bars the final mockup's palettes meet (v20): every text, accent, pillar and status colour reads at 4.5:1 on the
// background and cards; on raised fills it still reads, with the accent kept to 3:1 there as a graphic in three dark themes.
const ROLES = ['text', 'text-muted', 'accent', 'accent-2', 'success', 'warning', 'danger', 'ring-oura', 'training', 'food', 'recovery', 'sleep', 'water'] as const;
describe.each(['dark', 'light'] as const)('%s contrast', mode => {
  test.each(palettes)('%s text and glyphs meet WCAG', palette => {
    const theme = createTheme(mode, palette);
    for (const background of [theme.bg, theme.surface]) for (const role of ROLES) expect({ role, ok: contrast(theme[role], background) >= 4.5 }).toEqual({ role, ok: true });
    for (const role of ROLES) expect({ role, ok: contrast(theme[role], theme['surface-2']) >= (role === 'accent' ? 3 : 4.5) }).toEqual({ role, ok: true });
    expect(contrast(theme.text, theme['accent-tint'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme['on-accent'], theme.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme['on-danger'], theme.danger)).toBeGreaterThanOrEqual(4.5);
  });
});

test('no two themes look nearly the same: every pair of accents is far apart', () => {
  const lab = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const x = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116); return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]; };
  for (const mode of ['dark', 'light'] as const) for (let i = 0; i < palettes.length; i++) for (let j = i + 1; j < palettes.length; j++) {
    const [a, b] = [lab(createTheme(mode, palettes[i]).accent), lab(createTheme(mode, palettes[j]).accent)];
    expect({ pair: `${palettes[i]}/${palettes[j]}`, mode, apart: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= 10 }).toEqual({ pair: `${palettes[i]}/${palettes[j]}`, mode, apart: true });
  }
});

test('contrast agrees with known WCAG reference ratios', () => {
  expect(contrast('#000000', '#FFFFFF').toFixed(2)).toBe('21.00');
  expect(contrast('#777777', '#FFFFFF').toFixed(2)).toBe('4.48');
  expect(contrast('#5E7A00', '#5E7A00')).toBe(1);
});
