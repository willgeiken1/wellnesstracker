import { fireEvent, render, screen } from '@testing-library/react-native';
import { useAuth } from '../src/auth/provider';
import { AddItemSheet } from '../src/features/routines-ui/add-item';
import { saveItem } from '../src/features/routines/model/actions';
import { change, everyWord, seededRepository, wrapper } from './routines-sheets-kit';

/* The converter sits behind one build flag so it can be cut. This file runs the sheet with the flag off. */
jest.mock('../src/features/routines-ui/converter-flag', () => ({ CONCENTRATION_CONVERTER_ENABLED: false }));
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

test('with the flag off there is no link, no converter step and no mention of it', async () => {
  const repo = seededRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  const { itemId } = change(repo, (store, clock, newId) => saveItem(store, { name: 'Sample vial', kind: 'dose', amount: '250', unit: 'mcg', type: 'peptide', time: '', blockIds: [], onHand: '', mixedOn: '' }, clock, newId))!;
  await render(<AddItemSheet itemId={itemId} />, { wrapper });
  expect(screen.getByRole('header', { name: 'Edit item' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Peptide' }).props.accessibilityState.checked).toBe(true);
  expect(screen.queryByTestId('item-converter')).toBeNull();
  expect(screen.queryByTestId('converter')).toBeNull();
  expect(everyWord(screen.toJSON())).not.toMatch(/converter|U-100|vial amount/i);
  // The dose card still works without it.
  await fireEvent.press(screen.getByRole('button', { name: 'Add 10' }));
  expect(screen.getByTestId('item-dose-input').props.value).toBe('260');
});
