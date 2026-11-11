import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { ExercisePicker } from '../src/features/workout/picker';
import { TemplateEditor } from '../src/features/workout/templates';
import { useAuth } from '../src/auth/provider';
import { router } from 'expo-router';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useIsFocused: () => true, router: { canDismiss: () => false, canGoBack: () => false, replace: jest.fn(), back: jest.fn(), push: jest.fn() } }));
beforeEach(() => { jest.mocked(useAuth).mockReturnValue({ repository: memoryRepository(), pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>); });
function wrapper({ children }: { children: React.ReactNode }) { return <ThemeProvider>{children}</ThemeProvider>; }
const names = () => screen.getAllByRole('button').map(b => b.props.accessibilityLabel as string);
test('add-exercise sheet lists real matches before the create option', async () => {
  const store = new WorkoutStore(memoryRepository());
  await render(<ExercisePicker store={store} onPick={() => {}} onClose={() => {}} />, { wrapper });
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'bench');
  const order = names();
  expect(order.indexOf('Bench Press')).toBeGreaterThan(-1);
  expect(order.indexOf('Create “bench”')).toBeGreaterThan(order.indexOf('Bench Press'));
});
test('a result row is one button that carries its muscle line', async () => {
  const pick = jest.fn();
  await render(<ExercisePicker onPick={pick} onClose={() => {}} />, { wrapper });
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'bench press');
  const row = screen.getByRole('button', { name: 'Bench Press' });
  expect(within(row).getByText(/Main muscle: Chest/)).toBeTruthy();
  // The label is the name, so a screen reader gets the muscles as the row's value.
  expect(row.props.accessibilityValue).toEqual({ text: expect.stringMatching(/^Main muscle: Chest/) });
  await fireEvent.press(row);
  expect(pick).toHaveBeenCalledWith('Bench Press');
});
test('create is still offered when nothing matches', async () => {
  const store = new WorkoutStore(memoryRepository());
  await render(<ExercisePicker store={store} onPick={() => {}} onClose={() => {}} />, { wrapper });
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'Zzyzx fixture lift');
  expect(screen.getByRole('button', { name: 'Create “Zzyzx fixture lift”' })).toBeTruthy();
});

// Cancel moved from the foot of the form into the header bar (owner's ruling for the new look); Save stays the last button.
test('routine editor has Cancel in its header bar, still leaving the editor, and Save template last', async () => {
  await render(<TemplateEditor />, { wrapper });
  const order = names();
  expect(order[0]).toBe('Cancel');
  expect(order[order.length - 1]).toBe('Save template');
  expect(order.filter(name => name === 'Cancel')).toHaveLength(1);
  const bar = screen.getByTestId('template-bar');
  expect(within(bar).getByRole('header')).toHaveTextContent('New template');
  await fireEvent.press(within(bar).getByRole('button', { name: 'Cancel' }));
  expect(router.replace).toHaveBeenCalledWith('/workouts');
});
