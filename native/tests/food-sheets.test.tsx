import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { scannedFood } from '../src/features/food/barcode-sheet';
import { addToCart, cartItem, cartTotals, closeCart, currentCart, inCart, openCart, removeCartAt, removeFromCart, setCartMeal } from '../src/features/food/cart';
import { CopySheet, copyPicks } from '../src/features/food/copy-sheet';
import { multipleFor, servingsOf } from '../src/features/food/item-sheet';
import { saveCombo, saveFood, type Combo } from '../src/features/food/model';
import { onTarget, waffleCells } from '../src/features/food/nutrition-screen';
import { macroKcal, parseAmount, QuickSheet, quickFood } from '../src/features/food/quick-sheet';
import { matchSaved } from '../src/features/food/saved-sheet';
import { drinksOn, readWater } from '../src/features/food/water';
import { WaterSheet } from '../src/features/food/water-sheet';
import { memoryRepository } from './workout-repository';

jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));
const mockToast = jest.fn();
jest.mock('../src/features/shell/toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
/** Made-up sample foods only. */
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null };
const rice = { name: 'Synthetic rice', energy_kj: 200 * 4.184, protein_g: 4, carbs_g: 44, fat_g: 1, amount_g: 150, ...blank };
const mystery = { name: 'Synthetic mystery', energy_kj: null, protein_g: null, carbs_g: null, fat_g: null, amount_g: null, ...blank };
const LUNCH = 'fd000000-0000-4000-8000-000000000001';
const DAY = '2026-10-28';

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); mockToast.mockReset(); closeCart(); });
afterEach(() => jest.useRealTimers());

describe('the Log food tray', () => {
  test('holds foods only while the sheet is open, with totals and removal by food or by line', () => {
    addToCart([cartItem('rice', rice)]);
    expect(currentCart()).toBeNull();
    openCart(LUNCH);
    addToCart([cartItem('rice', rice, 2), cartItem('mystery', mystery)]);
    addToCart([cartItem('rice', rice)]);
    const items = currentCart()!.items;
    expect(items.map(i => i.servings)).toEqual([2, 1, 1]);
    expect(items[1]).toMatchObject({ kcal: null, p: null });
    expect(cartTotals(items)).toEqual({ kcal: 600, p: 12 });
    expect(inCart('mystery')).toBe(true);
    removeCartAt(1);
    expect(inCart('mystery')).toBe(false);
    setCartMeal('fd000000-0000-4000-8000-000000000002');
    expect(currentCart()!.meal).toBe('fd000000-0000-4000-8000-000000000002');
    removeFromCart('rice');
    expect(currentCart()!.items).toEqual([]);
    closeCart();
    expect(currentCart()).toBeNull();
  });
});

