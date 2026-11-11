import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { useAuth } from '../src/auth/provider';
import { Workouts } from '../src/features/workout/templates';
import { printData, workoutPrint } from '../src/features/home/contour';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
function open() {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  return { repo, store: new WorkoutStore(repo) };
}
const routine = (store: WorkoutStore, name: string) => store.saveTemplate(name, [{ exercise: 'Bench Press', target_sets: 3, target_reps: 8 }, { exercise: 'Overhead Press', target_sets: 3, target_reps: 8 }]);
function finish(store: WorkoutStore, routineId: string) {
  const start = Date.now() - 86400000, session = store.start(routineId, start), entry = store.entries(session.id)[0];
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' }); store.toggleDone(entry.id, 0);
  store.finish(session.id, { startedAt: start, finishedAt: start + 1800000, notes: '' });
  return session;
}
beforeEach(() => { jest.mocked(router.push).mockClear(); });

test('workout print: same workout draws the same print, bigger share draws more lines, no NaN', () => {
  const data = printData('session-1', [{ name: 'Bench Press', volume: 4000 }, { name: 'Fly', volume: 800 }]);
  expect(data.shares).toEqual([1, 0.2]);
  const lines = workoutPrint(data, 300, 150);
  expect(lines).toEqual(workoutPrint(data, 300, 150));
  expect(lines.length).toBe(7);
  expect(lines.every(line => line.d.startsWith('M') && !line.d.includes('NaN'))).toBe(true);
  expect(workoutPrint(data, 36, 36).length).toBeLessThan(lines.length);
  expect(workoutPrint(printData('empty', []), 300, 150)).toEqual([]);
});
test('a new account sees the routines card with New template and Start empty, and no print cards', async () => {
  open();
  await render(<Workouts />, { wrapper });
  expect(screen.queryByTestId('workouts-latest-print')).toBeNull();
  expect(screen.queryByTestId('workouts-up-next')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'New template' }));
  expect(router.push).toHaveBeenCalledWith('/workout/template');
  await fireEvent.press(screen.getByRole('button', { name: 'Start empty workout' }));
  expect(router.push).toHaveBeenCalledWith('/workout');
});
test('up next names the routine and its exercises and starts it; the row play button starts it too', async () => {
  const { repo, store } = open(), a = routine(store, 'Sample push');
  const view = await render(<Workouts />, { wrapper });
  expect(screen.getByText('Up next')).toBeTruthy();
  expect(screen.getByText('Bench Press · Overhead Press')).toBeTruthy();
  expect(screen.getByText('2 exercises · Not done yet')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Up next. Start Sample push' }));
  expect(new WorkoutStore(repo).active()?.data.routine_id).toBe(a.id);
  expect(router.push).toHaveBeenCalledWith('/workout');
  await view.rerender(<Workouts />);
  expect(screen.queryByTestId('workouts-up-next')).toBeNull();
  expect(screen.getByRole('button', { name: 'Start Sample push' })).toBeTruthy();
});
test('the latest finished workout shows as a print with its date and volume, and opens its summary', async () => {
  const { store } = open(), a = routine(store, 'Sample push'), session = finish(store, a.id);
  await render(<Workouts />, { wrapper });
  expect(screen.getByTestId('workouts-latest-print')).toBeTruthy();
  expect(screen.getByText("800 lb")).toBeTruthy();
  expect(screen.getByText(/^2 exercises · Last done \w{3} \d+$/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /^Latest print: / }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/summary', params: { id: session.id } });
});
test('edit, reorder and delete sit behind the routine row and still work', async () => {
  const { repo, store } = open(), a = routine(store, 'Sample push');
  routine(store, 'Sample pull');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.[1]?.onPress?.(); });
  const view = await render(<Workouts />, { wrapper });
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Actions for Sample push' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/template', params: { id: a.id } });
  await fireEvent.press(screen.getByRole('button', { name: 'Move down' }));
  expect(new WorkoutStore(repo).templates().map(r => r.data.name)).toEqual(['Sample pull', 'Sample push']);
  await view.rerender(<Workouts />);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  expect(new WorkoutStore(repo).templates().map(r => r.data.name)).toEqual(['Sample pull']);
  await view.rerender(<Workouts />);
  await fireEvent.press(screen.getByRole('button', { name: 'Undo template deletion' }));
  expect(new WorkoutStore(repo).templates()).toHaveLength(2);
  alert.mockRestore();
});
