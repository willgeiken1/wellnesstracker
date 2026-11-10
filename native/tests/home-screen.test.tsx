import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { PlanStore } from '../src/features/plans/store';
import { saveFood, attributedDay, meals } from '../src/features/food/model';
import { resetHomeWidgetStores } from '../src/features/home-widgets';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
function open(repo = memoryRepository()) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  return repo;
}
beforeEach(() => { resetHomeWidgetStores(); jest.mocked(router.push).mockClear(); });

test('Home shows the decided starting widgets in order and no placeholder copy', async () => {
  open();
  await render(<Home />, { wrapper });
  expect(screen.queryByText(/M2\/M3/)).toBeNull();
  expect(screen.queryByText('Your daily space')).toBeNull();
  const ids = screen.getAllByTestId(/^home-widget-/).map(node => node.props.testID as string);
  expect(ids).toEqual(['home-widget-bodyMap', 'home-widget-todayWorkout', 'home-widget-foodRing']);
});
test("today's workout offers a freestyle start when nothing is planned", async () => {
  open();
  await render(<Home />, { wrapper });
  expect(screen.getByText('No routine planned')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Start freestyle' }));
  expect(router.push).toHaveBeenCalledWith('/workout');
});
test("today's workout names the next routine in the plan and starts it", async () => {
  const repo = open(), workout = new WorkoutStore(repo);
  const a = workout.saveTemplate('Sample push', [{ exercise: 'Bench Press', target_sets: 3, target_reps: 8 }, { exercise: 'Overhead Press', target_sets: 3, target_reps: 8 }]);
  new PlanStore(repo).save({ mode: 'rotation', daysPerWeek: 3, days: [{ routineId: a.id, weekdays: [] }] });
  await render(<Home />, { wrapper });
  expect(screen.getByText('Sample push')).toBeTruthy();
  expect(screen.getByText('2 exercises')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Start Sample push' }));
  expect(new WorkoutStore(repo).active()?.data.routine_id).toBe(a.id);
  expect(router.push).toHaveBeenCalledWith('/workout');
});
test('an active workout is offered as Resume, not as a second start', async () => {
  const repo = open();
  new WorkoutStore(repo).start();
  await render(<Home />, { wrapper });
  expect(screen.getByText('Workout in progress')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start freestyle' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Resume workout' }));
  expect(router.push).toHaveBeenCalledWith('/workout');
});
test('food panel shows an honest empty state, then the ring once food is logged', async () => {
  const repo = open(), day = attributedDay();
  const view = await render(<Home />, { wrapper });
  expect(screen.getByText('Nothing logged yet')).toBeTruthy();
  expect(screen.queryByRole('image', { name: /kcal/ })).toBeNull();
  await act(async () => { saveFood(repo, day, meals(repo)[0].id, { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null }, 1, undefined, day); });
  await view.rerender(<Home />);
  expect(screen.getByRole('image', { name: /^100 kcal of/ })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Log food' }));
  expect(router.push).toHaveBeenCalledWith('/food');
});
test('Home reads only: opening it writes nothing to the outbox or the tables', async () => {
  const repo = open(), before = repo.getRevision();
  await render(<Home />, { wrapper });
  expect(repo.getRevision()).toBe(before);
});