describe('quick add', () => {
  test('reads typed amounts, keeps blanks unknown and stores whole calories', () => {
    expect(parseAmount('1,250')).toBe(1250);
    expect(parseAmount(' 12.5 ')).toBe(12.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-3')).toBeNull();
    expect(macroKcal(10, null, 5)).toBe(85);
    const f = quickFood('  ', 249.6, 10, null, null);
    expect(f).toMatchObject({ name: 'Quick add', energy_kj: 250 * 4.184, protein_g: 10, carbs_g: null, fat_g: null });
  });

  test('offers the macros total, then logs into the meal', async () => {
    const repo = memoryRepository();
    await render(<QuickSheet repo={repo} meal={LUNCH} />, { wrapper });
    await fireEvent.changeText(screen.getByTestId('food-quick-kcal'), '');
    await fireEvent.changeText(screen.getByLabelText('Protein in grams'), '20');
    await fireEvent.changeText(screen.getByLabelText('Carbs in grams'), '30');
    await fireEvent.press(screen.getByLabelText('Use 200 kcal'));
    await fireEvent.press(screen.getAllByRole('button', { name: /^Add/ }).at(-1)!);
    const rows = repo.list('food_entries');
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({ meal_id: LUNCH, protein_g: 20, carbs_g: 30, fat_g: null });
    expect(Math.round(rows[0].data.energy_kj as number / 4.184)).toBe(200);
  });

  test('goes into the tray instead when the Log food sheet is open', async () => {
    const repo = memoryRepository();
    openCart(LUNCH);
    await render(<QuickSheet repo={repo} />, { wrapper });
    await fireEvent.changeText(screen.getByTestId('food-quick-kcal'), '150');
    await fireEvent.press(screen.getAllByRole('button', { name: /^Add/ }).at(-1)!);
    expect(repo.list('food_entries')).toHaveLength(0);
    expect(currentCart()!.items.map(i => Math.round(i.kcal!))).toEqual([150]);
  });
});

describe('food details', () => {
  test('offers the food\'s own serving beside 100 g, and works out the multiple', () => {
    expect(servingsOf(rice).map(s => s.label)).toEqual(['1 serving (150 g)', '100 g']);
    expect(servingsOf(mystery).map(s => s.grams)).toEqual([null]);
    expect(servingsOf({ ...rice, amount_g: 100 }).map(s => s.label)).toEqual(['100 g']);
    expect(multipleFor(rice, 100, 3)).toBe(2);
    expect(multipleFor(rice, null, 1.5)).toBe(1.5);
    expect(multipleFor(mystery, 100, 2)).toBe(2);
  });
});

describe('copy, saved meals and barcode', () => {
  test('ticks the meals from yesterday not yet logged today', () => {
    expect(copyPicks([{ id: 'a', empty: false }, { id: 'b', empty: false }, { id: 'c', empty: true }], [{ id: 'a', empty: true }, { id: 'b', empty: false }]))
      .toEqual({ a: true, b: false });
  });

  test('finds saved meals by their name or by a food in them', () => {
    const repo = memoryRepository();
    saveFood(repo, DAY, LUNCH, rice);
    saveCombo(repo, DAY, LUNCH, 'Synthetic bowl');
    const list: Combo[] = [...JSON.parse(JSON.stringify(repo.localGet<Combo[]>('foodCombos'))), { name: 'Synthetic wrap', foods: [] }];
    expect(matchSaved(list, '').map(c => c.name)).toEqual(['Synthetic bowl', 'Synthetic wrap']);
    expect(matchSaved(list, ' RICE ').map(c => c.name)).toEqual(['Synthetic bowl']);
    expect(matchSaved(list, 'wrap').map(c => c.name)).toEqual(['Synthetic wrap']);
  });

  test('a scan adds one label serving, or 100 g, and keeps the barcode', () => {
    const per100 = { name: 'Synthetic cereal', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 1, amount_g: 100, ...blank };
    expect(scannedFood({ food: per100, servingGrams: 40 }, '0000000000017')).toMatchObject({ amount_g: 40, energy_kj: 167.36, protein_g: 2, barcode: '0000000000017' });
    expect(scannedFood({ food: per100, servingGrams: null }, '0000000000017')).toMatchObject({ amount_g: 100, energy_kj: 418.4 });
  });
});

describe('nutrition', () => {
  test('splits fifty squares by where the calories came from', () => {
    const cells = waffleCells(25, 50, 200 / 9);
    expect(cells.filter(c => c === 'p')).toHaveLength(10);
    expect(cells.filter(c => c === 'c')).toHaveLength(20);
    expect(cells.filter(c => c === 'f')).toHaveLength(20);
    expect(waffleCells(0, 0, 0).every(c => c === null)).toBe(true);
  });

  test('counts days within 10% of the goal, leaving out days with nothing logged', () => {
    expect(onTarget([2000, 1800, 1799, 2200, 2201, null], 2000)).toBe(3);
  });
});

describe('sheets', () => {
  test('copy yesterday leaves a meal logged today unticked, copies the rest and undoes it', async () => {
    const repo = memoryRepository(), BREAKFAST = 'fd000000-0000-4000-8000-000000000000';
    saveFood(repo, '2026-10-27', BREAKFAST, rice);
    saveFood(repo, '2026-10-27', LUNCH, rice, 2);
    saveFood(repo, DAY, LUNCH, mystery);
    await render(<CopySheet repo={repo} />, { wrapper });
    expect(screen.getByRole('checkbox', { name: /^Breakfast/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Lunch.*Logged today$/ })).not.toBeChecked();
    await fireEvent.press(screen.getByTestId('food-copy-go'));
    const today = () => repo.list('food_entries').filter(r => r.data.day === DAY);
    expect(today().map(r => r.data.meal_id).sort()).toEqual([BREAKFAST, LUNCH]);
    expect(mockToast).toHaveBeenLastCalledWith('Copied breakfast from yesterday', expect.anything());
    await act(async () => mockToast.mock.calls.at(-1)[1].action.onAction());
    expect(today()).toHaveLength(1);
  });

  test('water logs a container with one tap and takes a drink off again', async () => {
    const repo = memoryRepository(), cup = readWater(repo).containers.find(c => c.quick)!;
    await render(<WaterSheet repo={repo} />, { wrapper });
    await fireEvent.press(screen.getAllByRole('button', { name: new RegExp(`^Add ${cup.name}`) })[0]);
    expect(drinksOn(readWater(repo), DAY).map(d => d.oz)).toEqual([cup.oz]);
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^Remove ${cup.name}`) }));
    expect(drinksOn(readWater(repo), DAY)).toEqual([]);
  });
});
