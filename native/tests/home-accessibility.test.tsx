// Home, the choice controls and field outlines at accessibility sizes and with VoiceOver (A11Y-08, A11Y-09, A11Y-15,
// review-plan S3). Made-up sample data only.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { saveFood, attributedDay, meals } from '../src/features/food/model';
import { useAuth } from '../src/auth/provider';
import Home from '../src/app/(tabs)/index';
import Appearance from '../src/features/settings/appearance';
import { SegmentedControl } from '../src/components/segmented-control';
import { useFieldOutline } from '../src/components/field-outline';
import { formatAppearance, parseAppearance, DEFAULT_APPEARANCE } from '../src/design/looks';
import type { Repository } from '../src/data/repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const window = Dimensions.get('window'), screenSize = Dimensions.get('screen');
const setFontScale = (fontScale: number) => Dimensions.set({ window: { ...window, fontScale }, screen: { ...screenSize, fontScale } });
const oats = { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
function open(demo = false) {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo } as ReturnType<typeof useAuth>);
  return repo;
}
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};
type Node = { type: unknown; parent: Node | null; props: { style?: unknown } };
/** The host View a text sits in. */
const rowOf = (node: Node) => { let up = node.parent; while (up && up.type !== 'View') up = up.parent; return up!; };
let hours: jest.SpyInstance;
beforeEach(() => { hours = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10); });
afterEach(() => { hours.mockRestore(); setFontScale(1); });

describe('Home at accessibility text sizes', () => {
  test.each([[1, false], [3, true]] as const)('at %sx the date and greeting share the button row only at small sizes (own line: %s)', async (scale, own) => {
    setFontScale(scale);
    open(true);
    await render(<Home />, { wrapper });
    const heading = screen.getByTestId('home-heading');
    expect(flat(heading).flexBasis).toBe(own ? '100%' : undefined);
    expect(flat(screen.getByTestId('home-header')).flexWrap).toBe('wrap');
    // The Example data chip wraps under the date instead of splitting inside its words.
    expect(flat(rowOf(within(heading).getByText('Example data') as unknown as Node)).flexWrap).toBe('wrap');
    // Settings, Edit and the score stay first, so the header reads in the same order.
    const header = screen.getByTestId('home-header').children as { props: { testID?: string } }[];
    expect(header.findIndex(child => child.props.testID === 'home-heading')).toBe(own ? header.length - 1 : 1);
  });

  test.each([[1, '48.5%'], [3, '100%']] as const)('at %sx a small number tile is %s wide and its number can wrap', async (scale, width) => {
    setFontScale(scale);
    const repo = open();
    const view = await render(<Home />, { wrapper });
    await act(async () => { const day = attributedDay(); saveFood(repo, day, meals(repo)[0].id, oats, 1, undefined, day); });
    await view.rerender(<Home />);
    const tile = screen.getByTestId('home-tile-protein');
    expect(StyleSheet.flatten(typeof tile.props.style === 'function' ? tile.props.style({ pressed: false }) : tile.props.style).width).toBe(width);
    expect(flat(rowOf(within(tile).getByText('5') as unknown as Node)).flexWrap).toBe('wrap');
  });
});

describe('the + menu with VoiceOver (A11Y-15)', () => {
  test('while it is open only the menu is reachable, and the escape gesture closes it', async () => {
    open();
    await render(<Home />, { wrapper });
    const behind = screen.getByTestId('home-behind-menu');
    expect(behind.props.accessibilityElementsHidden).toBe(false);
    expect(behind.props.importantForAccessibility).toBe('auto');
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(behind.props.accessibilityElementsHidden).toBe(true);
    expect(behind.props.importantForAccessibility).toBe('no-hide-descendants');
    // iOS sends the escape gesture to the focused element and then up its parents: from a menu item and from
    // the Close area it must reach a view that closes the menu.
    const escapeFrom = (node: { parent: unknown; props: Record<string, unknown> }) => {
      for (let up: typeof node | null = node; up; up = up.parent as typeof node | null) if (typeof up.props.onAccessibilityEscape === 'function') return up;
      return null;
    };
    expect(escapeFrom(screen.getByRole('button', { name: 'Close' }) as never)?.props.testID).toBe('home-root');
    expect(escapeFrom(screen.getByRole('button', { name: 'Log food' }) as never)?.props.testID).toBe('home-root');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();
    const close = escapeFrom(screen.getByRole('button', { name: 'Close' }) as never)!;
    await act(async () => { (close.props.onAccessibilityEscape as () => void)(); });
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    expect(behind.props.accessibilityElementsHidden).toBe(false);
    expect(screen.getByTestId('home-root').props.onAccessibilityEscape).toBeUndefined();
  });
});

