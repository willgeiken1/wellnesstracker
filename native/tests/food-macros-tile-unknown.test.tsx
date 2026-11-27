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
/** Made-up sample foods only, logged today. */
const LUNCH = 'fd000000-0000-4000-8000-000000000001', DAY = '2026-10-28';
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay(); });
afterEach(() => jest.useRealTimers());

function logged(p: number | null, c: number | null, f: number | null) {
  const repo = memoryRepository();
  saveFood(repo, DAY, LUNCH, quickFood('Synthetic lunch', 600, p, c, f));
  return repo;
}
async function macros(size: 'M' | 'L', repo: Repository) {
  const Macros = FOOD_TILES.macros;
  const p = { page: 'food', id: 'macros', size, style: 'A', options: {}, editing: false, preview: true,
    frame: { w: 340, h: size === 'L' ? 340 : 170 }, body: { w: 320, h: size === 'L' ? 300 : 130 } } as unknown as TileRenderProps;
  function Host() { return <Macros p={p} repo={repo} d={useDayData(repo)} />; }
  return render(<Host />, { wrapper });
}

describe('the Macros tile with unknown macros', () => {
  test.each(['M', 'L'] as const)('a calorie-only Quick add shows and speaks no 0%% shares (%s)', async size => {
    await macros(size, logged(null, null, null));
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getByLabelText('Some of this food has no protein, carbs or fat listed, so the split is unknown.')).toBeTruthy();
    expect(screen.queryByLabelText(/Calories from protein/)).toBeNull();
  });
  test.each(['M', 'L'] as const)('with only protein known, no 100%% protein split is made up (%s)', async size => {
    await macros(size, logged(30, null, null));
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.queryByLabelText(/Calories from protein 100%/)).toBeNull();
  });
  test('the large tile names an unknown macro as unknown, not 0 grams', async () => {
    await macros('L', logged(30, null, null));
    expect(screen.getByLabelText('Carbs unknown')).toBeTruthy();
    expect(screen.queryByLabelText(/Carbs 0 of/)).toBeNull();
  });
  test.each(['M', 'L'] as const)('a full food beside a calorie-only Quick add makes no split from the full one alone (%s)', async size => {
    const repo = logged(30, 0, 0);
    saveFood(repo, DAY, LUNCH, quickFood('Synthetic quick add', 300, null, null, null));
    await macros(size, repo);
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.queryByLabelText(/Calories from protein/)).toBeNull();
    expect(screen.getByLabelText('Some of this food has no protein, carbs or fat listed, so the split is unknown.')).toBeTruthy();
  });
  test('with all three known, the shares show as before', async () => {
    await macros('L', logged(25, 50, 0));
    expect(screen.getByLabelText('Calories from protein 33%, carbs 67%, fat 0%')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
  });
});
