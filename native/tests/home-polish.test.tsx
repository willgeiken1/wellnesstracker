import { act, render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { memoryRepository } from './workout-repository';
import { saveFood, attributedDay, meals } from '../src/features/food/model';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import { Spark } from '../src/features/home/screen';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const oats = { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
function open(demo = false) {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo } as ReturnType<typeof useAuth>);
  return repo;
}
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('the Example data chip is a real chip in every theme: the header surface with a hairline edge', async () => {
  open(true);
  await render(<Home />, { wrapper });
  const chip = screen.getByTestId('home-example-chip'), colors = createTheme('light');
  expect(within(chip).getByText('Example data')).toBeTruthy();
  // The old chip used the panel tone, which is almost the page colour in light themes, so it read as plain text there.
  expect(flat(chip.props.style)).toMatchObject({ backgroundColor: colors.surface, borderColor: colors['hair-2'], borderWidth: 1 });
});

test('no chip outside the example account', async () => {
  open(false);
  await render(<Home />, { wrapper });
  expect(screen.queryByTestId('home-example-chip')).toBeNull();
});

test('a line sparkline draws today dashed to a hollow dot, so a half-logged day never reads as a drop', async () => {
  const view = await render(<Spark values={[1800, 2100, 1950, 2200, 2050, 1900, 600]} color="#F2A65A" partial />);
  const today = screen.getByTestId('spark-today');
  expect(today.props.strokeDasharray).toBeTruthy();
  // The solid line stops at yesterday, the second-last of seven points (x = 5/6 of 140).
  const solid = String(screen.getByTestId('spark-line').props.d);
  expect(solid).toContain('L116.7');
  expect(solid).not.toContain('L140.0');
  await view.rerender(<Spark values={[1800, 2100, 1950, 2200, 2050, 1900, 600]} color="#F2A65A" />);
  expect(screen.queryByTestId('spark-today')).toBeNull();
  expect(String(screen.getByTestId('spark-line').props.d)).toContain('L140.0');
});

test('a bar sparkline draws today hollow and dashed, and keeps a sliver when nothing is in yet', async () => {
  await render(<Spark values={[8000, 9500, 7000, 12000, 6000, 10000, 0]} color="#93E07A" bars partial />);
  const today = screen.getByTestId('spark-today');
  expect(today.props.strokeDasharray).toBeTruthy();
  expect(Number(today.props.height)).toBeGreaterThan(0);
});

test('finished days in a bar sparkline are solid, so a sparse week such as two nights of sleep still reads', async () => {
  await render(<Spark values={[0, 0, 0, 0, 0, 7.2, 6.8]} color="#E9B2EC" bars />);
  const bars = screen.getAllByTestId('spark-bar');
  expect(bars).toHaveLength(7);
  for (const bar of bars) expect(bar.props.opacity ?? 1).toBe(1);
});

test('the calorie and protein tiles mark today as open', async () => {
  const repo = open();
  const view = await render(<Home />, { wrapper });
  await act(async () => { const day = attributedDay(); saveFood(repo, day, meals(repo)[0].id, oats, 1, undefined, day); });
  await view.rerender(<Home />);
  for (const id of ['calories', 'protein']) expect(within(screen.getByTestId(`home-tile-${id}`)).getByTestId('spark-today')).toBeTruthy();
});
