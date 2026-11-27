import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { ExercisePickerSheet } from '../src/features/workout/sheets/picker';
import { showToast } from '../src/features/shell/toast';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useIsFocused: () => true, useLocalSearchParams: () => ({}) }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

/** Made-up sample: a workout in progress with squat already in it. */
function sample() {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  const session = store.start();
  const squat = store.addExercise(session.id, 'Squat', 2);
  return { store, session, squat };
}
beforeEach(() => jest.clearAllMocks());

test('ticking two exercises and pressing Add puts both in the workout', async () => {
  const { store, session } = sample();
  await render(<ExercisePickerSheet mode="add" />, { wrapper });
  await fireEvent.changeText(screen.getByPlaceholderText('Search exercises'), 'curl');
  const curls = screen.getAllByRole('button', { name: /curl/i });
  expect(curls.length).toBeGreaterThan(1);
  await fireEvent.press(curls[0]);
  await fireEvent.press(curls[1]);
  expect(screen.getByText('Add (2)')).toBeTruthy();
  await fireEvent.press(screen.getByText('Add (2)'));
  expect(store.entries(session.id)).toHaveLength(3);
  expect(showToast).toHaveBeenCalledWith('2 exercises added', expect.anything());
  expect(router.back).toHaveBeenCalled();
});

test('an exercise already in the workout says Added', async () => {
  sample();
  await render(<ExercisePickerSheet mode="add" />, { wrapper });
  await fireEvent.changeText(screen.getByPlaceholderText('Search exercises'), 'squat');
  expect(screen.getByRole('button', { name: /^Squat, .*Added$/ })).toBeTruthy();
});

test('replace swaps the exercise with one tap', async () => {
  const { store, session, squat } = sample();
  await render(<ExercisePickerSheet mode="replace" entry={squat.id} />, { wrapper });
  await fireEvent.changeText(screen.getByPlaceholderText('Search exercises'), 'leg press');
  await fireEvent.press(screen.getAllByRole('button', { name: /^Leg press/i })[0]);
  const names = store.entries(session.id).map(e => String(e.data.exercise));
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/leg press/i);
  expect(router.back).toHaveBeenCalled();
});

/** Picks one exercise by search and presses Add. */
async function addOne(search: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('Search exercises'), search);
  await fireEvent.press(screen.getAllByRole('button', { name: new RegExp(`^${search}`, 'i') })[0]);
  await fireEvent.press(screen.getByText('Add (1)'));
}

test('adding while logging a past day goes to that day, even with no workout running', async () => {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  const day = new Date(Date.now() - 3 * 86_400_000);
  const past = store.startPast(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
  expect(store.active()).toBeUndefined();
  await render(<ExercisePickerSheet mode="add" session={past.id} />, { wrapper });
  await addOne('leg press');
  expect(store.entries(past.id).map(e => String(e.data.exercise))).toEqual([expect.stringMatching(/leg press/i)]);
  expect(router.back).toHaveBeenCalled();
});

test('adding while editing a finished workout goes to that workout, not the one running', async () => {
  const { store, session: live } = sample();
  const done = store.start(undefined, Date.now() - 7 * 86_400_000, true);
  store.addExercise(done.id, 'Squat', 1);
  store.finish(done.id, { startedAt: Date.now() - 7 * 86_400_000, finishedAt: Date.now() - 7 * 86_400_000 + 3_600_000, notes: '' });
  expect(store.active()?.id).toBe(live.id);
  await render(<ExercisePickerSheet mode="add" session={done.id} />, { wrapper });
  await addOne('leg press');
  expect(store.entries(done.id)).toHaveLength(2);
  expect(store.entries(live.id)).toHaveLength(1);
});

test('adding to a template keeps the rep ranges and supersets of the exercises already in it', async () => {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  const push = store.saveTemplate('Push', [
    { exercise: 'Bench Press', target_sets: 3, target_reps: 8, rep_min: 5, rep_max: 8, superset_group: 'a' },
    { exercise: 'Overhead Press', target_sets: 3, target_reps: 10, rep_min: 8, rep_max: 10, superset_group: 'a' },
  ]);
  await render(<ExercisePickerSheet mode="routine" routine={push.id} />, { wrapper });
  await addOne('leg press');
  const rows = store.templateExercises(push.id).map(e => [String(e.data.exercise), e.data.rep_min, e.data.rep_max, e.data.superset_group]);
  expect(rows).toEqual([['Bench Press', 5, 8, 'a'], ['Overhead Press', 8, 10, 'a'], [expect.stringMatching(/leg press/i), 8, 12, null]]);
});
