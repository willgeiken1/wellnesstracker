import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { CalorieRing } from '../src/features/food/ring';
import { attributedDay, meals, saveFood } from '../src/features/food/model';
import { FoodScreen } from '../src/features/food/screen';
import { memoryRepository } from './workout-repository';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
/** Made-up sample food only. */
const oats = { name: 'Synthetic oats', energy_kj: 300 * 4.184, protein_g: 10, carbs_g: 54, fat_g: 5, ...blank };

test('the ring shows what is left, then what is over, and plain kcal without a target', async () => {
  const target = { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 220, fat_g: 60 };
  const total = { ...oats, energy_kj: 500 * 4.184 };
  const view = await render(<CalorieRing total={total} target={target} />, { wrapper });
  expect(screen.getByText('1,500')).toBeTruthy();
  expect(screen.getByText('kcal left')).toBeTruthy();
  expect(screen.getByText('/150')).toBeTruthy();
  await view.rerender(<CalorieRing total={{ ...total, energy_kj: 2300 * 4.184 }} target={target} />);
  expect(screen.getByText('300')).toBeTruthy();
  expect(screen.getByText('kcal over')).toBeTruthy();
  await view.rerender(<CalorieRing total={total} target={null} />);
  expect(screen.getByText('500')).toBeTruthy();
  expect(screen.getByText('kcal')).toBeTruthy();
});

test('an empty day says so and offers the five ways to log', async () => {
  await render(<FoodScreen repository={memoryRepository()} />, { wrapper });
  expect(screen.getByText('Today')).toBeTruthy();
  expect(within(screen.getByTestId('food-empty')).getByText('Nothing logged for this day')).toBeTruthy();
  const row = screen.getByTestId('food-log-row');
  for (const name of ['Snap', 'Describe', 'Scan', 'Manual', 'Saved']) expect(within(row).getByRole('button', { name })).toBeTruthy();
});

test('a logged food shows as one row with macros and calories, and its actions open on tap', async () => {
  const repo = memoryRepository(), meal = meals(repo)[0];
  saveFood(repo, attributedDay(), meal.id, oats);
  await render(<FoodScreen repository={repo} />, { wrapper });
  expect(screen.queryByTestId('food-empty')).toBeNull();
  const card = screen.getByTestId(`food-meal-${meal.name}`);
  expect(within(card).getByText('P 10 · C 54 · F 5')).toBeTruthy();
  expect(within(card).getAllByText('300 kcal').length).toBe(2);
  expect(screen.queryByRole('button', { name: 'Edit Synthetic oats' })).toBeNull();
  await fireEvent.press(within(card).getByRole('button', { name: 'Synthetic oats, 300 kcal' }));
  for (const name of ['Edit Synthetic oats', 'Delete Synthetic oats', 'Favorite Synthetic oats', 'Save Synthetic oats for later']) expect(screen.getByRole('button', { name })).toBeTruthy();
  await fireEvent.press(within(card).getByRole('button', { name: 'Synthetic oats, 300 kcal' }));
  expect(screen.queryByRole('button', { name: 'Edit Synthetic oats' })).toBeNull();
});

test('meal actions open from the meal options button', async () => {
  const repo = memoryRepository(), meal = meals(repo)[0];
  await render(<FoodScreen repository={repo} />, { wrapper });
  expect(screen.queryByRole('button', { name: `Rename ${meal.name}` })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: `${meal.name} options` }));
  expect(screen.getByRole('button', { name: `Rename ${meal.name}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `Copy yesterday to ${meal.name}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `Save ${meal.name} as combo` })).toBeDisabled();
});
