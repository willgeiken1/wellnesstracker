import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import Routines from '../src/app/(tabs)/routines';
import { ROUTINES_DAY_VIEW, routineRoutes } from '../src/features/routines-ui/entry-points';
import type { Repository } from '../src/data/repository';
import { SAMPLE, SAMPLE_NOW, seededRepository, stored } from './routines-repository';

/* A Home tile opens the Routines tab on the tab that holds its item. Made-up routines only. */

type Params = { view?: string; blockId?: string; itemId?: string };
let mockParams: Params = {};
const mockListeners = new Set<() => void>();
const mockSetParams = jest.fn((next: Params) => { mockParams = { ...mockParams, ...next }; mockListeners.forEach(listener => listener()); });
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => require('react').useSyncExternalStore((listener: () => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); }, () => mockParams),
  useNavigation: () => ({ setParams: mockSetParams }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
const expanded = (blockId: string) => screen.getByTestId(`routine-fold-${blockId}`).props.accessibilityState.expanded;
const selected = (name: string) => screen.getByRole('tab', { name }).props.accessibilityState.selected;
function open() {
  jest.mocked(useAuth).mockReturnValue({ repository: seededRepository() } as ReturnType<typeof useAuth>);
  return render(<ThemeProvider><Routines /></ThemeProvider>);
}
beforeEach(() => {
  mockParams = {}; mockSetParams.mockClear();
  jest.useFakeTimers({ now: SAMPLE_NOW, doNotFake: [...KEEP_REAL] });
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('the tab route carries a type tab only when one is asked for', () => {
  expect(routineRoutes.tab()).toEqual({ pathname: '/routines', params: {} });
  expect(routineRoutes.tab('peptide')).toEqual({ pathname: '/routines', params: { view: 'peptide' } });
  expect(routineRoutes.tab(ROUTINES_DAY_VIEW)).toEqual({ pathname: '/routines', params: { view: 'routines' } });
  expect(routineRoutes.tab(ROUTINES_DAY_VIEW, { blockId: 'b', itemId: '' })).toEqual({ pathname: '/routines', params: { view: 'routines', blockId: 'b' } });
  expect(routineRoutes.tab('peptide', { blockId: '', itemId: 'i' })).toEqual({ pathname: '/routines', params: { view: 'peptide', itemId: 'i' } });
});
test('with no link the tab opens on the day', async () => {
  await open();
  expect(selected('Routines')).toBe(true);
  expect(mockSetParams).not.toHaveBeenCalled();
});
test('a link opens the type tab it names, once: it comes off the route and a choice by hand then holds', async () => {
  mockParams = { view: 'peptide' };
  await open();
  expect(selected('Peptides')).toBe(true);
  expect(mockSetParams).toHaveBeenCalledWith({ view: undefined });
  await fireEvent.press(screen.getByRole('tab', { name: 'Routines' }));
  expect(selected('Routines')).toBe(true);
  // The same tile tapped again asks again, and is followed again.
  await act(() => { mockSetParams({ view: 'peptide' }); });
  expect(selected('Peptides')).toBe(true);
});
test('left on a type tab, a link to the day brings the day back, and comes off the route', async () => {
  await open();
  await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
  expect(selected('Peptides')).toBe(true);
  await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW }); });
  expect(selected('Routines')).toBe(true);
  expect(mockSetParams).toHaveBeenLastCalledWith({ view: undefined });
  // A link with no view leaves the tab where it was, which is why a tile names the day.
  await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
  await act(() => { mockSetParams({}); });
  expect(selected('Peptides')).toBe(true);
});
test('a link to a tab that is not there falls back to the day', async () => {
  mockParams = { view: 'nonsense' };
  await open();
  expect(selected('Routines')).toBe(true);
});

