import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/provider';
import type { Repository } from '../src/data/repository';
import { EditRoutines } from '../src/features/routines-ui/edit-routines';
import { hideBlock, saveBlock } from '../src/features/routines/model/blocks';
import { projectRoutineStore } from '../src/features/routines/model/shape';
import { change, seededRepository, stored, wrapper } from './routines-sheets-kit';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

/* Synthetic routine names only. */
let repo: Repository;
let said: jest.SpyInstance;
const shown = () => projectRoutineStore(stored(repo))!.blocks.map((row) => row.name);
const block = (name: string) => stored(repo).blocks.find((row) => row.name === name)!;
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  repo = seededRepository();
  change(repo, (store, clock, newId) => saveBlock(store, { name: 'Midday reset', startMin: 720, endMin: 840, days: [0, 1, 2, 3, 4], color: 'pink' }, clock, newId));
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  jest.mocked(router.push).mockClear();
  said = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

test('it lists the routines in page order and moves one a place at a time, saved at once', async () => {
  await render(<EditRoutines />, { wrapper });
  expect(screen.getByRole('header', { name: 'Edit routines' })).toBeTruthy();
  expect(screen.getByTestId('edit-routines-intro').props.children).toBe('Move, retime and recolor routines. Hiding one keeps its items and history.');
  expect(shown()).toEqual(['Morning routine', 'Night routine', 'Midday reset']);
  expect(screen.getByText('12:00–14:00')).toBeTruthy();
  expect(screen.getByText('Weekdays')).toBeTruthy();
  expect(button('Move Morning routine up').props.accessibilityState.disabled).toBe(true);
  expect(button('Move Midday reset down').props.accessibilityState.disabled).toBe(true);

  await fireEvent.press(button('Move Midday reset up'));
  expect(shown()).toEqual(['Morning routine', 'Midday reset', 'Night routine']);
  expect(said).toHaveBeenLastCalledWith('Midday reset, 2 of 3');
  await fireEvent.press(button('Move Midday reset up'));
  expect(shown()).toEqual(['Midday reset', 'Morning routine', 'Night routine']);
  expect(button('Move Midday reset up').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(button('Move Morning routine down'));
  expect(shown()).toEqual(['Midday reset', 'Night routine', 'Morning routine']);
});

test('Edit opens that routine\'s sheet and New routine opens an empty one', async () => {
  await render(<EditRoutines />, { wrapper });
  await fireEvent.press(button('Edit Night routine'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/edit/[id]', params: { id: block('Night routine').id } });
  await fireEvent.press(button('New routine'));
  expect(router.push).toHaveBeenLastCalledWith('/routines/new');
});

test('a hidden routine sits under Hidden and Restore puts it back at the end of the page', async () => {
  const night = block('Night routine').id;
  await render(<EditRoutines />, { wrapper });
  expect(screen.queryByRole('header', { name: 'Hidden' })).toBeNull();
  change(repo, (store, clock) => hideBlock(store, night, clock));
  await screen.findByRole('header', { name: 'Hidden' });
  expect(shown()).toEqual(['Morning routine', 'Midday reset']);
  expect(screen.queryByRole('button', { name: 'Move Night routine up' })).toBeNull();

  await fireEvent.press(button('Restore Night routine'));
  expect(shown()).toEqual(['Morning routine', 'Midday reset', 'Night routine']);
  expect(stored(repo).blocks.find((row) => row.id === night)?.hidden).not.toBe(true);
  expect(screen.queryByRole('header', { name: 'Hidden' })).toBeNull();
  expect(said).toHaveBeenLastCalledWith('Night routine, 3 of 3');
});
