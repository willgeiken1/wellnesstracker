import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { daySums, dayView } from '../src/features/food/day';
import { saveFood } from '../src/features/food/model';
import { NutritionScreen } from '../src/features/food/nutrition-screen';
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
/** Made-up sample foods only. */
const LUNCH = 'fd000000-0000-4000-8000-000000000001';
const DAY = '2026-10-28';
const toast = { name: 'Synthetic toast', energy_kj: 200 * 4.184, protein_g: 8, carbs_g: 30, fat_g: 4, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay(); });
afterEach(() => jest.useRealTimers());

function quickOnly() {
  const repo = memoryRepository();
  saveFood(repo, DAY, LUNCH, quickFood('Synthetic quick lunch', 600, null, null, null));
  return repo;
}

describe('nutrients no logged food gives', () => {
  test('stay unknown in the day, the meal and the week, and count only known values once one food gives them', () => {
    const repo = quickOnly();
    const v = dayView(repo, DAY, { today: DAY });
    expect(Math.round(v.eaten)).toBe(600);
    expect(v).toMatchObject({ p: null, c: null, f: null, fib: null });
    expect(v.meals.find(m => m.id === LUNCH)).toMatchObject({ p: null, c: null, f: null, empty: false });
    expect(v.meals.find(m => m.empty)).toMatchObject({ p: 0, c: 0, f: 0 });
    expect(daySums(repo, [DAY])[0]).toMatchObject({ kcal: 600, p: null });
    saveFood(repo, DAY, LUNCH, toast);
    expect(dayView(repo, DAY, { today: DAY })).toMatchObject({ p: 8, c: 30, f: 4, fib: null });
    expect(dayView(memoryRepository(), DAY, { today: DAY })).toMatchObject({ p: 0, c: 0, f: 0, fib: 0 });
  });

  test('read as unknown on the Nutrition screen, not as 0 g', async () => {
    await render(<NutritionScreen repo={quickOnly()} />, { wrapper });
    expect(screen.getByLabelText(/^Protein, unknown/)).toBeTruthy();
    expect(screen.getByLabelText(/^Carbs, unknown/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Protein, 0 of/)).toBeNull();
  });

  test('read as unknown on the Protein tile, not as 0 g with the whole target to go', async () => {
    const Protein = FOOD_TILES.protein;
    const p = { page: 'food', id: 'protein', size: 'S', style: 'A', options: { view: 'day' }, editing: false, preview: true,
      frame: { w: 170, h: 170 }, body: { w: 150, h: 120 } } as unknown as TileRenderProps;
    function Host({ repo }: { repo: Repository }) { return <Protein p={p} repo={repo} d={useDayData(repo)} />; }
    await render(<Host repo={quickOnly()} />, { wrapper });
    expect(screen.getByText(/^–/)).toBeTruthy();
    expect(screen.getByText('Not on your foods yet')).toBeTruthy();
    expect(screen.queryByText(/to go/)).toBeNull();
  });
});
