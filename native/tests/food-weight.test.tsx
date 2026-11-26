import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { ItemSheet, multipleFor, servingTextOf, servingsOf } from '../src/features/food/item-sheet';
import { MealScreen } from '../src/features/food/meal-screen';
import { saveFood } from '../src/features/food/model';
import { foodRoutes } from '../src/features/food/nav';
import { resetFoodDay } from '../src/features/food/selection';
import { foodAmount, foodSub } from '../src/features/food/sheet';
import { OZ_G, foodWeightUnit, gramsOfOz, ozNum, ozOf, weightText } from '../src/features/food/weight';
import { SETTINGS_PREFS_KEY, withPref, DEFAULT_PREFS } from '../src/features/settings/prefs';
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
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null };
const chicken = { name: 'Synthetic chicken', energy_kj: 280 * 4.184, protein_g: 52, carbs_g: 0, fat_g: 6, amount_g: 170, ...blank };
const LUNCH = 'fd000000-0000-4000-8000-000000000001';
const DAY = '2026-10-28';
const metric = (repo: ReturnType<typeof memoryRepository>) => repo.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'units.weight', 'kg'));

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay(); });
afterEach(() => jest.useRealTimers());

describe('food weights in ounces', () => {
  test('converts with the exact ounce and rounds to one place like the water sizes', () => {
    expect(OZ_G).toBe(28.349523125);
    expect(gramsOfOz(4)).toBeCloseTo(113.398, 3);
    expect(ozOf(170)).toBe(6);
    expect(ozOf(113)).toBe(4);
    expect(ozOf(150)).toBe(5.3);
    expect(ozNum(170)).toBe('6');
    expect(ozNum(150)).toBe('5.3');
    expect(ozNum(28.349523125 * 16.94)).toBe('16.9');
    expect(weightText(170, 'oz')).toBe('6 oz');
    expect(weightText(170, 'g')).toBe('170 g');
    expect(weightText(1500, 'g')).toBe('1,500 g');
  });

  test('follows the Units setting: lb reads ounces, kg keeps grams', () => {
    const repo = memoryRepository();
    expect(foodWeightUnit(repo)).toBe('oz');
    metric(repo);
    expect(foodWeightUnit(repo)).toBe('g');
    repo.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'units.weight', 'lb'));
    expect(foodWeightUnit(repo)).toBe('oz');
  });

  test('offers ounce servings beside 100 g, and scales by weight', () => {
    const oz = servingsOf(chicken, 'oz');
    expect(oz.map(s => s.label)).toEqual(['6 oz (170 g)', '4 oz (113 g)', '100 g']);
    expect(oz[0].grams).toBe(170);
    expect(multipleFor(chicken, oz[1].grams, 1)).toBeCloseTo(gramsOfOz(4) / 170, 6);
    expect(servingsOf({ ...chicken, amount_g: 113 }, 'oz').map(s => s.label)).toEqual(['4 oz (113 g)', '100 g']);
    expect(servingsOf({ ...chicken, amount_g: 32 }, 'oz').map(s => s.label)).toEqual(['1.1 oz (32 g)', '100 g']);
    expect(servingsOf({ ...chicken, amount_g: 100 }, 'oz').map(s => s.label)).toEqual(['100 g', '4 oz (113 g)']);
    expect(servingsOf({ ...chicken, amount_g: null }, 'oz').map(s => s.label)).toEqual(['1 serving']);
    expect(servingsOf(chicken, 'g').map(s => s.label)).toEqual(['1 serving (170 g)', '100 g']);
  });

  test('words the serving like the label: 6 oz, 1.5 × 6 oz; grams keep their old wording', () => {
    const [own] = servingsOf(chicken, 'oz');
    expect(servingTextOf(own, 1, 'oz')).toBe('6 oz');
    expect(servingTextOf(own, 1.5, 'oz')).toBe('1.5 × 6 oz');
    expect(servingTextOf(servingsOf(chicken, 'g')[0], 2, 'g')).toBe('2 × 170 g');
    expect(servingTextOf({ q: '1 serving', grams: null }, 2, 'oz')).toBe('2 servings');
  });

  test('food rows read the serving in the person\'s unit', () => {
    expect(foodSub(chicken, false, 'oz')).toBe('6 oz · 52 g protein');
    expect(foodSub(chicken, true, 'g')).toBe('My food · 170 g · 52 g protein');
    expect(foodAmount({ ...chicken, amount_g: null }, 'oz')).toBe('');
  });
});

describe('the Food screens', () => {
  test('a meal lists its foods in ounces, and in grams once the units are metric', async () => {
    const repo = memoryRepository();
    saveFood(repo, DAY, LUNCH, chicken);
    await render(<MealScreen repo={repo} meal={LUNCH} />, { wrapper });
    expect(screen.getByText('6 oz · 52 g protein')).toBeTruthy();
    await act(async () => { metric(repo); });
    expect(screen.getByText('170 g · 52 g protein')).toBeTruthy();
  });

  test('food details offers 6 oz and 4 oz, and logs the grams of the serving picked', async () => {
    const repo = memoryRepository();
    foodRoutes.item({ food: chicken, meal: LUNCH, day: DAY });
    await render(<ItemSheet repo={repo} />, { wrapper });
    expect(screen.getAllByText('6 oz (170 g)')).toHaveLength(2); // the chip and the facts panel
    expect(screen.getByText('6 oz · 170 g')).toBeTruthy();
    await fireEvent.press(screen.getByText('4 oz (113 g)'));
    expect(screen.getByText('4 oz · 113 g')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('food-item-add'));
    const rows = repo.list('food_entries');
    expect(rows).toHaveLength(1);
    expect(rows[0].data.amount_g).toBeCloseTo(gramsOfOz(4), 6);
  });
});
