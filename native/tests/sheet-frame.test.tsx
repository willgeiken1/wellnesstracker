// A sheet at a fixed height can get no height from its screen on iOS, which left the Push Pull Legs setup sheet, Log
// food and Water showing their header over a blank body. Every such sheet's content sits in a frame that falls back to
// the sheet's own height while its screen gives it none. Made-up sample data only.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { ThemeProvider } from '../src/design/theme-provider';
import { COLLAPSED, SheetFrame, sheetDetent, sheetScreenLayout } from '../src/features/navigation/sheet-frame';
import { largeSheet, mediumSheet, fittedSheet, pushedScreen } from '../src/features/navigation/presentation';
import { SplitStore } from '../src/features/splits/store';
import { SplitSetupSheet } from '../src/features/splits/sheets';
import { SPLIT_PRESETS } from '../src/features/splits/presets';
import { LogSheet } from '../src/features/food/log-sheet';
import { WaterSheet } from '../src/features/food/water-sheet';
import { closeCart } from '../src/features/food/cart';
import { saveFood } from '../src/features/food/model';
import { drinksOn, readWater } from '../src/features/food/water';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn(), canDismiss: () => true, canGoBack: () => true },
  useIsFocused: () => true, useLocalSearchParams: () => ({}), useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }),
}));
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
/** The frame's measuring view, and the height style of the view that holds the sheet. */
function frame() {
  const inner = screen.getByTestId('sheet-frame');
  return { outer: inner.parent!, style: () => StyleSheet.flatten(inner.props.style) };
}
const DAY = '2026-10-28', LUNCH = 'fd000000-0000-4000-8000-000000000001';
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null };
const rice = { name: 'Synthetic rice', energy_kj: 200 * 4.184, protein_g: 4, carbs_g: 44, fat_g: 1, amount_g: 150, ...blank };

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0));
  mockRepository = memoryRepository(); new SplitStore(mockRepository as never); closeCart();
});
afterEach(() => jest.useRealTimers());

describe('which screens get the frame', () => {
  test('large and medium sheets by their top detent; the fitted sheet, pushed screens and plain screens not at all', () => {
    expect(sheetDetent(largeSheet)).toBe(1);
    const medium = sheetDetent(mediumSheet('rest-timer'))!;
    expect(medium).toBeGreaterThan(0);
    expect(medium).toBeLessThan(1);
    expect(sheetDetent(fittedSheet)).toBeNull();
    expect(sheetDetent(pushedScreen)).toBeNull();
    expect(sheetDetent({ headerShown: false })).toBeNull();
    expect(sheetDetent(undefined)).toBeNull();
    expect(sheetDetent({ presentation: 'formSheet' })).toBe(1);
  });

  test('a screen that is not a fixed sheet is passed through untouched', async () => {
    await render(sheetScreenLayout({ options: pushedScreen, children: <Text>Page</Text> }), { wrapper });
    expect(screen.getByText('Page')).toBeTruthy();
    expect(screen.queryByTestId('sheet-frame')).toBeNull();
  });
});

describe('the frame', () => {
  test('on iOS a large sheet always holds the large sheet height, whatever its screen measures', async () => {
    await render(sheetScreenLayout({ options: largeSheet, children: <Text>Body</Text> }), { wrapper });
    const f = frame();
    expect(f.style().flex).toBeUndefined();
    expect(f.style().height).toBeGreaterThan(500);
    await fireEvent(f.outer, 'layout', layout(780));
    expect(f.style().height).toBeGreaterThan(500);
    expect(screen.getByText('Body')).toBeTruthy();
  });

  test('on iOS a medium sheet holds its own share of the large sheet', async () => {
    const detent = sheetDetent(mediumSheet('rest-timer'))!;
    await render(<SheetFrame detent={detent}><Text>Body</Text></SheetFrame>, { wrapper });
    const height = frame().style().height as number;
    expect(height).toBeGreaterThan(0);
    await render(<SheetFrame detent={1}><Text>Body</Text></SheetFrame>, { wrapper });
    expect(height).toBeLessThan(frame().style().height as number);
  });

  test('elsewhere a sheet fills its screen, and takes its own height only while the screen gives it none', async () => {
    await render(<SheetFrame detent={1} ios={false}><Text>Body</Text></SheetFrame>, { wrapper });
    const f = frame();
    expect(f.style().flex).toBe(1);
    await fireEvent(f.outer, 'layout', layout(COLLAPSED - 1));
    expect(f.style().flex).toBeUndefined();
    expect(f.style().height).toBeGreaterThan(500);
    await act(async () => {});
    await fireEvent(f.outer, 'layout', layout(780));
    expect(f.style().flex).toBe(1);
  });
});