/* Eight in the morning: Morning is the current routine, so Night starts folded and draws no rows. */
describe('a link that names a routine or an item', () => {
  test('opens a routine that is not the current one, once: it can be folded by hand and the link reopens it', async () => {
    await open();
    expect(expanded(SAMPLE.night)).toBe(false);
    expect(screen.queryByTestId(`routine-row-${SAMPLE.wind}`)).toBeNull();
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night }); });
    expect(expanded(SAMPLE.night)).toBe(true);
    expect(screen.getByTestId(`routine-row-${SAMPLE.wind}`)).toBeTruthy();
    // The link came off the route whole, and the routine it opened stays open.
    expect(mockParams).toEqual({});
    expect(mockSetParams).toHaveBeenLastCalledWith({ view: undefined, blockId: undefined, itemId: undefined });
    expect(expanded(SAMPLE.night)).toBe(true);
    await fireEvent.press(screen.getByTestId(`routine-fold-${SAMPLE.night}`));
    expect(expanded(SAMPLE.night)).toBe(false);
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night }); });
    expect(expanded(SAMPLE.night)).toBe(true);
  });
  test('opens the routine that holds the item it names, as the tab first draws', async () => {
    mockParams = { view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night, itemId: SAMPLE.wind };
    await open();
    expect(screen.getByTestId(`routine-row-${SAMPLE.wind}`)).toBeTruthy();
    expect(expanded(SAMPLE.morning)).toBe(true);
  });
  test('finds the routine from the item alone, coming from a type tab', async () => {
    await open();
    await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, itemId: SAMPLE.wind }); });
    expect(selected('Routines')).toBe(true);
    expect(screen.getByTestId(`routine-row-${SAMPLE.wind}`)).toBeTruthy();
  });
  test('is let go once a tab is picked by hand, and a routine or item that is gone opens nothing', async () => {
    await open();
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night }); });
    await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Routines' }));
    expect(expanded(SAMPLE.night)).toBe(false);
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: 'gone', itemId: 'gone' }); });
    expect(expanded(SAMPLE.night)).toBe(false);
    expect(expanded(SAMPLE.morning)).toBe(true);
  });
});

/* Focus mode at eight in the morning shows Morning alone. A Home tile can still point at Night. */
describe('a link while Focus mode is on', () => {
  const block = (id: string) => screen.queryByTestId(`routine-block-${id}`);
  let repo: Repository;
  function openFocused(params: Params = {}) {
    mockParams = params;
    repo = seededRepository(store => { store.prefs.focusMode = true; });
    jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
    return render(<ThemeProvider><Routines /></ThemeProvider>);
  }
  test('shows the routine it names beside the one in focus, and leaves Focus mode on', async () => {
    await openFocused();
    expect(block(SAMPLE.morning)).toBeTruthy();
    expect(block(SAMPLE.night)).toBeNull();
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night }); });
    expect(block(SAMPLE.morning)).toBeTruthy();
    expect(block(SAMPLE.night)).toBeTruthy();
    expect(expanded(SAMPLE.night)).toBe(true);
    expect(screen.getByTestId(`routine-row-${SAMPLE.wind}`)).toBeTruthy();
    expect(screen.queryByTestId('routine-focus-done')).toBeNull();
    expect(stored(repo).prefs.focusMode).toBe(true);
  });
  test('shows the routine that holds the item it names, as the tab first draws', async () => {
    await openFocused({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night, itemId: SAMPLE.wind });
    expect(screen.getByTestId(`routine-row-${SAMPLE.wind}`)).toBeTruthy();
    expect(block(SAMPLE.morning)).toBeTruthy();
    expect(stored(repo).prefs.focusMode).toBe(true);
  });
  test('finds the routine from the item alone', async () => {
    await openFocused();
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, itemId: SAMPLE.wind }); });
    expect(screen.getByTestId(`routine-row-${SAMPLE.wind}`)).toBeTruthy();
    expect(stored(repo).prefs.focusMode).toBe(true);
  });
  test('the routine it brought in is put away from its header, comes back with the link, and goes when a tab is picked by hand', async () => {
    await openFocused();
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night }); });
    await fireEvent.press(screen.getByTestId(`routine-fold-${SAMPLE.night}`));
    expect(block(SAMPLE.night)).toBeNull();
    expect(block(SAMPLE.morning)).toBeTruthy();
    // Putting it away is not a fold: nothing about the routine is saved.
    expect(stored(repo).prefs.collapsedBlocks ?? []).toEqual([]);
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.night }); });
    expect(block(SAMPLE.night)).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Routines' }));
    expect(block(SAMPLE.night)).toBeNull();
    expect(block(SAMPLE.morning)).toBeTruthy();
  });
  test('a link to the routine already in focus, or to one that is gone, changes nothing', async () => {
    await openFocused({ view: ROUTINES_DAY_VIEW, blockId: SAMPLE.morning });
    expect(block(SAMPLE.morning)).toBeTruthy();
    expect(block(SAMPLE.night)).toBeNull();
    await act(() => { mockSetParams({ view: ROUTINES_DAY_VIEW, blockId: 'gone', itemId: 'gone' }); });
    expect(block(SAMPLE.morning)).toBeTruthy();
    expect(block(SAMPLE.night)).toBeNull();
  });
});
