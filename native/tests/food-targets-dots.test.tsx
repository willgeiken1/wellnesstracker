import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { FoodScreen } from '../src/features/food/screen';
import { memoryRepository } from './workout-repository';
import { createTheme, palettes } from '../src/design/tokens';

const KEYS = ['energy_kj', 'protein_g', 'carbs_g', 'fat_g'] as const;
const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(9).filter(Boolean));
// react-native-svg hands strokes to native as ARGB numbers.
const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-27T17:00:00Z')); });
afterEach(() => jest.useRealTimers());

test('each Daily targets legend dot wears the same colour as its ring, in every palette and mode', async () => {
  for (const palette of palettes) for (const mode of ['light', 'dark'] as const) {
    const repo = memoryRepository();
    repo.save('food_targets', { day: '2026-10-27', energy_kj: 8368, protein_g: 120, carbs_g: 250, fat_g: 60 });
    repo.localSave('targetBasis', 'manual');
    repo.save('food_entries', { day: '2026-10-27', meal_id: 'fd000000-0000-4000-8000-000000000000', name: 'Synthetic meal', energy_kj: 2092, protein_g: 40, carbs_g: 90, fat_g: 20 });
    repo.save('settings', { theme_override: mode, accent: palette });
    const view = await render(<ThemeProvider repository={repo}><FoodScreen repository={repo} /></ThemeProvider>);
    const colors = createTheme(mode, palette);
    const palette4 = [colors.food, colors.training, colors.recovery, colors.sleep];
    const dots = KEYS.map(key => flat(screen.getByTestId(`food-target-dot-${key}`).props.style).backgroundColor as string);
    const rings = KEYS.map(key => {
      const used = new Set(screen.getByTestId(`food-ring-${key}`).queryAll(node => (node.type as unknown as string) === 'RNSVGPath').map(node => node.props.stroke?.payload));
      return palette4.find(color => used.has(argb(color)));
    });
    expect({ palette, mode, dots }).toEqual({ palette, mode, dots: rings });
    expect(new Set(dots).size).toBe(4);
    await view.unmount();
  }
});
