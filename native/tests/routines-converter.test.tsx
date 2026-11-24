import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/provider';
import type { Repository } from '../src/data/repository';
import { AddItemSheet } from '../src/features/routines-ui/add-item';
import { saveItem } from '../src/features/routines/model/actions';
import { change, everyWord, seededRepository, stored, wrapper } from './routines-sheets-kit';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

/* Synthetic names and amounts typed by the test, as a user would type their own. */
let repo: Repository;
const open = async (props: Parameters<typeof AddItemSheet>[0] = {}) => { await render(<AddItemSheet {...props} />, { wrapper }); };
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const type = async (testID: string, text: string) => {
  await fireEvent(screen.getByTestId(testID), 'focus');
  await fireEvent.changeText(screen.getByTestId(testID), text);
  await fireEvent(screen.getByTestId(testID), 'blur');
};
const text = (testID: string) => screen.getByTestId(testID).props.children;
const savedDose = (kind: 'dose' | 'check' = 'dose') => change(repo, (store, clock, newId) => saveItem(store, {
  name: 'Sample vial', kind, amount: kind === 'dose' ? '250' : '', unit: kind === 'dose' ? 'mcg' : '', type: 'peptide', time: '', blockIds: [], onHand: '', mixedOn: '',
}, clock, newId))!.itemId;

