import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/provider';
import type { Repository } from '../src/data/repository';
import { AddItemSheet } from '../src/features/routines-ui/add-item';
import { saveItem } from '../src/features/routines/model/actions';
import { change, everyWord, seededRepository, stored, wrapper } from './routines-sheets-kit';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
const mockSheetOptions = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useNavigation: () => ({ setOptions: mockSheetOptions }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

/* Synthetic names only. None of these is anyone's routine. */
let repo: Repository;
const noise: jest.SpyInstance[] = [];
const open = async (props: Parameters<typeof AddItemSheet>[0] = {}) => { await render(<AddItemSheet {...props} />, { wrapper }); };
const morning = () => stored(repo).blocks.find((block) => block.name === 'Morning routine')!.id;
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const error = () => screen.getByTestId('item-error').props.children;

beforeEach(() => {
  repo = seededRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  jest.mocked(router.back).mockClear();
  mockSheetOptions.mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  noise.splice(0).forEach((spy) => spy.mockRestore());
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) noise.push(jest.spyOn(console, method).mockImplementation(() => {}));
});
afterEach(() => {
  // Nothing typed in a sheet is ever logged: the sheets do not log at all.
  for (const spy of noise) expect(spy).not.toHaveBeenCalled();
});

test('a new item starts empty, and Save says what is missing in the app\'s own words', async () => {
  await open();
  expect(screen.getByRole('header', { name: 'Add item' })).toBeTruthy();
  expect(screen.getByTestId('item-name').props.placeholder).toBe('Name');
  expect(screen.getByTestId('item-name').props.value).toBe('');
  expect(screen.getByText('Custom item. No evidence is attached.')).toBeTruthy();
  // No library chip and nothing to pick an item from.
  expect(everyWord(screen.toJSON())).not.toMatch(/library|suggest(?!s a dose)|popular|recommended/i);

  await press('item-save');
  expect(error()).toBe('Pick a type or a routine.');
  expect(screen.getByTestId('item-error').props.accessibilityRole).toBe('alert');

  await press(`item-routine-${morning()}`);
  expect(screen.getByRole('checkbox', { name: 'Morning routine' }).props.accessibilityState.checked).toBe(true);
  await press('item-save');
  expect(error()).toBe('Add a name.');

  await fireEvent.changeText(screen.getByTestId('item-name'), 'Stretch');
  expect(screen.queryByTestId('item-error')).toBeNull();
  await press('item-save');
  const saved = stored(repo);
  const item = saved.items.find((row) => row.name === 'Stretch')!;
  expect(item.kind).toBe('check');
  expect(item.compoundId).toBeNull();
  expect(saved.placements.some((row) => row.itemId === item.id && row.blockId === morning())).toBe(true);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('a dose is only what was typed: no placeholder number, steps from zero, and a unit that must be picked', async () => {
  await open({ blockId: morning() });
  await fireEvent.changeText(screen.getByTestId('item-name'), 'Sample dose');
  await press('item-kind-dose');
  const input = () => screen.getByTestId('item-dose-input');
  expect(input().props.value).toBe('');
  expect(input().props.placeholder).toBeUndefined();
  expect(screen.getByTestId('item-dose-unit').props.children).toBe('unit');
  expect(screen.getByTestId('item-readback').props.children).toBe('Type an amount or use the steps.');
  expect(screen.getByText('The amount and unit are what you type. Nothing here suggests a dose.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Take away ¼' }).props.accessibilityState.disabled).toBe(true);

  await fireEvent.press(screen.getByRole('button', { name: 'Add ¼' }));
  expect(input().props.value).toBe('¼');
  expect(screen.getByTestId('item-readback').props.children).toBe('Pick a unit.');
  await press('item-save');
  expect(error()).toBe('Pick a unit.');

  await fireEvent.press(screen.getByRole('radio', { name: 'mcg' }));
  expect(screen.getByTestId('item-readback').props.children).toBe('Logs ¼ mcg each time.');

  // Zero is not an amount to log.
  await fireEvent(input(), 'focus');
  await fireEvent.changeText(input(), '0');
  await fireEvent(input(), 'blur');
  await press('item-save');
  expect(error()).toBe('Add a name, an amount, and a unit.');
  expect(stored(repo).items).toHaveLength(0);

  await fireEvent(input(), 'focus');
  await fireEvent.changeText(input(), '2.5');
  await fireEvent(input(), 'blur');
  expect(input().props.value).toBe('2½');
  await press('item-save');
  const saved = stored(repo);
  const item = saved.items.find((row) => row.name === 'Sample dose')!;
  expect(item.kind).toBe('dose');
  expect(saved.compounds.find((row) => row.id === item.compoundId)).toMatchObject({ amount: 2.5, unit: 'mcg' });
});

test('type is optional and can be cleared, but an item keeps a type or a routine', async () => {
  await open({ blockId: morning() });
  await press('item-type-supplement');
  expect(screen.getByRole('radio', { name: 'Supplement' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByText('Optional with a type. It shows on its tab either way.')).toBeTruthy();
  await press('item-type-supplement');
  expect(screen.getByRole('radio', { name: 'Supplement' }).props.accessibilityState.checked).toBe(false);

  await press(`item-routine-${morning()}`);
  expect(screen.getByTestId('item-routine-hint').props.children).toBe('Give it a type, or keep it in one routine.');
  expect(screen.getByRole('checkbox', { name: 'Morning routine' }).props.accessibilityState.checked).toBe(true);

  await press('item-type-other');
  await press(`item-routine-${morning()}`);
  expect(screen.getByRole('checkbox', { name: 'Morning routine' }).props.accessibilityState.checked).toBe(false);
  await press('item-type-other');
  expect(screen.getByTestId('item-type-hint').props.children).toBe('Keep a type, or put it in a routine first.');
});

test('the converter link shows only for a peptide logged as a dose', async () => {
  await open({ blockId: morning() });
  expect(screen.queryByTestId('item-converter')).toBeNull();
  await press('item-type-peptide');
  // A new peptide is logged by amount.
  expect(screen.getByRole('radio', { name: /^Dose\./ }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByTestId('item-converter')).toBeTruthy();
  expect(screen.getByText('Concentration converter')).toBeTruthy();
  await press('item-kind-check');
  expect(screen.queryByTestId('item-converter')).toBeNull();
  await press('item-kind-dose');
  await press('item-type-supplement');
  expect(screen.queryByTestId('item-converter')).toBeNull();
});

test('a time can be typed, stepped and cleared, and the path reads it back', async () => {
  await open({ blockId: morning() });
  const time = () => screen.getByTestId('item-time');
  expect(time().props.value).toBe('');
  await fireEvent(time(), 'focus');
  await fireEvent.changeText(time(), '730');
  await fireEvent(time(), 'blur');
  expect(time().props.value).toBe('07:30');
  expect(screen.getByTestId('arc-big').props.children).toBe('07:30');
  await press('item-time-later');
  expect(time().props.value).toBe('07:45');
  await fireEvent(screen.getByTestId('item-arc'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(time().props.value).toBe('07:40');
  // Something that is not a time leaves the field as it was.
  await fireEvent(time(), 'focus');
  await fireEvent.changeText(time(), 'soon');
  await fireEvent(time(), 'blur');
  expect(time().props.value).toBe('07:40');
  await press('item-time-clear');
  expect(time().props.value).toBe('');
  expect(screen.getByTestId('arc-big').props.children).toBe('Morning');
});

test('unsaved changes switch off the swipe down, and Close asks before it discards', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open();
  expect(mockSheetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  await press('add-item-close');
  expect(alert).not.toHaveBeenCalled();
  expect(router.back).toHaveBeenCalledTimes(1);

  await fireEvent.changeText(screen.getByTestId('item-name'), 'Stretch');
  expect(mockSheetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  await press('add-item-close');
  expect(alert).toHaveBeenCalledWith('Discard changes?', undefined, expect.any(Array));
  expect(router.back).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test('an item opens for editing with what was saved, and can be removed after a confirm', async () => {
  const { itemId } = change(repo, (store, clock, newId) => saveItem(store, { name: 'Sample dose', kind: 'dose', amount: '5', unit: 'mg', type: 'supplement', time: '08:15', blockIds: [], onHand: '12', mixedOn: '' }, clock, newId))!;
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open({ itemId });
  expect(screen.getByRole('header', { name: 'Edit item' })).toBeTruthy();
  expect(screen.getByTestId('item-name').props.value).toBe('Sample dose');
  expect(screen.getByTestId('item-dose-input').props.value).toBe('5');
  expect(screen.getByRole('radio', { name: 'mg' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByTestId('item-time').props.value).toBe('08:15');
  expect(screen.getByTestId('item-on-hand').props.value).toBe('12');
  expect(screen.getByTestId('item-mixed').props.children).toBe('Not set');
  await press('item-mixed-today');
  expect(screen.getByTestId('item-mixed').props.children).toBe('Today');
  expect(screen.getByTestId('item-save').props.accessibilityLabel).toBe('Save');

  await press('item-remove');
  expect(alert).toHaveBeenCalledWith('Remove from all routines?', 'Its history stays.', expect.any(Array));
  expect(stored(repo).items.filter((row) => row.deletedAt === null)).toHaveLength(1);
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => { buttons.find((button) => button.style === 'destructive')!.onPress!(); });
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(stored(repo).items.filter((row) => row.deletedAt === null)).toHaveLength(0);
  alert.mockRestore();
});

test('a new type can be named in place and is picked once added', async () => {
  await open({ blockId: morning() });
  await press('item-type-new');
  await fireEvent.changeText(screen.getByTestId('item-type-name'), 'Skin care');
  await press('item-type-add');
  expect(screen.getByRole('radio', { name: 'Skin care' }).props.accessibilityState.checked).toBe(true);
  expect(stored(repo).prefs.customTypes?.map((type) => type.name)).toEqual(['Skin care']);
});
