import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, AppState, LayoutAnimation } from 'react-native';
import { selectionAsync } from 'expo-haptics';
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

test('a window typed off the path keeps its times, and the path stops offering its handles', async () => {
  await render(<RoutineSheet />, { wrapper });
  expect(screen.getByText('drag either end')).toBeTruthy();
  expect(screen.getByTestId('window-arc-start')).toBeTruthy();
  await type('routine-start', '0400');
  expect(value('routine-start')).toBe('04:00');
  // The path starts at 05:00, so it cannot place this start. It says so and leaves both times alone.
  expect(screen.getByText('outside the arc · use the times below')).toBeTruthy();
  expect(screen.queryByText('drag either end')).toBeNull();
  expect(screen.queryByTestId('window-arc-start')).toBeNull();
  expect(screen.queryByTestId('window-arc-end')).toBeNull();
  expect(value('routine-end')).toBe('14:00');
  // Back on the path, the handles return.
  await type('routine-start', '0600');
  expect(screen.getByTestId('window-arc-start').props.accessibilityValue).toEqual({ text: '06:00' });
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

/* Two items in Morning, in a known order, one of them with no type so it shows only inside its routines. */
function twoInMorning() {
  const morning = block('Morning routine').id;
  const first = change(repo, (store, clock, newId) => saveItem(store, { name: 'Stretch', kind: 'check', amount: '', unit: '', type: '', time: '', blockIds: [morning], onHand: '', mixedOn: '' }, clock, newId))!.itemId;
  const second = change(repo, (store, clock, newId) => saveItem(store, { name: 'Walk', kind: 'check', amount: '', unit: '', type: 'other', time: '', blockIds: [morning], onHand: '', mixedOn: '' }, clock, newId))!.itemId;
  return { morning, first, second };
}
const placedIn = (blockId: string) => stored(repo).placements.filter((row) => row.blockId === blockId && row.deletedAt === null).sort((a, b) => a.order - b.order).map((row) => row.itemId);

test('items inside a routine move up and down, and the order is saved with the routine', async () => {
  const { morning, first, second } = twoInMorning();
  expect(placedIn(morning)).toEqual([first, second]);
  await render(<RoutineSheet blockId={morning} />, { wrapper });
  const up = (id: string) => screen.getByTestId(`routine-item-up-${id}`), down = (id: string) => screen.getByTestId(`routine-item-down-${id}`);
  expect(up(first).props.accessibilityLabel).toBe('Move Stretch up');
  expect(up(first).props.accessibilityState.disabled).toBe(true);
  expect(down(second).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(down(first));
  expect(said).toHaveBeenLastCalledWith('Stretch, 2 of 2');
  expect(up(second).props.accessibilityState.disabled).toBe(true);
  // Nothing is written until Save.
  expect(placedIn(morning)).toEqual([first, second]);
  await press('routine-save');
  expect(placedIn(morning)).toEqual([second, first]);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('moving an item glides the list and stays quiet; picking a day or a colour ticks only when it changes', async () => {
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const { morning, first } = twoInMorning();
  await render(<RoutineSheet blockId={morning} />, { wrapper });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const glide = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  jest.mocked(selectionAsync).mockClear();
  await fireEvent.press(screen.getByTestId(`routine-item-down-${first}`));
  expect(glide).toHaveBeenCalledTimes(1);
  expect(selectionAsync).not.toHaveBeenCalled();
  // A move that cannot happen changes nothing, so nothing glides.
  await fireEvent.press(screen.getByTestId(`routine-item-down-${first}`));
  expect(glide).toHaveBeenCalledTimes(1);
  await press('routine-day-0');
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  const chosen = screen.getAllByRole('radio').find(radio => radio.props.accessibilityState.checked)!;
  const other = screen.getAllByRole('radio').find(radio => !radio.props.accessibilityState.checked)!;
  await fireEvent.press(chosen);
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  await fireEvent.press(other);
  expect(selectionAsync).toHaveBeenCalledTimes(2);
  glide.mockRestore();
});

test('Duplicate copies the saved routine with its items, and asks for a save first when there are edits', async () => {
  const { morning, first, second } = twoInMorning();
  await render(<RoutineSheet blockId={morning} />, { wrapper });
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Sunrise');
  await press('routine-duplicate');
  expect(screen.getByTestId('routine-error').props.children).toBe('Save your changes first.');
  expect(shown()).toHaveLength(2);
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Morning routine');
  await press('routine-duplicate');
  expect(shown().map((row) => row.name)).toEqual(['Morning routine', 'Night routine', 'Morning routine copy']);
  expect(placedIn(block('Morning routine copy').id)).toEqual([first, second]);
  expect(block('Morning routine copy').color).toBe(block('Morning routine').color);
  expect(said).toHaveBeenLastCalledWith('Routine duplicated.');
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('Delete asks first, then removes the routine and keeps its items and their logs', async () => {
  const { morning, first, second } = twoInMorning();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<RoutineSheet blockId={morning} />, { wrapper });
  expect(screen.queryByTestId('routine-delete')).toBeTruthy();
  await press('routine-delete');
  expect(alert).toHaveBeenCalledWith('Delete this routine?', 'Its items stay on their tabs and their history is kept. The routine itself cannot be brought back.', expect.any(Array));
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.map((button) => [button.text, button.style])).toEqual([['Cancel', 'cancel'], ['Delete', 'destructive']]);
  // Nothing happens until Delete is chosen.
  expect(shown().map((row) => row.name)).toEqual(['Morning routine', 'Night routine']);
  await act(async () => { buttons[1].onPress!(); });
  expect(shown().map((row) => row.name)).toEqual(['Night routine']);
  const after = projectRoutineStore(stored(repo))!;
  expect(after.items.map((item) => item.id)).toEqual(expect.arrayContaining([first, second]));
  // The item with no type showed only in this routine, so it moves to the Other tab and is not lost from view.
  expect(after.items.find((item) => item.id === first)).toMatchObject({ type: 'other' });
  expect(placedIn(morning)).toEqual([]);
  expect(router.back).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test('a new routine has no Duplicate and no Delete', async () => {
  await render(<RoutineSheet />, { wrapper });
  expect(screen.queryByTestId('routine-duplicate')).toBeNull();
  expect(screen.queryByTestId('routine-delete')).toBeNull();
});

test('Save takes a start and an end that are still being typed', async () => {
  await render(<RoutineSheet />, { wrapper });
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Midday reset');
  // The keyboard stays up when another control is pressed, so neither field is left: no blur and no submit.
  await fireEvent(screen.getByTestId('routine-start'), 'focus');
  await fireEvent.changeText(screen.getByTestId('routine-start'), '0930');
  await fireEvent(screen.getByTestId('routine-end'), 'focus');
  await fireEvent.changeText(screen.getByTestId('routine-end'), '11');
  await press('routine-save');
  expect(block('Midday reset')).toMatchObject({ startMin: 570, endMin: 660 });
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('a typed time counts as an unsaved change, a step starts from it, and Save keeps it when it refuses', async () => {
  await render(<RoutineSheet />, { wrapper });
  expect(mockSheetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  await fireEvent(screen.getByTestId('routine-start'), 'focus');
  await fireEvent.changeText(screen.getByTestId('routine-start'), '0900');
  expect(mockSheetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  await press('routine-start-later');
  expect(value('routine-start')).toBe('09:15');
  await fireEvent.changeText(screen.getByTestId('routine-end'), '1000');
  // No name yet: Save refuses, and the typed end is now the time on the form.
  await press('routine-save');
  expect(screen.getByTestId('routine-error').props.children).toBe('Add a name and both times.');
  expect(value('routine-end')).toBe('10:00');
  expect(screen.getByTestId('window-arc-end').props.accessibilityValue).toEqual({ text: '10:00' });
  // Something that is not a time saves the time the form had.
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Midday reset');
  await fireEvent.changeText(screen.getByTestId('routine-end'), 'later');
  await press('routine-save');
  expect(block('Midday reset')).toMatchObject({ startMin: 555, endMin: 600 });
});

test('a second press of Save while the sheet closes makes one routine', async () => {
  await render(<RoutineSheet />, { wrapper });
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Midday');
  await press('routine-save');
  await press('routine-save');
  expect(shown().filter((row) => row.name === 'Midday')).toHaveLength(1);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('a Save that was refused does not lock the button, and a second press of Duplicate makes one copy', async () => {
  await render(<RoutineSheet />, { wrapper });
  await press('routine-save');
  expect(screen.getByTestId('routine-error')).toBeTruthy();
  expect(shown()).toHaveLength(2);
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Midday');
  await press('routine-save');
  expect(shown().filter((row) => row.name === 'Midday')).toHaveLength(1);
  await screen.unmount();
  jest.mocked(router.back).mockClear();

  await render(<RoutineSheet blockId={block('Morning routine').id} />, { wrapper });
  await press('routine-duplicate');
  await press('routine-duplicate');
  expect(shown().filter((row) => row.name.startsWith('Morning routine copy'))).toHaveLength(1);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('Hide asks for a save first when there are edits, and drops none of them', async () => {
  const night = block('Night routine').id;
  await render(<RoutineSheet blockId={night} />, { wrapper });
  await fireEvent.changeText(screen.getByTestId('routine-name'), 'Late');
  await press('routine-hide');
  expect(screen.getByTestId('routine-error').props.children).toBe('Save your changes first.');
  expect(said).toHaveBeenLastCalledWith('Save your changes first.');
  expect(stored(repo).blocks.find((row) => row.id === night)).toMatchObject({ name: 'Night routine' });
  expect(stored(repo).blocks.find((row) => row.id === night)!.hidden ?? false).toBe(false);
  expect(value('routine-name')).toBe('Late');
  expect(router.back).not.toHaveBeenCalled();
});
