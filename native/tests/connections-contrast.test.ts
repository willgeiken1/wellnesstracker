import { createTheme, type Palette } from '../src/design/tokens';
import tokens from '../src/design/tokens.json';
import { contrast } from '../scripts/ins01-palette-contrast';

// Health & devices draws the "Connected" chip text and the service letters in the text colour (A11Y-04, A11Y-13).
test('the Connected chip and the service letters reach 4.5:1 in every theme, light and dark', () => {
  const failures: string[] = [];
  for (const palette of Object.keys(tokens.palettes) as Palette[]) for (const mode of ['light', 'dark'] as const) {
    const theme = createTheme(mode, palette);
    const chip = contrast(theme.text, theme['accent-tint']), letter = contrast(theme.text, theme['surface-2']);
    if (chip < 4.5) failures.push(`${palette} ${mode} chip ${chip.toFixed(2)}`);
    if (letter < 4.5) failures.push(`${palette} ${mode} letter ${letter.toFixed(2)}`);
  }
  expect(failures).toEqual([]);
});
