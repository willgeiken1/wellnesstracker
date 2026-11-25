import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { PlanStore } from '../src/features/plans/store';
import { PlanBuilder, dayRows, fillWeekdays, writeDay } from '../src/features/workout/screens/plan';
import { showToast } from '../src/features/shell/toast';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useIsFocused: () => true, useLocalSearchParams: () => ({}) }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

/** Made-up sample: two templates, Push A (bench 3 × 5–8, a two-lift superset) and Pull A. */
function sample() {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  const push = store.saveTemplate('Push A', [
    { exercise: 'Bench Press', target_sets: 3, target_reps: 8, rep_min: 5, rep_max: 8, superset_group: 'a' },
    { exercise: 'Overhead Press', target_sets: 3, target_reps: 8, superset_group: 'a' },
    { exercise: 'Dumbbell Fly', target_sets: 2, target_reps: 12 }]);
  const pull = store.saveTemplate('Pull A', [{ exercise: 'Barbell Row', target_sets: 4, target_reps: 8 }]);
  return { store, push, pull };
}
beforeEach(() => jest.clearAllMocks());

test('a day saves back with its rows, and a superset left with one lift is undone', () => {
  const { store, push } = sample();
  const rows = dayRows(store, push.id);
  expect(rows.map(r => [r.exercise, r.target_sets, r.rep_min, r.rep_max])).toEqual([['Bench Press', 3, 5, 8], ['Overhead Press', 3, undefined, undefined], ['Dumbbell Fly', 2, undefined, undefined]]);
  writeDay(store, push.id, rows.filter(r => r.exercise !== 'Overhead Press'));
  expect(dayRows(store, push.id).map(r => [r.exercise, r.superset_group])).toEqual([['Bench Press', undefined], ['Dumbbell Fly', undefined]]);
});

test('fixed weekdays keep chosen days and fill the rest in order, up to seven', () => {
  expect(fillWeekdays(['a', 'b', 'c'], { b: [0] })).toEqual({ a: [1], b: [0], c: [3] });
  expect(fillWeekdays(['1', '2', '3', '4', '5', '6', '7', '8'], {})).toBeNull();
});

test('the builder shows each day, changes sets in place, and Save keeps the days in order', async () => {
  const { store, push, pull } = sample();
  await render(<PlanBuilder />, { wrapper });
  expect(screen.getByText('2 days in rotation · 3 per week')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Push A, 3 exercises · 8 sets' })).toBeTruthy();
  await fireEvent.press(screen.getByTestId('plan-day-0'));
  await fireEvent.press(screen.getAllByRole('button', { name: 'More' })[1]);
  expect(dayRows(store, push.id)[0].target_sets).toBe(4);
  await fireEvent.press(screen.getByRole('button', { name: /^Remove dumbbell fly/i }));
  expect(dayRows(store, push.id)).toHaveLength(2);
  expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Dumbbell fly removed$/i), expect.objectContaining({ action: expect.anything() }));
  await fireEvent.press(screen.getByTestId('plan-save'));
  expect(new PlanStore(mockRepository).read().days.map(d => d.routineId)).toEqual([push.id, pull.id]);
  expect(router.back).toHaveBeenCalled();
});

test('rep ranges commit when editing ends, with the low end never above the high end', async () => {
  const { store, push } = sample();
  await render(<PlanBuilder />, { wrapper });
  await fireEvent.press(screen.getByTestId('plan-day-0'));
  const lo = screen.getByLabelText('Bench press fewest reps');
  await fireEvent(lo, 'focus');
  await fireEvent.changeText(lo, '10');
  await fireEvent(lo, 'endEditing');
  expect(dayRows(store, push.id)[0]).toMatchObject({ rep_min: 10, rep_max: 10, target_reps: 10 });
});

test('Add a day makes an empty day and opens it', async () => {
  const { store } = sample();
  await render(<PlanBuilder />, { wrapper });
  await fireEvent.press(screen.getByText('Add a day'));
  expect(store.templates().map(r => r.data.name)).toContain('Day 3');
  expect(screen.getByRole('button', { name: 'Add exercise' })).toBeTruthy();
});
