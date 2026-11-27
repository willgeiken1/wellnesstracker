import { render, screen } from '@testing-library/react-native';
import { emptyProgress } from '../src/features/progress/model';
import { publishProgress, resetProgressStore } from '../src/features/progress/store';
import '../src/features/progress/tiles/body';
import { tilePage } from '../src/features/tiles/registry';
import { createTheme } from '../src/design/tokens';
import { ThemeProvider } from '../src/design/theme-provider';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

// Made-up measurements only.
const NOW = new Date(2026, 10, 13, 12), TODAY = '2026-11-13';
afterEach(() => resetProgressStore());

async function tile(size: 'S' | 'M' | 'L') {
  const d = emptyProgress(TODAY, 'kg', NOW.getTime());
  // Waist first on Monday; chest added on Friday, with no Monday reading to compare against.
  d.measures = [{ day: '2026-11-09', cm: { waist: 85 } }, { day: TODAY, cm: { waist: 84, chest: 100 } }];
  publishProgress(d);
  const def = tilePage('progress').tiles.find(x => x.id === 'measure')!;
  const draw = typeof def.render === 'function' ? def.render : (def.render as Record<string, typeof def.render>)[size];
  const colors = createTheme('light'), box = { w: 320, h: 200 };
  return render(<ThemeProvider>{(draw as (p: never) => React.ReactNode)({ page: 'progress', id: 'measure', size, style: 'A', options: {}, frame: box, body: box,
    colors, tint: colors.accent, mode: 'light', reduceMotion: true, editing: false, preview: false } as never)}</ThemeProvider>);
}

describe('the Measurements tile without an earlier reading', () => {
  test('shows no change for a measure that had no reading on the day compared against, never zero', async () => {
    await tile('L');
    const label = screen.getByRole('image').props.accessibilityLabel as string;
    expect(label).toContain('Waist 84.0 cm, −1.0');
    expect(label).toContain('Chest 100.0 cm, not measured then');
    expect(label).not.toMatch(/Chest 100\.0 cm, [+]?0\.0/);
    expect(screen.getByText('–')).toBeTruthy();
  });
});
