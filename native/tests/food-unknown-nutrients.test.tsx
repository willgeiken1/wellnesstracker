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
    expect(Math.round(v.eaten!)).toBe(600);
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

describe('energy no logged food gives', () => {
  const bar = { ...toast, name: 'Synthetic scanned bar', energy_kj: null };
  function noEnergy() {
    const repo = memoryRepository();
    saveFood(repo, DAY, LUNCH, bar);
    return repo;
  }
  test('stays unknown in the day, the meal and the week, not 0 eaten with the whole goal left', () => {
    const repo = noEnergy();
    const v = dayView(repo, DAY, { today: DAY });
    expect(v).toMatchObject({ eaten: null, left: null, p: 8 });
    expect(v.meals.find(m => m.id === LUNCH)).toMatchObject({ kcal: null, empty: false });
    expect(v.meals.find(m => m.empty)!.kcal).toBe(0);
    expect(daySums(repo, [DAY])[0]).toMatchObject({ kcal: null, meals: 1 });
    // One food with its energy makes the total known again.
    saveFood(repo, DAY, LUNCH, toast);
    expect(Math.round(dayView(repo, DAY, { today: DAY }).eaten!)).toBe(200);
  });
  test('reads as a dash on the Nutrition screen and the Calories tile', async () => {
    const repo = noEnergy();
    const first = await render(<NutritionScreen repo={repo} />, { wrapper });
    expect(screen.getByLabelText('– of 2,000 kcal')).toBeTruthy();
    expect(screen.queryByLabelText('0 of 2,000 kcal')).toBeNull();
    first.unmount();
    const Calories = FOOD_TILES.cal;
    const p = { page: 'food', id: 'cal', size: 'M', style: 'A', options: { lead: 'left' }, editing: false, preview: true,
      frame: { w: 340, h: 170 }, body: { w: 320, h: 120 } } as unknown as TileRenderProps;
    function Host() { return <Calories p={p} repo={repo} d={useDayData(repo)} />; }
    await render(<Host />, { wrapper });
    expect(screen.getByLabelText('– of 2,000 kcal eaten, – left')).toBeTruthy();
    expect(screen.queryByLabelText(/^0 of 2,000 kcal eaten/)).toBeNull();
  });
});
