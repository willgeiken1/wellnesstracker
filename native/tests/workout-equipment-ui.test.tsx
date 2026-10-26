import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { ExercisePicker } from '../src/features/workout/picker';
import { Keypad } from '../src/features/workout/keypad';
import { MachineSetup } from '../src/features/workout/machine-setup';
import { PlateSettings } from '../src/features/workout/plate-settings';
function wrapper({ children }: { children: React.ReactNode }) { return <ThemeProvider>{children}</ThemeProvider>; }

test('picker requires main muscle and equipment before custom lift creation', async () => {
  const store = new WorkoutStore(memoryRepository());
  const pick = jest.fn();
  await render(<ExercisePicker store={store} onPick={pick} onClose={() => {}} />, { wrapper });
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'Fixture lift');
  await fireEvent.press(screen.getByRole('button', { name: 'Create “Fixture lift”' }));
  expect(screen.getByRole('button', { name: 'Save exercise' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Main muscle: Quads' }));
  expect(screen.getByRole('button', { name: 'Save exercise' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment: Barbell' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save exercise' }));
  expect(store.preferences().exercise('Fixture lift')).toMatchObject({ main: 'quads', equipment: 'barbell' });
  expect(pick).toHaveBeenCalledWith('Fixture lift');
});
test('picker filters keep typo search and show muscle preview', async () => {
  await render(<ExercisePicker onPick={() => {}} onClose={() => {}} />, { wrapper });
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'bnch press');
  expect(screen.getByRole('button', { name: 'Bench Press' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Muscle: Chest' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment: Barbell' }));
  expect(screen.getAllByText(/Main muscle: Chest/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Incline Dumbbell Press' })).toBeNull();
});
test('machine setup saves seat, pad, pin notes, Step and bar', async () => {
  const store = new WorkoutStore(memoryRepository());
  await render(<MachineSetup store={store} name="Bench Press" />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Machine setup' }));
  await fireEvent.changeText(screen.getByLabelText('Seat / pad / pin notes'), 'Seat 5, pad 2, pin 3');
  await fireEvent.changeText(screen.getByLabelText('Step (lb)'), '12');
  await fireEvent.changeText(screen.getByLabelText('Bar weight (lb)'), '35');
  await fireEvent.press(screen.getByRole('button', { name: 'Save setup' }));
  expect(store.preferences().machine('Bench Press')).toMatchObject({ text: 'Seat 5, pad 2, pin 3', step: 12, bar_weight: 35 });
});
test('plate settings persist both units independently and reject invalid lists', async () => {
  const store = new WorkoutStore(memoryRepository());
  await render(<PlateSettings store={store} />, { wrapper });
  await fireEvent.changeText(screen.getByLabelText('Available plates (lb)'), '45, 10, 5');
  await fireEvent.press(screen.getByRole('button', { name: 'Save plates (lb)' }));
  await fireEvent.changeText(screen.getByLabelText('Available plates (kg)'), '20, 2.5');
  await fireEvent.press(screen.getByRole('button', { name: 'Save plates (kg)' }));
  expect(store.preferences().plateSet('lb')).toEqual([45, 10, 5]);
  expect(store.preferences().plateSet('kg')).toEqual([20, 2.5]);
  await fireEvent.changeText(screen.getByLabelText('Available plates (kg)'), '20, nope');
  await fireEvent.press(screen.getByRole('button', { name: 'Save plates (kg)' }));
  expect(screen.getByText('Enter positive plate sizes separated by commas.')).toBeTruthy();
  expect(store.preferences().plateSet('kg')).toEqual([20, 2.5]);
});
test('keypad uses saved Step, custom bar and gym plates', async () => {
  const change = jest.fn();
  await render(<Keypad label="Fixture" field="weight" equipment="barbell" unit="kg" value="55" previous="" setupStep={7} barWeight={15} plateSet={[20]} onChange={change} onNext={() => {}} onClose={() => {}} />, { wrapper });
  expect(screen.getByTestId('plate-line')).toHaveTextContent(/20 on a 15 kg bar/);
  await fireEvent.press(screen.getByRole('button', { name: '+7' }));
  expect(change).toHaveBeenCalledWith('62');
});
test('machine setup shows default Step for each unit and rejects invalid input', async () => {
  const store = new WorkoutStore(memoryRepository());
  await render(<MachineSetup store={store} name="Fixture" />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Machine setup' }));
  expect(screen.getByLabelText('Step (lb)').props.placeholder).toBe('10');
  await fireEvent.press(screen.getByRole('button', { name: 'Exercise unit: kg' }));
  expect(screen.getByLabelText('Step (kg)').props.placeholder).toBe('5');
  await fireEvent.changeText(screen.getByLabelText('Step (kg)'), '0');
  await fireEvent.press(screen.getByRole('button', { name: 'Save setup' }));
  expect(screen.getByText('Enter a positive Step and a non-negative bar weight.')).toBeTruthy();
  expect(store.preferences().machine('Fixture')).toEqual({ text: '' });
});
test('saved machine notes remain visible beside the sets without opening the editor', async () => {
  const store = new WorkoutStore(memoryRepository());
  store.preferences().saveMachine('Fixture', { text: 'Seat 5, pad 2, pin 3' });
  await render(<MachineSetup store={store} name="Fixture" />, { wrapper });
  expect(screen.getByText('Seat 5, pad 2, pin 3')).toBeTruthy();
});
