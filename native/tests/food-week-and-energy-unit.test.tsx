import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { saveFood } from '../src/features/food/model';
import { NutritionScreen } from '../src/features/food/nutrition-screen';
import { QuickSheet, quickFood } from '../src/features/food/quick-sheet';
import { resetFoodDay } from '../src/features/food/selection';
import { enAmt, enText, toKcal } from '../src/features/food/energy';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, memoryStore, withPref } from '../src/features/settings/prefs';
import { memoryRepository } from './workout-repository';

jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
/** Made-up sample foods only. Wednesday 28 October: Monday and Tuesday are the week's full days. */
const LUNCH = 'fd000000-0000-4000-8000-000000000001';
const MON = '2026-10-26', TODAY = '2026-10-28';
const meal = { name: 'Synthetic bowl', energy_kj: 2000 * 4.184, protein_g: 120, carbs_g: 200, fat_g: 60, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const kJ = () => memoryStore.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'units.energy', 'kJ'));

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); resetFoodDay(); memoryStore.localSave(SETTINGS_PREFS_KEY, DEFAULT_PREFS); });
afterEach(() => jest.useRealTimers());

async function week(repo: ReturnType<typeof memoryRepository>) {
  await render(<NutritionScreen repo={repo} />, { wrapper });
  await act(async () => { fireEvent.press(screen.getByText('This week')); });
}

describe('the weekly nutrition view', () => {
  test('leaves an unlogged day out of the average and the days on target, and does not show it as 0 kcal', async () => {
    const repo = memoryRepository();
    saveFood(repo, MON, LUNCH, meal);
    await week(repo);
    // Monday 2,000 and Tuesday unlogged: the average is 2,000, not 1,000, out of 1 day, not 2.
    expect(screen.getByLabelText(/^2,000 kcal, Daily average/)).toBeTruthy();
    expect(screen.queryByLabelText(/^1,000 kcal, Daily average/)).toBeNull();
    expect(screen.getByText(/^\d of 1$/)).toBeTruthy();
    expect(screen.getAllByText('Not logged').length).toBeGreaterThan(0);
    expect(screen.queryByText('0 kcal')).toBeNull();
    expect(screen.getAllByLabelText('Tuesday, unknown').length).toBe(2);
  });

  test('keeps protein unknown for a day whose food gave none', async () => {
    const repo = memoryRepository();
    saveFood(repo, MON, LUNCH, quickFood('Synthetic quick lunch', 600, null, null, null));
    await week(repo);
    expect(screen.queryByText(/^0 g protein/)).toBeNull();
    expect(screen.getAllByText(/^– g protein/).length).toBeGreaterThan(0);
  });
});

describe('the energy unit from Settings', () => {
  test('helpers show kJ the way Home rounds it and type back to kcal', () => {
    expect(enAmt(600, 'kcal')).toBe('600 kcal');
    expect(enAmt(600, 'kJ')).toBe('2,510 kJ');
    expect(enText('{v} kcal left', 'kJ')).toBe('{v} kJ left');
    expect(toKcal(4184, 'kJ')).toBeCloseTo(1000);
  });

  test('shows Food in kJ once kJ is chosen', async () => {
    kJ();
    const repo = memoryRepository();
    saveFood(repo, TODAY, LUNCH, meal);
    await render(<NutritionScreen repo={repo} />, { wrapper });
    expect(screen.getByLabelText('8,370 of 8,370 kJ')).toBeTruthy();
    expect(screen.getByLabelText('Food targets, 8,370 kJ · 100 g protein')).toBeTruthy();
    expect(screen.queryByText(/kcal/)).toBeNull();
  });

  test('Quick add takes the typed amount in kJ and stores the same energy', async () => {
    kJ();
    const repo = memoryRepository();
    await render(<QuickSheet repo={repo} meal={LUNCH} />, { wrapper });
    expect(screen.getByLabelText('Calories in kJ')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('food-quick-kcal'), '1000');
    await fireEvent.press(screen.getByTestId('food-quick-add'));
    const rows = repo.list('food_entries');
    expect(rows).toHaveLength(1);
    expect(Math.abs(Number(rows[0].data.energy_kj) - 1000)).toBeLessThan(5);
  });
});