beforeEach(() => {
  repo = seededRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  jest.mocked(router.back).mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

test('it opens from the dose card with only what was typed, shows dashes, and never an example', async () => {
  await open();
  await fireEvent.changeText(screen.getByTestId('item-name'), 'Sample vial');
  await press('item-type-peptide');
  await type('item-dose-input', '250');
  await fireEvent.press(screen.getByRole('radio', { name: 'mcg' }));
  await press('item-converter');

  expect(screen.getByRole('header', { name: 'Concentration converter' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add item' })).toBeTruthy();
  expect(screen.getByTestId('converter-amount-input').props.value).toBe('250');
  expect(screen.getByTestId('converter-amount-unit-mcg').props.accessibilityState.checked).toBe(true);
  for (const field of ['converter-vial-input', 'converter-water-input']) {
    expect(screen.getByTestId(field).props.value).toBe('');
    expect(screen.getByTestId(field).props.placeholder).toBeUndefined();
  }
  expect(text('converter-volume')).toBe('–');
  expect(text('converter-units')).toBe('–');
  expect(text('converter-detail')).toBe('Enter a vial amount, a water volume, and an amount to convert.');
  expect(screen.queryAllByTestId('converter-line')).toHaveLength(0);
  expect(text('converter-doctor')).toBe('Check with your doctor or pharmacist in addition to using this app, and before making any medical decision.');
  for (const label of ['Vial amount', 'Water volume', 'Amount to convert', 'Volume', 'U-100 units']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  // An item that is not saved yet has nothing to save a note on.
  expect(screen.queryByTestId('converter-save')).toBeNull();
  expect(screen.queryByText('Save as note on this item')).toBeNull();

  // Back keeps everything typed in the form.
  await press('converter-back');
  expect(screen.getByTestId('item-name').props.value).toBe('Sample vial');
  expect(screen.getByTestId('item-dose-input').props.value).toBe('250');
});

test('it converts the three amounts entered and words the result as arithmetic, not as a dose to take', async () => {
  await open({ itemId: savedDose(), converter: true });
  // Opened by itself, it is the whole sheet: there is no item form behind it and no way into one.
  expect(screen.queryByRole('button', { name: 'Edit item' })).toBeNull();
  expect(screen.queryByTestId('converter-back')).toBeNull();
  expect(screen.queryByTestId('item-name')).toBeNull();
  // The amount and unit saved on the item carry in. The vial and the water start empty.
  expect(screen.getByTestId('converter-amount-input').props.value).toBe('250');
  expect(screen.getByTestId('converter-amount-unit-mcg').props.accessibilityState.checked).toBe(true);
  for (const field of ['converter-vial-input', 'converter-water-input']) expect(screen.getByTestId(field).props.value).toBe('');
  await type('converter-amount-input', '');
  await type('converter-vial-input', '5');
  await type('converter-water-input', '2');
  await type('converter-amount-input', '250');
  await press('converter-amount-unit-mcg');

  expect(text('converter-volume')).toBe('0.1');
  expect(text('converter-units')).toBe('10');
  expect(screen.getByTestId('converter-scale').props.style.width).toBe('10%');
  const lines = screen.getAllByTestId('converter-line').map((line) => line.props.children);
  expect(lines).toEqual([
    'Vial: 5 mg', 'Water: 2 mL', 'Amount entered: 250 mcg', '250 mcg = 0.25 mg. 1 mg = 1000 mcg.', 'Concentration: 5 mg ÷ 2 mL = 2.5 mg/mL',
    'Volume: 0.25 mg ÷ 2.5 mg/mL = 0.1 mL', 'U-100 units for what you entered: 0.1 mL × 100 = 10',
  ]);
  expect(text('converter-note')).toBe('This is the arithmetic of what you entered. It is not a recommendation.');
  expect(screen.queryByTestId('converter-over')).toBeNull();

  const words = everyWord(screen.toJSON());
  expect(words).toContain('The lines below are the arithmetic of what you entered, including U-100 units (mL × 100). What you type stays on this screen.');
  expect(words).not.toMatch(/desired|to draw|reconstitut|calculator|syringe|inject|needle|recommended (?:dose|amount)|typical|usual|suggested/i);

  await type('converter-amount-input', '3000');
  expect(text('converter-over')).toBe('Over 100 units');
  expect(screen.getByTestId('converter-scale').props.style.width).toBe('100%');

  await press('converter-vial-unit-IU');
  expect(text('converter-detail')).toBe('The vial unit and the amount unit are not the same, so there is no volume from what you entered.');
  expect(text('converter-volume')).toBe('–');
});

test('Save shows only for a saved dose item, and writes the note without logging anything', async () => {
  const itemId = savedDose();
  await open({ itemId, converter: true });
  expect(screen.getByText('Saves the volume and U-100 units on this item. It does not log a dose, and it does not suggest an amount.')).toBeTruthy();
  expect(screen.getByTestId('converter-save').props.accessibilityState.disabled).toBe(true);
  await type('converter-vial-input', '5');
  await type('converter-water-input', '2');
  await type('converter-amount-input', '250');
  await press('converter-amount-unit-mcg');
  await press('converter-save');

  const saved = stored(repo);
  expect(saved.items.find((row) => row.id === itemId)).toMatchObject({ note: '0.1 mL · 10 U-100 units. What you entered. Not a recommendation.', calcVial: 5, calcWater: 2, calcVialUnit: 'mg' });
  expect(saved.logs).toHaveLength(0);
  expect(saved.compounds.find((row) => row.id === saved.items[0].compoundId)).toMatchObject({ amount: 250, unit: 'mcg' });
  // It stays on the converter, with the result said once. Close then dismisses the sheet.
  expect(screen.getByRole('header', { name: 'Concentration converter' })).toBeTruthy();
  expect(text('converter-toast')).toMatchObject({ props: { children: 'Note saved.' } });
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Note saved.');
  expect(router.back).not.toHaveBeenCalled();
  await press('converter-done');
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('a saved check item gets the converter with no Save', async () => {
  await open({ itemId: savedDose('check'), converter: true });
  expect(screen.getByRole('header', { name: 'Concentration converter' })).toBeTruthy();
  expect(screen.queryByTestId('converter-save')).toBeNull();
  // A check item has no amount to carry in.
  expect(screen.getByTestId('converter-amount-input').props.value).toBe('');
  // Close dismisses the sheet. It does not land on an item form nobody opened.
  await press('converter-done');
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('header', { name: 'Edit item' })).toBeNull();
});

test('opened with no item, from the Peptides tab, it has no Save and Close dismisses it', async () => {
  savedDose();
  await open({ converter: true });
  expect(screen.getByRole('header', { name: 'Concentration converter' })).toBeTruthy();
  expect(screen.getByTestId('converter-amount-input').props.value).toBe('');
  expect(screen.queryByTestId('converter-save')).toBeNull();
  expect(screen.queryByTestId('converter-back')).toBeNull();
  // With no item there is no Save line to say it, so the intro says it: arithmetic only, never an amount to take.
  expect(screen.getByTestId('converter-intro').props.children).toMatch(/It does not suggest an amount\.$/);
  expect(everyWord(screen.toJSON())).not.toMatch(/recommended|you should|suggested (dose|amount)|typical|usual dose/i);
  await press('converter-done');
  expect(router.back).toHaveBeenCalledTimes(1);
});