describe('the scroll view a sheet holds', () => {
  /** The host views react-native-screens walks on iOS: from the frame, each first child down until one has none. */
  function firstChildChain(node: ReactTestRendererJSON): string[] {
    const chain: string[] = [];
    let at: ReactTestRendererJSON | undefined = node;
    while (at) {
      chain.push(`${at.type}${at.props.testID ? `#${at.props.testID}` : ''}`);
      const first: unknown = at.children?.[0];
      at = first && typeof first === 'object' ? first as ReactTestRendererJSON : undefined;
    }
    return chain;
  }
  function frameNode(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): ReactTestRendererJSON {
    const all = Array.isArray(node) ? node : node ? [node] : [];
    for (const n of all) {
      if (n.props.testID === 'sheet-frame') return n;
      const kids = (n.children ?? []).filter((c): c is ReactTestRendererJSON => typeof c === 'object');
      for (const k of kids) { try { return frameNode(k); } catch { /* keep looking */ } }
    }
    throw new Error('no sheet frame');
  }

  // Add a tile and Edit tile opened black on iPhone: their body is a scroll view inside this frame, and on iOS the
  // sheet moved the first scroll view on that path to its own frame, a sheet's height below where it belonged.
  test('on iOS the first-child path from the frame ends at an empty stop before the sheet\'s scroll view', async () => {
    await render(sheetScreenLayout({ options: largeSheet, children: <ScrollView testID="body"><Text>Tiles</Text></ScrollView> }), { wrapper });
    const chain = firstChildChain(frameNode(screen.toJSON()));
    expect(chain).toEqual(['View#sheet-frame', 'View#sheet-scroll-stop']);
    const stop = screen.getByTestId('sheet-scroll-stop', { includeHiddenElements: true });
    expect(stop.props.collapsable).toBe(false);
    expect(stop.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(stop.props.style)).toMatchObject({ position: 'absolute', width: 0, height: 0 });
    expect(screen.getByText('Tiles')).toBeTruthy();
  });

  test('the stop is hidden from screen readers and takes no space', async () => {
    await render(<SheetFrame detent={1}><Text>Body</Text></SheetFrame>, { wrapper });
    const stop = screen.getByTestId('sheet-scroll-stop', { includeHiddenElements: true });
    expect(stop.props.accessible).toBe(false);
    expect(stop.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(stop.children).toHaveLength(0);
  });
});

describe('the sheets that opened blank', () => {
  test.each(SPLIT_PRESETS.map(p => [p.name, p.key] as const))('the %s setup sheet shows its blurb, days and buttons in the frame', async (name, key) => {
    await render(sheetScreenLayout({ options: largeSheet, children: <SplitSetupSheet presetKey={key} /> }), { wrapper });
    const preset = SPLIT_PRESETS.find(p => p.key === key)!;
    expect(preset.name).toBe(name);
    await fireEvent(frame().outer, 'layout', layout(0));
    expect(frame().style().height).toBeGreaterThan(500);
    expect(screen.getByText(preset.blurb)).toBeTruthy();
    for (const d of preset.days) expect(screen.getAllByText(d.name).length).toBeGreaterThan(0);
    expect(screen.getByTestId('split-use')).toBeTruthy();
    expect(screen.getByTestId('split-customize')).toBeTruthy();
  });

  test('Log food shows its body in the frame and logs a picked food into lunch', async () => {
    saveFood(mockRepository, DAY, LUNCH, rice);
    await render(sheetScreenLayout({ options: largeSheet, children: <LogSheet repo={mockRepository} meal={LUNCH} /> }), { wrapper });
    await fireEvent(frame().outer, 'layout', layout(0));
    expect(frame().style().height).toBeGreaterThan(500);
    expect(screen.getByTestId('food-log-search')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add Synthetic rice' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Log 1 food to Lunch/ }));
    expect(mockRepository.list('food_entries').filter(r => r.data.name === 'Synthetic rice')).toHaveLength(2);
  });

  test('Water shows its body in the frame and logs a drink with one tap', async () => {
    const cup = readWater(mockRepository).containers.find(c => c.quick)!;
    await render(sheetScreenLayout({ options: largeSheet, children: <WaterSheet repo={mockRepository} /> }), { wrapper });
    await fireEvent(frame().outer, 'layout', layout(0));
    expect(frame().style().height).toBeGreaterThan(500);
    await fireEvent.press(screen.getAllByRole('button', { name: new RegExp(`^Add ${cup.name}`) })[0]);
    expect(drinksOn(readWater(mockRepository), DAY).map(d => d.oz)).toEqual([cup.oz]);
  });
});
