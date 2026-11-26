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
