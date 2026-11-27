import { render, screen } from '@testing-library/react-native';
import { emptyProgress, HISTORY } from '../src/features/progress/model';
import { publishProgress, resetProgressStore } from '../src/features/progress/store';
import '../src/features/progress/tiles/more';
import { tilePage } from '../src/features/tiles/registry';
import { createTheme } from '../src/design/tokens';
import { ThemeProvider } from '../src/design/theme-provider';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

// Made-up readings only.
const NOW = new Date(2026, 10, 11, 12), TODAY = '2026-11-11';
afterEach(() => resetProgressStore());

async function draw(size: 'S' | 'M' | 'L', metric: string) {
  const def = tilePage('progress').tiles.find(x => x.id === 'trend')!;
  const fn = typeof def.render === 'function' ? def.render : (def.render as Record<string, typeof def.render>)[size];
  const colors = createTheme('light'), box = { w: 340, h: 220 };
  await render(<ThemeProvider>{(fn as (p: never) => React.ReactNode)({ page: 'progress', id: 'trend', size, style: 'A', options: { metric, range: 'week' }, frame: box, body: box,
    colors, tint: colors.accent, mode: 'light', reduceMotion: true, editing: false, preview: false } as never)}</ThemeProvider>);
}

describe('the trend tile names the day of its latest reading', () => {
  test("yesterday's calories, with nothing logged today, carry yesterday's date, not 'today, so far'", async () => {
    const d = emptyProgress(TODAY, 'kg', NOW.getTime());
    d.days.kcal = d.days.kcal.slice(); d.days.kcal[HISTORY - 2] = 1800;
    publishProgress(d);
    await draw('M', 'kcal');
    expect(screen.queryByText('Today, so far')).toBeNull();
    expect(screen.getByText('Tue, Nov 10')).toBeTruthy();
    const label = screen.getAllByLabelText(/Calories|Energy|kcal/i)[0].props.accessibilityLabel as string;
    expect(label).not.toMatch(/today, so far/);
    expect(label).toMatch(/tue, nov 10/);
  });
  test("today's reading still reads as today", async () => {
    const d = emptyProgress(TODAY, 'kg', NOW.getTime());
    d.days.kcal = d.days.kcal.slice(); d.days.kcal[HISTORY - 1] = 900;
    publishProgress(d);
    await draw('M', 'kcal');
    expect(screen.getByText('Today, so far')).toBeTruthy();
  });
});
