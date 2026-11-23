import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import Routines from '../src/app/(tabs)/routines';
import { ROUTINES_DAY_VIEW, routineRoutes } from '../src/features/routines-ui/entry-points';
import { SAMPLE_NOW, seededRepository } from './routines-repository';

/* A Home tile opens the Routines tab on the tab that holds its item. Made-up routines only. */

let mockParams: { view?: string } = {};
const mockListeners = new Set<() => void>();
const mockSetParams = jest.fn((next: { view?: string }) => { mockParams = { ...mockParams, ...next }; mockListeners.forEach(listener => listener()); });
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => require('react').useSyncExternalStore((listener: () => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); }, () => mockParams),
  useNavigation: () => ({ setParams: mockSetParams }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
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
