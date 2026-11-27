import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { saveFood } from '../src/features/food/model';
import { quickFood } from '../src/features/food/quick-sheet';
import { resetFoodDay } from '../src/features/food/selection';
import { useDayData } from '../src/features/food/tiles/kit';
import { FOOD_TILES } from '../src/features/food/tiles/tiles';
import type { Repository } from '../src/data/repository';
import type { TileRenderProps } from '../src/features/tiles/types';
import { memoryRepository } from './workout-repository';

jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
/** Made-up sample foods only. Wednesday, with Monday and Tuesday logged as calorie-only Quick adds. */
const LUNCH = 'fd000000-0000-4000-8000-000000000001';
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay(); });
afterEach(() => jest.useRealTimers());

function quickOnly() {
  const repo = memoryRepository();
  for (const day of ['2026-10-26', '2026-10-27']) saveFood(repo, day, LUNCH, quickFood('Synthetic quick lunch', 600, null, null, null));
  return repo;
}
async function week(size: 'M' | 'L', options: Record<string, string>, repo: Repository) {
  const Week = FOOD_TILES.week;
  const p = { page: 'food', id: 'week', size, style: 'A', options, editing: false, preview: true,
    frame: { w: 340, h: size === 'L' ? 340 : 170 }, body: { w: 320, h: size === 'L' ? 300 : 130 } } as unknown as TileRenderProps;
  function Host() { return <Week p={p} repo={repo} d={useDayData(repo)} />; }
  return render(<Host />, { wrapper });
}

describe('the This week tile with no known protein', () => {
  test('shows the daily average as unknown, not 0 g', async () => {
    await week('M', { measure: 'p' }, quickOnly());
    expect(screen.getByText(/^–/)).toBeTruthy();
    expect(screen.queryByText(/^0$/)).toBeNull();
  });
  test('makes no comparison with the week before when either week is unknown', async () => {
    await week('L', { measure: 'p', compare: 'last' }, quickOnly());
    expect(screen.getByText('Not enough logged to compare weeks')).toBeTruthy();
    expect(screen.queryByText(/a day than last week/)).toBeNull();
  });
  test('still averages and compares calories, which every Quick add gives', async () => {
    const repo = quickOnly();
    saveFood(repo, '2026-10-20', LUNCH, quickFood('Synthetic quick lunch', 400, null, null, null));
    await week('L', { compare: 'last' }, repo);
    expect(screen.getByText(/more a day than last week/)).toBeTruthy();
  });
});

describe('the Eating window tile with nothing logged earlier in the week', () => {
  test('shows the week average as unknown, not 0 hours', async () => {
    const repo = memoryRepository();
    saveFood(repo, '2026-10-28', LUNCH, quickFood('Synthetic quick lunch', 600, null, null, null));
    const Timing = FOOD_TILES.window;
    const p = { page: 'food', id: 'window', size: 'L', style: 'A', options: {}, editing: false, preview: true,
      frame: { w: 340, h: 340 }, body: { w: 320, h: 300 } } as unknown as TileRenderProps;
    function Host() { return <Timing p={p} repo={repo} d={useDayData(repo)} />; }
    await render(<Host />, { wrapper });
    expect(screen.getByText('–')).toBeTruthy();
    expect(screen.queryByText('0h')).toBeNull();
  });
});
