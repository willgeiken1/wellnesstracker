import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/provider';
import type { Repository } from '../src/data/repository';
import { RoutineSheet } from '../src/features/routines-ui/new-routine';
import { saveItem } from '../src/features/routines/model/actions';
import { projectRoutineStore } from '../src/features/routines/model/shape';
import { change, seededRepository, stored, wrapper } from './routines-sheets-kit';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
const mockSheetOptions = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useNavigation: () => ({ setOptions: mockSheetOptions }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

/* Synthetic routine and item names only. */
let repo: Repository;
let said: jest.SpyInstance;
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const type = async (testID: string, text: string) => {
  await fireEvent(screen.getByTestId(testID), 'focus');
  await fireEvent.changeText(screen.getByTestId(testID), text);
  await fireEvent(screen.getByTestId(testID), 'blur');
};
const value = (testID: string) => screen.getByTestId(testID).props.value;
const shown = () => projectRoutineStore(stored(repo))!.blocks;
const block = (name: string) => stored(repo).blocks.find((row) => row.name === name)!;

beforeEach(() => {
  repo = seededRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  jest.mocked(router.back).mockClear();
  mockSheetOptions.mockClear();
  said = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

test('a new routine needs a name, takes typed, stepped and dragged times, and keeps at least one day', async () => {
  await render(<RoutineSheet />, { wrapper });
  expect(screen.getByRole('header', { name: 'New routine' })).toBeTruthy();
  expect(value('routine-start')).toBe('12:00');
  expect(value('routine-end')).toBe('14:00');
  expect(screen.queryByTestId('routine-move-up')).toBeNull();
  expect(screen.queryByTestId('routine-hide')).toBeNull();

  await press('routine-save');
  expect(screen.getByTestId('routine-error').props.children).toBe('Add a name and both times.');
  expect(screen.getByTestId('routine-error').props.accessibilityRole).toBe('alert');

  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Midday reset');
  expect(screen.queryByTestId('routine-error')).toBeNull();
  await press('routine-start-later');
  expect(value('routine-start')).toBe('12:15');
  await type('routine-end', '1530');
  expect(value('routine-end')).toBe('15:30');
  await type('routine-end', 'later');
  expect(value('routine-end')).toBe('15:30');
  // Each end of the path is an adjustable control that moves a quarter of an hour.
  const start = screen.getByTestId('window-arc-start');
  expect(start.props.accessibilityRole).toBe('adjustable');
  expect(start.props.accessibilityValue).toEqual({ text: '12:15' });
  await fireEvent(start, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(value('routine-start')).toBe('12:00');
  await fireEvent(screen.getByTestId('window-arc-end'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(value('routine-end')).toBe('15:45');

  for (const day of [0, 1, 2, 3, 4, 5]) await press(`routine-day-${day}`);
  expect(screen.getByRole('checkbox', { name: 'Sunday' }).props.accessibilityState.checked).toBe(true);
  await press('routine-day-6');
  expect(screen.getByTestId('routine-day-hint').props.children).toBe('A routine runs at least one day.');
  expect(screen.getByRole('checkbox', { name: 'Sunday' }).props.accessibilityState.checked).toBe(true);
  await press('routine-day-2');

  await press('routine-color-pink');
  expect(screen.getByRole('radio', { name: 'Pink, follows the accent' }).props.accessibilityState.checked).toBe(true);

  await press('routine-save');
  expect(block('Midday reset')).toMatchObject({ startMin: 720, endMin: 945, days: [2, 6], color: 'pink' });
  expect(shown().map((row) => row.name)).toEqual(['Morning routine', 'Night routine', 'Midday reset']);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('items are added from what already exists and taken out with one tap', async () => {
  const { itemId } = change(repo, (store, clock, newId) => saveItem(store, { name: 'Stretch', kind: 'check', amount: '', unit: '', type: 'other', time: '', blockIds: [], onHand: '', mixedOn: '' }, clock, newId))!;
  await render(<RoutineSheet />, { wrapper });
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Midday reset');
  expect(screen.queryByTestId(`routine-add-${itemId}`)).toBeNull();
  await press('routine-items-more');
  await fireEvent.press(screen.getByRole('button', { name: 'Add Stretch to this routine' }));
  expect(screen.getByRole('button', { name: 'Remove Stretch from this routine' })).toBeTruthy();
  await press(`routine-item-${itemId}`);
  expect(screen.queryByTestId(`routine-item-${itemId}`)).toBeNull();
  await press(`routine-add-${itemId}`);
  await press('routine-save');
  const saved = stored(repo);
  expect(saved.placements.filter((row) => row.deletedAt === null)).toEqual([expect.objectContaining({ itemId, blockId: block('Midday reset').id })]);
});

test('Edit routine renames from the title, moves the routine at once, and says where it went', async () => {
  const morning = block('Morning routine').id;
  await render(<RoutineSheet blockId={morning} />, { wrapper });
  expect(screen.getByRole('header', { name: 'Edit routine' })).toBeTruthy();
  expect(value('routine-name')).toBe('Morning routine');
  const up = () => screen.getByRole('button', { name: 'Move Morning routine up' });
  const down = () => screen.getByRole('button', { name: 'Move Morning routine down' });
  expect(up().props.accessibilityState.disabled).toBe(true);
  expect(down().props.accessibilityState.disabled).toBe(false);

  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Sunrise');
  await fireEvent.press(down());
  // The move is saved now; the name being typed is not, and is not lost.
  expect(shown().map((row) => row.name)).toEqual(['Night routine', 'Morning routine']);
  expect(value('routine-name')).toBe('Sunrise');
  expect(said).toHaveBeenLastCalledWith('Morning routine, 2 of 2');
  expect(up().props.accessibilityState.disabled).toBe(false);
  expect(down().props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(up());
  expect(shown().map((row) => row.name)).toEqual(['Morning routine', 'Night routine']);

  await press('routine-save');
  expect(shown().map((row) => row.name)).toEqual(['Sunrise', 'Night routine']);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('Hide is a quiet second action that keeps the routine and closes the sheet', async () => {
  const night = block('Night routine').id;
  await render(<RoutineSheet blockId={night} />, { wrapper });
  expect(screen.getByText('Hiding keeps its items and history. Restore it from Edit routines.')).toBeTruthy();
  await press('routine-hide');
  expect(stored(repo).blocks.find((row) => row.id === night)).toMatchObject({ hidden: true, deletedAt: null });
  expect(shown().map((row) => row.name)).toEqual(['Morning routine']);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('a changed draft locks the swipe down and Close asks first; a routine that is gone says so', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await render(<RoutineSheet />, { wrapper });
  expect(mockSheetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  await press('routine-color-pink');
  expect(mockSheetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  await press('routine-sheet-close');
  expect(alert).toHaveBeenCalledWith('Discard changes?', undefined, expect.any(Array));
  expect(router.back).not.toHaveBeenCalled();
  alert.mockRestore();
  await view.unmount();

  await render(<RoutineSheet blockId="00000000-0000-4000-8000-000000000000" />, { wrapper });
  expect(screen.getByTestId('routine-gone').props.children).toBe('This routine isn\'t here any more.');
  expect(screen.queryByTestId('routine-save')).toBeNull();
});
