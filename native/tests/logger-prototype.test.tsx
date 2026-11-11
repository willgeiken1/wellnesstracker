import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { ActiveWorkout } from '../src/features/workout/active';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
const mockAuth = { pending: 0, syncStatus: 'idle', demo: false };
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ ...mockAuth, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, useIsFocused: () => true, useLocalSearchParams: () => ({}) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

/** Made-up sample: a past Deadlift session, then a new workout with Deadlift and Pull-Up. */
function sample() {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  const past = store.start();
  const lift = store.addExercise(past.id, 'Deadlift');
  store.editDraft(lift.id, 0, { weight: '285', reps: '3' });
  store.toggleDone(lift.id, 0);
  const at = Date.now() - 86400000;
  store.finish(past.id, { startedAt: at, finishedAt: at + 60000, notes: '' });
  const session = store.start();
  const deadlift = store.addExercise(session.id, 'Deadlift'), pull = store.addExercise(session.id, 'Pull-Up');
  return { store, session, deadlift, pull };
}

test('the Up next card names the next open set and opens its keypad', async () => {
  const { deadlift, store } = sample();
  await render(<ActiveWorkout />, { wrapper });
  const card = screen.getByTestId('logger-up-next');
  expect(within(card).getByText('Deadlift')).toBeTruthy();
  const sets = store.drafts(deadlift.id).length;
  expect(within(card).getByText(new RegExp(`^${sets} × 3 at \\d+ lb$`))).toBeTruthy();
  await fireEvent.press(within(card).getByRole('button'));
  expect(screen.getByTestId('keypad-sheet')).toBeTruthy();
});

test('Up next skips an untouched exercise and moves to the following one', async () => {
  const { deadlift, store } = sample();
  await render(<ActiveWorkout />, { wrapper });
  const button = within(screen.getByTestId('logger-up-next')).getByRole('button');
  expect(button.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['skip', 'swap']);
  await fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'skip' } });
  expect(store.skipped(deadlift.id)).toBe(true);
  expect(within(screen.getByTestId('logger-up-next')).getByText('Pull-Up')).toBeTruthy();
});

test('Up next offers swap only once a set is logged, and swap opens the exercise list', async () => {
  const { deadlift, store } = sample();
  store.editDraft(deadlift.id, 0, { weight: '290', reps: '3' });
  store.toggleDone(deadlift.id, 0);
  await render(<ActiveWorkout />, { wrapper });
  const button = within(screen.getByTestId('logger-up-next')).getByRole('button');
  expect(button.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['swap']);
  expect(screen.getByText('Up next · swipe left to swap')).toBeTruthy();
  await fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'swap' } });
  expect(screen.getByTestId('exercise-picker-search')).toBeTruthy();
  expect(store.skipped(deadlift.id)).toBe(false);
});

test('Up next goes away when every set is done', async () => {
  const { deadlift, pull, store } = sample();
  await render(<ActiveWorkout />, { wrapper });
  await act(() => {
    for (const entry of [deadlift, pull]) store.drafts(entry.id).forEach((_, i) => { store.editDraft(entry.id, i, { weight: '100', reps: '5' }); store.toggleDone(entry.id, i); });
  });
  await screen.rerender(<ActiveWorkout />);
  expect(screen.queryByTestId('logger-up-next')).toBeNull();
});

test('each card has its own Add set chip', async () => {
  const { deadlift, store } = sample();
  await render(<ActiveWorkout />, { wrapper });
  const before = store.drafts(deadlift.id).length;
  await fireEvent.press(screen.getByRole('button', { name: 'Deadlift, Add set' }));
  expect(store.drafts(deadlift.id).length).toBe(before + 1);
});

test('Plates shows on barbell lifts only and opens the weight keypad with the plate line', async () => {
  sample();
  await render(<ActiveWorkout />, { wrapper });
  expect(screen.queryByRole('button', { name: 'Pull-Up, Plates' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Deadlift, Plates' }));
  expect(within(screen.getByTestId('keypad-sheet')).getByTestId('plate-line')).toBeTruthy();
});

test('tapping the set number opens the tags, which also hold Remove set', async () => {
  const { deadlift, store } = sample();
  await render(<ActiveWorkout />, { wrapper });
  await fireEvent.press(screen.getAllByRole('button', { name: 'Deadlift, Set 1, Remove set' })[0]);
  await fireEvent.press(screen.getByRole('button', { name: 'Warm-up' }));
  expect(store.drafts(deadlift.id)[0].tag).toBe('warmup');
  await screen.rerender(<ActiveWorkout />);
  expect(within(screen.getByTestId('set-row-0-0')).getByText('W')).toBeTruthy();
  expect(within(screen.getByTestId('set-row-0-0')).getByText('Warm-up')).toBeTruthy();
});
