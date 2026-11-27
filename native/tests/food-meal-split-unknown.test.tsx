import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { MealScreen } from '../src/features/food/meal-screen';
import { saveFood } from '../src/features/food/model';
import { resetFoodDay } from '../src/features/food/selection';
import { memoryRepository } from './workout-repository';

jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {}, setOptions: () => {} }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/shell/toast', () => ({ showToast: () => {} }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
/** Made-up sample foods only. */
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const LUNCH = 'fd000000-0000-4000-8000-000000000001';
const DAY = '2026-10-28';
/** The coloured parts drawn in the meal's split bar. */
const segments = () => (screen.getByTestId('food-meal-split').children[0] as { children: unknown[] }).children.length;

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay(); });
afterEach(() => jest.useRealTimers());

test('a meal with a food whose carbs and fat are not listed shows its split as unknown, not all protein', async () => {
  const repo = memoryRepository();
  saveFood(repo, DAY, LUNCH, { ...blank, name: 'Synthetic shake', energy_kj: 200 * 4.184, protein_g: 30, carbs_g: null, fat_g: null });
  await render(<MealScreen repo={repo} meal={LUNCH} />, { wrapper });
  expect(screen.getByTestId('food-meal-split').props.accessibilityLabel).toBe('Some of this food has no protein, carbs or fat listed, so the split is unknown.');
  expect(segments()).toBe(0);
});

test('a meal with all three macros listed shows its split', async () => {
  const repo = memoryRepository();
  saveFood(repo, DAY, LUNCH, { ...blank, name: 'Synthetic bowl', energy_kj: 400 * 4.184, protein_g: 25, carbs_g: 50, fat_g: 11 });
  await render(<MealScreen repo={repo} meal={LUNCH} />, { wrapper });
  expect(screen.getByTestId('food-meal-split').props.accessibilityLabel).toBe('Calories from protein 25%, carbs 50%, fat 25%');
  expect(segments()).toBe(3);
});
