// These tests cover the AI features, which stay in the code for a later update; the launch build hides them.
jest.mock('../src/features/ai-launch', () => ({ AI_FEATURES_ENABLED: true }));
import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { CalorieRing } from '../src/features/food/ring';

afterEach(() => jest.useRealTimers());
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
