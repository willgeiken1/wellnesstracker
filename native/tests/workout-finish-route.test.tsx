import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { router, Slot } from 'expo-router';
import { Text } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { NavigationShell } from '../src/app/_layout';
import WorkoutLayout from '../src/app/workout/_layout';
import ActiveWorkout from '../src/app/workout/index';
import Summary from '../src/app/workout/summary';
import { useAuth } from '../src/auth/provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../src/features/workout/haptics', () => ({ tick: jest.fn(), restBuzz: jest.fn(), signatureBuzz: jest.fn() }));
const routes = {
  _layout: () => <ThemeProvider><NavigationShell access /></ThemeProvider>,
  '(tabs)/_layout': Slot,
  '(tabs)/index': () => <Text>Home</Text>,
  'workout/_layout': WorkoutLayout,
  'workout/index': ActiveWorkout,
  'workout/summary': Summary,
  'auth/index': () => null,
};
type State = { key: string; index: number; routes: { name: string; key: string; params?: object; state?: State }[] };
const focused = (state: State) => state.routes[state.index];
/** The app's root stack, under the router's own __root wrapper. */
const appStack = (state: unknown) => focused(state as State).state!;

test('Save swaps the logger for the summary inside the same workout modal, which stays presented over the tabs', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), session = store.start();
  const bench = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(bench.id, 0, { weight: '100', reps: '8' });
  store.toggleDone(bench.id, 0);
  jest.mocked(useAuth).mockReturnValue({ repository: repo, ready: true, demo: true, session: null, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  const view = await renderRouter(routes, { initialUrl: '/' });
  await act(() => router.push('/workout'));
  await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy());
  const before = focused(appStack(view.getRouterState()));
  expect(before.name).toBe('workout');
  await fireEvent.press(screen.getByTestId('finish-button'));
  await fireEvent.press(screen.getByTestId('save-workout'));
  await waitFor(() => expect(view.getPathname()).toBe('/workout/summary'));
  expect(view.getSearchParams()).toEqual({ id: session.id, just: '1' });
  const root = appStack(view.getRouterState()), modal = focused(root);
  // The tabs stay underneath and the workout modal is the same route: it was not dismissed and presented again.
  expect(root.routes.map(route => route.name)).toEqual(['(tabs)', 'workout']);
  expect(modal.key).toBe(before.key);
  // Inside it, the summary took the logger's place, so back from the summary leaves the modal as before.
  expect(modal.state!.routes.map(route => route.name)).toEqual(['summary']);
  expect(screen.getByText('Workout complete')).toBeTruthy();
});
