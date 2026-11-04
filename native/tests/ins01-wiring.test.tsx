import { processColor } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import { accents, createTheme, tokens } from '../src/design/tokens';
import { contrast } from '../src/core/contrast';
import { CalorieRing } from '../src/features/food/ring';
import { Cardio } from '../src/features/cardio/screen';
import { memoryRepository } from './workout-repository';

describe.each(['dark', 'light'] as const)('%s INS-01 wiring', mode => {
  test.each(accents)('%s retains text, accents and status while wiring surfaces', async accent => {
    const repo = memoryRepository();
    repo.save('settings', { theme_override: mode, accent });
    let theme: ReturnType<typeof useTheme>['colors'];
    function Probe() { theme = useTheme().colors; return null; }
    await render(<ThemeProvider repository={repo}><Probe /></ThemeProvider>);
    const before = createTheme(mode, accent);
    expect(theme!).toMatchObject({
      bg: tokens.color.surface.base[mode],
      surface: tokens.color.surface.card[mode],
      'surface-2': tokens.color.surface.panel[mode],
    });
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (!['bg', 'surface', 'surface-2'].includes(key)) expect(theme![key]).toBe(before[key]);
    }
    for (const background of [theme!.bg, theme!.surface, theme!['surface-2']]) {
      for (const role of ['text', 'text-muted', 'accent', 'accent-2'] as const) {
        expect(contrast(theme![role], background)).toBeGreaterThanOrEqual(4.5);
      }
      for (const role of ['success', 'warning', 'danger', 'ring-oura'] as const) {
        expect(contrast(theme![role], background)).toBeGreaterThanOrEqual(3);
      }
      for (const pillar of Object.values(tokens.color.pillar)) {
        expect(contrast(pillar[mode], background)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('food and training rings use pillar graphics, retaining accessible quantities', async () => {
    const repo = memoryRepository();
    repo.save('settings', { theme_override: mode, accent: 'dusk' });
    await render(<ThemeProvider repository={repo}>
      <CalorieRing total={{energy_kj:418.4, protein_g:10, carbs_g:15, fat_g:2, amount_g:null, fiber_g:null, sugar_g:null, sodium_mg:null}} target={{energy_kj:836.8, protein_g:20, carbs_g:30, fat_g:4}} />
      <Cardio repository={repo} />
    </ThemeProvider>);
    const food = screen.getByRole('image');
    expect(food.props.accessibilityLabel).toContain('100');
    const arcs = food.queryAll(node => node.type === 'RNSVGPath');
    expect(arcs[0].props.stroke).toEqual({type:0, payload:processColor(tokens.color.pillar.food[mode])});
    expect(arcs.slice(1).every(arc => arc.props.stroke.payload === processColor(tokens.themes[mode].text))).toBe(true);
    const training = screen.getByRole('progressbar');
    expect(training).toHaveAccessibilityValue({min:0,max:150,now:0});
    expect(training.queryAll(node => node.type === 'RNSVGCircle')[1].props.stroke).toEqual({type:0, payload:processColor(tokens.color.pillar.training[mode])});
  });
});

test('light food and training must remain graphics-only on panel; food also on base', () => {
  const { pillar, surface } = tokens.color;
  expect(contrast(pillar.food.light, surface.panel.light)).toBeLessThan(4.5);
  expect(contrast(pillar.food.light, surface.base.light)).toBeLessThan(4.5);
  expect(contrast(pillar.training.light, surface.panel.light)).toBeLessThan(4.5);
});
