import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { stripDays, weekDays, weekLetters, weekNames, weekday } from '../src/features/food/day';
import { saveFood } from '../src/features/food/model';
import { quickFood } from '../src/features/food/quick-sheet';
import { resetFoodDay } from '../src/features/food/selection';
import { useDayData } from '../src/features/food/tiles/kit';
import { FOOD_TILES, weekOf } from '../src/features/food/tiles/tiles';
import { emptyProgress, HISTORY } from '../src/features/progress/model';
import { publishProgress, resetProgressStore } from '../src/features/progress/store';
import '../src/features/progress/tiles/body';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs';
import { tilePage } from '../src/features/tiles/registry';
import type { TileRenderProps } from '../src/features/tiles/types';
import { memoryRepository } from './workout-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn(() => { throw Error('no provider'); }), useOptionalAuth: jest.fn() }));
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
// Made-up foods and readings only. Wednesday, October 28, 2026.
const DAY = '2026-10-28', LUNCH = 'fd000000-0000-4000-8000-000000000001';

describe("Food's week follows the week start chosen in Settings", () => {
  test('Monday stays the default; Sunday and Saturday move the week, its letters and its names', () => {
    expect(weekDays(DAY)[0]).toBe('2026-10-26');
    expect(weekDays(DAY, 'sun')).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(weekDays(DAY, 'sat')[0]).toBe('2026-10-24');
    expect(weekday(DAY, 'sun')).toBe(3);
    expect(weekLetters('sun')).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(weekNames('sat').slice(0, 2)).toEqual(['Saturday', 'Sunday']);
    const strip = stripDays(DAY, 'sun');
    expect(strip[0]).toMatchObject({ day: '2026-10-18', wd: 'S' });
    expect(strip[7]).toMatchObject({ day: '2026-10-25', wd: 'S' });
    expect(weekOf(DAY, 'sun')).toBe('Oct 25 to 31');
  });

  test('the This week tile counts the week from Sunday when Sunday is chosen', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay();
    try {
      const repo = memoryRepository();
      jest.mocked(useAuth).mockReturnValue({ repository: repo } as unknown as ReturnType<typeof useAuth>);
      repo.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'units.week', 'sun'));
      saveFood(repo, '2026-10-25', LUNCH, quickFood('Synthetic quick lunch', 600, null, null, null));
      const Week = FOOD_TILES.week;
      const p = { page: 'food', id: 'week', size: 'L', style: 'A', options: {}, editing: false, preview: true, frame: { w: 340, h: 340 }, body: { w: 320, h: 300 } } as unknown as TileRenderProps;
      function Host() { return <Week p={p} repo={repo} d={useDayData(repo)} />; }
      await render(<Host />, { wrapper });
      const labels = screen.getAllByLabelText(/^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day, /).map(n => n.props.accessibilityLabel as string);
      expect(labels[0]).toMatch(/^Sunday, 600 kcal/);
      expect(labels[1]).toMatch(/^Monday, nothing logged/);
    } finally { jest.useRealTimers(); }
  });
});

describe('Progress body tiles with too few readings to compare', () => {
  const NOW = new Date(2026, 10, 13, 12), TODAY = '2026-11-13';
  afterEach(() => resetProgressStore());
  async function draw(id: string, d: ReturnType<typeof emptyProgress>) {
    publishProgress(d);
    const def = tilePage('progress').tiles.find(x => x.id === id)!;
    const fn = typeof def.render === 'function' ? def.render : (def.render as Record<string, typeof def.render>).L;
    const colors = createTheme('light'), box = { w: 320, h: 300 };
    await render(<ThemeProvider>{(fn as (p: never) => React.ReactNode)({ page: 'progress', id, size: 'L', style: 'A', options: { range: 'week' }, frame: box, body: box,
      colors, tint: colors.accent, mode: 'light', reduceMotion: true, editing: false, preview: false } as never)}</ThemeProvider>);
    return screen.getAllByRole('image')[0].props.accessibilityLabel as string;
  }
  test('a week with no weigh-in shows no change, not 0', async () => {
    const d = emptyProgress(TODAY, 'kg', NOW.getTime());
    d.days.weight = Array(HISTORY).fill(null); d.days.weight[HISTORY - 9] = 80;
    d.weight = { ...d.weight, kg: 80, day: '2026-11-05' };
    const label = await draw('weight', d);
    expect(label).toContain('Not enough weigh-ins this week to compare');
    expect(label).not.toMatch(/0\.0 kg this week/);
  });
  test('one body fat reading is the first reading, not a change of 0', async () => {
    const d = emptyProgress(TODAY, 'kg', NOW.getTime());
    d.bodyFat = [{ day: TODAY, pct: 18.2 }];
    const label = await draw('bodyfat', d);
    expect(label).toContain('the first reading');
    expect(label).not.toMatch(/0\.0 since/);
  });
});
