import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, PixelRatio } from 'react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import type { Repository } from '../src/data/repository';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import Routines from '../src/app/(tabs)/routines';
import { AddItemSheet } from '../src/features/routines-ui/add-item';
import { ItemDetails } from '../src/features/routines-ui/details';
import { RoutinesSettings } from '../src/features/routines-ui/settings';
import { SAMPLE, SAMPLE_NOW, seededRepository } from './routines-repository';

/* The converter sits behind one build flag so it can be cut. This file runs every screen that could draw it,
   name it or link to it with the flag off. Add item with the flag off is in routines-converter-flag.test.tsx. */
jest.mock('../src/features/routines-ui/converter-flag', () => ({ CONCENTRATION_CONVERTER_ENABLED: false }));
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
function show(repo: Repository, page: ReactElement) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  return render(<ThemeProvider>{page}</ThemeProvider>);
}
const everyText = () => (screen.root?.queryAll(node => (node.type as unknown) === 'Text') ?? []).map(node => node.props.children).flat(4).filter(part => typeof part === 'string').join(' ');
const everyLabel = () => (screen.root?.queryAll(node => typeof node.props.accessibilityLabel === 'string' || typeof node.props.accessibilityHint === 'string') ?? [])
  .map(node => `${node.props.accessibilityLabel ?? ''} ${node.props.accessibilityHint ?? ''}`).join(' ');
const nowhere = () => {
  expect(everyText()).not.toMatch(/converter|U-100|vial amount/i);
  expect(everyLabel()).not.toMatch(/converter|U-100/i);
};
/** No peptide item and nothing added, so every part the settings can offer is listed. */
const bare = () => seededRepository(store => {
  store.items = store.items.filter(item => item.id !== SAMPLE.vial);
  store.placements = store.placements.filter(place => place.itemId !== SAMPLE.vial);
  store.prefs.added = [];
});

beforeEach(() => {
  const real = Dimensions.get;
  jest.spyOn(Dimensions, 'get').mockImplementation(key => ({ ...real(key), fontScale: 1 }));
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
  jest.useFakeTimers({ now: SAMPLE_NOW, doNotFake: [...KEEP_REAL] });
  jest.mocked(router.push).mockClear(); jest.mocked(router.back).mockClear();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('with the converter cut from the build', () => {
  test('the Peptides tab keeps its other tools and has no converter tool', async () => {
    await show(seededRepository(), <Routines />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
    expect(screen.queryByTestId('routine-tool-converter')).toBeNull();
    expect(screen.getByTestId('routine-tool-sites')).toBeTruthy();
    expect(screen.getByTestId('routine-tool-add')).toBeTruthy();
    nowhere();
  });
  test('a dose item\'s details have no converter button and no hint about it', async () => {
    await show(seededRepository(), <ItemDetails itemId={SAMPLE.vial} />);
    expect(screen.getByRole('header', { name: 'Zzyq Sample Vial' })).toBeTruthy();
    expect(screen.queryByTestId('details-converter')).toBeNull();
    expect(screen.getByTestId('details-edit-item')).toBeTruthy();
    nowhere();
  });
  test('settings drop the converter note, its question and its part, with a peptide item on the page', async () => {
    await show(seededRepository(), <RoutinesSettings />);
    expect(screen.queryByTestId('routines-converter-note')).toBeNull();
    expect(screen.queryByText('What does the converter show?')).toBeNull();
    nowhere();
  });
  test('settings do not offer the converter as a part to add, and the tabs part does not promise it', async () => {
    await show(bare(), <RoutinesSettings />);
    expect(screen.queryByTestId('routines-add-calculator')).toBeNull();
    expect(screen.getByTestId('routines-add-enhancers')).toBeTruthy();
    expect(screen.getByText('Peptides and Enhancers tabs, with dose amounts and supply.')).toBeTruthy();
    nowhere();
  });
  test('the converter route, reached by an old link, closes and draws nothing', async () => {
    await show(seededRepository(), <AddItemSheet itemId={SAMPLE.vial} converter />);
    expect(screen.queryByTestId('converter')).toBeNull();
    expect(screen.queryByTestId('item-name')).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);
    nowhere();
  });
});