describe('choice controls at accessibility sizes (S3)', () => {
  const options = [{ value: 'routines', label: 'Routines' }, { value: 'history', label: 'History' }, { value: 'exercises', label: 'Exercises' }] as const;
  test.each([[1, '28%'], [1.6, '100%'], [3, '100%']] as const)('at %sx each of three choices has basis %s', async (scale, basis) => {
    setFontScale(scale);
    await render(<SegmentedControl label="View" options={options} value="routines" onChange={() => {}} />, { wrapper });
    for (const tab of screen.getAllByRole('tab')) expect(flat(tab).flexBasis).toBe(basis);
  });
  test('four choices pair up at small sizes and take a line each at large ones', async () => {
    const four = [...options, { value: 'plans', label: 'Plans' }];
    const view = await render(<SegmentedControl label="View" options={four} value="routines" onChange={() => {}} />, { wrapper });
    expect(flat(screen.getAllByRole('tab')[0]).flexBasis).toBe('45%');
    await act(async () => { setFontScale(2); });
    await view.rerender(<SegmentedControl label="View" options={four} value="routines" onChange={() => {}} />);
    expect(flat(screen.getAllByRole('tab')[0]).flexBasis).toBe('100%');
  });
});

describe('Field outlines in Appearance (A11Y-09)', () => {
  test('the look is saved in the existing setting only when it is not the default, and old values still read', () => {
    expect(DEFAULT_APPEARANCE.fields).toBe('auto');
    expect(formatAppearance(DEFAULT_APPEARANCE)).not.toContain('fields');
    const outlined = { ...DEFAULT_APPEARANCE, fields: 'outlined' as const };
    expect(formatAppearance(outlined)).toMatch(/;fields=outlined$/);
    expect(parseAppearance(formatAppearance(outlined)).fields).toBe('outlined');
    expect(parseAppearance(`${DEFAULT_APPEARANCE.palette};fields=bogus`).fields).toBe('auto');
  });

  test('choosing Always draws the outline without Increase Contrast, and the default does not', async () => {
    let saved: Record<string, unknown> | null = null;
    const listeners = new Set<() => void>();
    const repo = {
      list: () => saved ? [{ id: 'made-up-settings', updated_at: 1, deleted_at: null, data: saved }] : [],
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      save: (_table: string, data: Record<string, unknown>) => { saved = data; listeners.forEach(listener => listener()); },
    } as unknown as Repository;
    let outline: ReturnType<typeof useFieldOutline> = null, colors: ReturnType<typeof useTheme>['colors'] | null = null;
    function Probe() { outline = useFieldOutline(); colors = useTheme().colors; return null; }
    await render(<ThemeProvider repository={repo}><Appearance /><Probe /></ThemeProvider>);
    expect(screen.getByRole('tab', { name: 'With Increase Contrast' })).toBeSelected();
    expect(outline).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'Always' }));
    expect(screen.getByRole('tab', { name: 'Always' })).toBeSelected();
    expect(String(saved!.accent)).toContain(';fields=outlined');
    expect(outline).toEqual({ borderWidth: 1, borderColor: colors!['text-muted'] });
  });
});

describe('the body chart point with VoiceOver (A11Y-01)', () => {
  test('moving to another point says it once; the first draw stays quiet', async () => {
    const { AccessibilityInfo } = require('react-native') as typeof import('react-native');
    const { BodyChart } = require('../src/features/body/chart') as typeof import('../src/features/body/chart');
    // Queued, so it waits for VoiceOver to finish the button's name and state instead of cutting it off.
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
    spoken.mockClear();
    const points = [
      { day: '2026-10-01', kg: 80, count: 1, trendKg: 80 },
      { day: '2026-10-02', kg: 79.6, count: 1, trendKg: 79.9 },
    ];
    await render(<BodyChart points={points} raw={points.map(({ day, kg }) => ({ day, kg }))} unit="kg" />, { wrapper });
    expect(spoken).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Previous trend point' }));
    const said = screen.getByTestId('body-chart-point');
    expect(spoken.mock.calls).toEqual([[expect.stringMatching(/^Oct 1 · Trend 80\.0 kg/), { queue: true }]]);
    expect(said).toHaveTextContent(spoken.mock.calls[0][0] as string);
    spoken.mockRestore();
  });
});

test('with the floating bar, the escape gesture on the + closes the open menu', async () => {
  const { DockButton } = require('../src/components/floating-tabs') as typeof import('../src/components/floating-tabs');
  const onPress = jest.fn();
  const view = await render(<DockButton action={{ label: 'Add', expanded: false, onPress }} />, { wrapper });
  expect(screen.getByTestId('dock-action').props.onAccessibilityEscape).toBeUndefined();
  await view.rerender(<DockButton action={{ label: 'Add', expanded: true, onPress }} />);
  await act(async () => { screen.getByTestId('dock-action').props.onAccessibilityEscape(); });
  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each([[1, 56, 'nowrap'], [3, 96, 'wrap']] as const)('at %sx the Score card ring is %i pt and its title row is %s', async (scale, size, wrap) => {
  setFontScale(scale);
  open();
  await render(<Home />, { wrapper });
  const top = screen.getByTestId('home-score-top');
  expect(flat(top).flexWrap).toBe(wrap);
  const ring = top.queryAll((node: { type: unknown; props: { style?: unknown } }) => node.type === 'View' && flat(node).width === size && flat(node).height === size);
  expect(ring.length).toBeGreaterThan(0);
});
