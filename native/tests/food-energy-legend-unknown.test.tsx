import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { EnergyLegend } from '../src/features/food/item-sheet';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

// Made-up macros only.
describe('the calories split with unknown macros', () => {
  test('a calorie-only food speaks no 0% shares', async () => {
    await render(<ThemeProvider><EnergyLegend p={null} c={null} f={null} /></ThemeProvider>);
    const label = screen.getByLabelText(/share of calories unknown/).props.accessibilityLabel as string;
    expect(label).not.toMatch(/%/);
    expect(label).toBe('Protein unknown, Carbs unknown, Fat unknown, share of calories unknown');
  });
  test('with one macro known, its grams show but no share is worked out', async () => {
    await render(<ThemeProvider><EnergyLegend p={20} c={null} f={null} /></ThemeProvider>);
    expect(screen.getByLabelText(/share of calories unknown/).props.accessibilityLabel).toBe('Protein 20 g, Carbs unknown, Fat unknown, share of calories unknown');
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.getByText('20 g')).toBeTruthy();
  });
  test('with all three known, the shares are spoken and shown as before', async () => {
    await render(<ThemeProvider><EnergyLegend p={25} c={50} f={0} /></ThemeProvider>);
    expect(screen.getByLabelText('Calories from protein 33%, carbs 67%, fat 0%')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
  });
});
