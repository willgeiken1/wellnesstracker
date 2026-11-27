import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { comboKcal, comboProtein } from '../src/features/food/actions';
import { saveFood, type Combo } from '../src/features/food/model';
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
const base = { carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const scanned: Combo = { name: 'Synthetic scanned snack', foods: [{ ...base, name: 'Synthetic bar', energy_kj: null, protein_g: null }] };
const toastMeal: Combo = { name: 'Synthetic toast plate', foods: [{ ...base, name: 'Synthetic toast', energy_kj: 200 * 4.184, protein_g: 8 }, { ...base, name: 'Synthetic jam', energy_kj: null, protein_g: null }] };

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay(); });
afterEach(() => jest.useRealTimers());

test('a saved meal whose foods give no energy or protein totals unknown, not 0; known foods still count', () => {
  expect(comboKcal(scanned)).toBeNull();
  expect(comboProtein(scanned)).toBeNull();
  expect(Math.round(comboKcal(toastMeal)!)).toBe(200);
  expect(comboProtein(toastMeal)).toBe(8);
});

test('What fits leaves out a saved meal with unknown energy rather than offer it as free', async () => {
  const repo: Repository = memoryRepository();
  saveFood(repo, DAY, LUNCH, { ...base, name: 'Synthetic lunch', energy_kj: 1000 * 4.184, protein_g: 30 });
  repo.localSave('foodCombos', [scanned, toastMeal]);
  const Fits = FOOD_TILES.fits;
  const p = { page: 'food', id: 'fits', size: 'M', style: 'A', options: { by: 'kcal' }, editing: false, preview: true,
    frame: { w: 340, h: 170 }, body: { w: 320, h: 120 } } as unknown as TileRenderProps;
  function Host() { return <Fits p={p} repo={repo} d={useDayData(repo)} />; }
  await render(<Host />, { wrapper });
  expect(screen.getByText('Synthetic toast plate')).toBeTruthy();
  expect(screen.queryByText('Synthetic scanned snack')).toBeNull();
});
