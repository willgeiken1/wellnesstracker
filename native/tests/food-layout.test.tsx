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

test('a day with food but no calories entered shows a dash, not the whole target as left', async () => {
  const target = { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 220, fat_g: 60 };
  const unknown = { ...oats, energy_kj: null };
  const view = await render(<CalorieRing total={unknown} target={target} logged />, { wrapper });
  expect(screen.getByText('kcal not entered')).toBeTruthy();
  expect(screen.queryByText('2,000')).toBeNull();
  expect(screen.queryByText('kcal left')).toBeNull();
  // Nothing logged at all is different: the whole target really is left.
  await view.rerender(<CalorieRing total={{ ...unknown, protein_g: null, carbs_g: null, fat_g: null }} target={target} />);
  expect(screen.getByText('2,000')).toBeTruthy();
  expect(screen.getByText('kcal left')).toBeTruthy();
});

test('a meal whose items have no calories shows a dash, and known items still add up', async () => {
  const repo = memoryRepository(), [first, second] = meals(repo), day = attributedDay();
  saveFood(repo, day, first.id, { ...oats, name: 'Synthetic mystery snack', energy_kj: null });
  saveFood(repo, day, second.id, { ...oats, name: 'Synthetic mystery drink', energy_kj: null });
  saveFood(repo, day, second.id, oats);
  await render(<FoodScreen repository={repo} />, { wrapper });
  expect(within(screen.getByTestId(`food-meal-${first.name}`)).getAllByText('— kcal')).toHaveLength(2); // the item row and the meal total
  expect(within(screen.getByTestId(`food-meal-${first.name}`)).queryByText('0 kcal')).toBeNull();
  expect(within(screen.getByTestId(`food-meal-${second.name}`)).getAllByText('300 kcal').length).toBeGreaterThan(0);
});

test('the day button tells a screen reader which day is showing', async () => {
  await render(<FoodScreen repository={memoryRepository()} />, { wrapper });
  expect(screen.getByRole('button', { name: 'Open food calendar' }).props.accessibilityValue).toEqual({ text: `Food for ${attributedDay()}` });
});
