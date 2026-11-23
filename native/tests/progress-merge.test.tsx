import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions, PixelRatio, StyleSheet } from 'react-native';
import { selectionAsync } from 'expo-haptics';
import Progress from '../src/app/(tabs)/progress';
import { SectionTabs } from '../src/components/section-tabs';
import { SegmentedControl } from '../src/components/segmented-control';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { linkedPlace, readPlace } from '../src/features/progress/views';
import { useOuraRecovery } from '../src/features/health/use-oura-recovery';
import { useRecovery } from '../src/features/health/use-recovery';
import { track } from '../src/telemetry/sdk';
import { memoryRepository } from './workout-repository';

// Made-up accounts only. The health hooks are stood in, so nothing here reads a health source.
let mockRepository: ReturnType<typeof memoryRepository> | null = null;
// The router's side of the screen: whether the tab is in front and the link it was opened with. Kept in a small
// store so a change redraws the screen, as the real hooks do.
const mockRoute = { focused: true, params: {} as Record<string, string | undefined>, listeners: new Set<() => void>() };
const mockSubscribe = (listener: () => void) => { mockRoute.listeners.add(listener); return () => { mockRoute.listeners.delete(listener); }; };
const mockSetParams = jest.fn((next: Record<string, string | undefined>) => { mockRoute.params = { ...mockRoute.params, ...next }; mockRoute.listeners.forEach(listener => listener()); });
const route = (next: { focused?: boolean; params?: Record<string, string | undefined> }) => act(async () => { Object.assign(mockRoute, next); mockRoute.listeners.forEach(listener => listener()); });
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: mockRepository }) }));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: () => require('react').useSyncExternalStore(mockSubscribe, () => mockRoute.focused) }));
jest.mock('../src/features/health/use-recovery', () => ({ useRecovery: jest.fn(() => ({ access: 'unavailable', recovery: null })) }));
jest.mock('../src/features/health/use-oura-recovery', () => ({ useOuraRecovery: jest.fn(() => null) }));
jest.mock('../src/telemetry/sdk', () => ({ track: jest.fn() }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined), impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => require('react').useSyncExternalStore(mockSubscribe, () => mockRoute.params),
  useNavigation: () => ({ setParams: mockSetParams }),
}));

const page = () => <ThemeProvider><Progress /></ThemeProvider>;
const tab = (name: string) => screen.getByRole('tab', { name });
const press = (name: string) => fireEvent.press(tab(name));
const sections = () => within(screen.getByTestId('section-tabs')).getAllByRole('tab').map(node => node.props.accessibilityLabel);
const reads = () => [...jest.mocked(useRecovery).mock.calls, ...jest.mocked(useOuraRecovery).mock.calls].map(call => call[0]);
const tablists = () => screen.container.queryAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'tablist');
const account = (owner: string) => Object.assign(memoryRepository(), { owner });

beforeEach(() => {
  mockRepository = memoryRepository(); mockRoute.focused = true; mockRoute.params = {};
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.clearAllMocks();
});

describe('one screen, two views', () => {
  test('first ever open is Tracking on Body, under the title Progress', async () => {
    await render(page());
    expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy();
    expect(tab('Tracking')).toBeSelected();
    expect(tab('Insights')).not.toBeSelected();
    expect(sections()).toEqual(['Body', 'Photos', 'Goals & PRs']);
    expect(tab('Body')).toBeSelected();
    expect(screen.getByRole('button', { name: 'Log weigh-in' })).toBeTruthy();
  });
  test('all seven sections are kept, in their order, each with its own content', async () => {
    await render(page());
    await press('Photos');
    expect(screen.getByTestId('photos-later')).toBeTruthy();
    await press('Goals & PRs');
    expect(screen.getByRole('header', { name: 'Lifetime' })).toBeTruthy();
    await press('Insights');
    expect(sections()).toEqual(['Trends', 'Recovery', 'Muscles', 'Weekly']);
    expect(screen.getByTestId('insights-empty')).toBeTruthy();
    await press('Recovery');
    expect(screen.getByTestId('recovery-later')).toBeTruthy();
    await press('Muscles');
    expect(screen.getByText('Front')).toBeTruthy();
    await press('Weekly');
    expect(screen.getByTestId('weekly-report')).toBeTruthy();
    // One view's content never shows under the other.
    expect(screen.queryByTestId('photos-later')).toBeNull();
  });
  test('VoiceOver hears a View switch, then Sections, and the section shown after a view change', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await render(page());
    // In reading order: the title and Settings come first, then the two controls, then the content.
    const lists = tablists();
    expect(lists.slice(0, 2).map(node => node.props.accessibilityLabel)).toEqual(['View', 'Sections']);
    expect(within(lists[0]).getAllByRole('tab').map(node => node.props.accessibilityLabel)).toEqual(['Tracking', 'Insights']);
    expect(say).not.toHaveBeenCalled();
    await press('Insights');
    expect(say).toHaveBeenLastCalledWith('Insights, Trends');
    await press('Weekly');
    await press('Tracking');
    expect(say).toHaveBeenLastCalledWith('Tracking, Body');
    await press('Tracking');
    await press('Photos');
    // Only a real change of view is spoken; the section tabs say their own state.
    expect(say).toHaveBeenCalledTimes(2);
    say.mockRestore();
  });
});

describe('remembering the place', () => {
  test('the view and each view\'s section are saved on the phone as they are chosen, and nothing else is', async () => {
    const repo = mockRepository!, local = jest.spyOn(repo, 'localSave'), save = jest.spyOn(repo, 'save');
    await render(page());
    expect(local).not.toHaveBeenCalled();
    await press('Goals & PRs');
    await press('Insights');
    await press('Muscles');
    expect(local.mock.calls).toEqual([['progress.section.tracking', 'goals'], ['progress.view', 'insights'], ['progress.section.insights', 'muscles']]);
    await press('Muscles');
    await press('Insights');
    expect(local).toHaveBeenCalledTimes(3);
    // Never a synced row.
    expect(save).not.toHaveBeenCalled();
  });
  test('switching view brings back that view\'s last section', async () => {
    await render(page());
    await press('Photos');
    await press('Insights');
    await press('Weekly');
    await press('Tracking');
    expect(tab('Photos')).toBeSelected();
    await press('Insights');
    expect(tab('Weekly')).toBeSelected();
  });
  test('a relaunch opens where it was left', async () => {
    const first = await render(page());
    await press('Photos');
    await press('Insights');
    await press('Weekly');
    await first.unmount();
    await render(page());
    expect(tab('Insights')).toBeSelected();
    expect(tab('Weekly')).toBeSelected();
    expect(screen.getByTestId('weekly-report')).toBeTruthy();
    await press('Tracking');
    expect(tab('Photos')).toBeSelected();
  });
  test('anything unknown in memory falls back to the default', () => {
    const kept = (values: Record<string, unknown>) => readPlace({ localGet: <T,>(key: string) => values[key] as T });
    expect(readPlace(null)).toEqual({ view: 'tracking', tracking: 'body', insights: 'trends' });
    expect(kept({ 'progress.view': 'routines', 'progress.section.tracking': 'weekly', 'progress.section.insights': 7 }))
      .toEqual({ view: 'tracking', tracking: 'body', insights: 'trends' });
    expect(kept({ 'progress.view': 'insights', 'progress.section.insights': 'recovery', 'progress.section.tracking': ['goals'] }))
      .toEqual({ view: 'insights', tracking: 'body', insights: 'recovery' });
  });
  test('each account has its own place, and another account never inherits it', async () => {
    const one = account('made-up-one'), two = account('made-up-two');
    mockRepository = one;
    const view = await render(page());
    await press('Insights');
    mockRepository = two;
    await view.rerender(page());
    expect(tab('Tracking')).toBeSelected();
    expect(two.localGet('progress.view')).toBeUndefined();
    mockRepository = one;
    await view.rerender(page());
    expect(tab('Insights')).toBeSelected();
  });
  test('with no account the place lives in memory while the tab does', async () => {
    mockRepository = null;
    const view = await render(page());
    await press('Insights');
    await press('Muscles');
    await view.rerender(page());
    expect(tab('Muscles')).toBeSelected();
  });
});

describe('a link wins over memory, once', () => {
  test('the link is applied, saved and cleared, with no tick', async () => {
    const repo = mockRepository!;
    repo.localSave('progress.view', 'tracking');
    mockRoute.params = { view: 'insights', section: 'weekly' };
    const view = await render(page());
    expect(tab('Insights')).toBeSelected();
    expect(tab('Weekly')).toBeSelected();
    expect(repo.localGet('progress.view')).toBe('insights');
    expect(repo.localGet('progress.section.insights')).toBe('weekly');
    expect(mockSetParams).toHaveBeenCalledWith({ view: undefined, section: undefined });
    expect(selectionAsync).not.toHaveBeenCalled();
    expect(mockRoute.params).toEqual({ view: undefined, section: undefined });
    // Cleared, so a later choice by hand stands.
    await press('Tracking');
    await view.rerender(page());
    expect(tab('Tracking')).toBeSelected();
    expect(mockSetParams).toHaveBeenCalledTimes(1);
  });
  test('a Home tile link opens Tracking on Body even when Insights was open last, on the tab already drawn', async () => {
    await render(page());
    await press('Insights');
    await press('Recovery');
    jest.clearAllMocks();
    // Home is in front; the tile then brings Progress forward with its link.
    await route({ focused: false });
    await route({ focused: true, params: { view: 'tracking', section: 'body' } });
    expect(tab('Tracking')).toBeSelected();
    expect(tab('Body')).toBeSelected();
    // The remembered Recovery section never gets to read on the way.
    expect(reads()).not.toContain(true);
    expect(mockRepository!.localGet('progress.view')).toBe('tracking');
    // The Insights view keeps its own last section for next time.
    expect(mockRepository!.localGet('progress.section.insights')).toBe('recovery');
  });
  test('links outside the lists are refused, and a section alone names its view', () => {
    expect(linkedPlace({})).toBeUndefined();
    expect(linkedPlace({ view: 'routines', section: 'peptides' })).toBeUndefined();
    expect(linkedPlace({ view: ['insights'], section: ['weekly'] })).toBeUndefined();
    expect(linkedPlace({ view: 'insights' })).toEqual({ view: 'insights', section: undefined });
    expect(linkedPlace({ section: 'muscles' })).toEqual({ view: 'insights', section: 'muscles' });
    expect(linkedPlace({ section: 'goals' })).toEqual({ view: 'tracking', section: 'goals' });
    expect(linkedPlace({ view: 'tracking', section: 'weekly' })).toEqual({ view: 'tracking', section: undefined });
  });
  test('a link with nothing usable changes nothing and is still cleared', async () => {
    const local = jest.spyOn(mockRepository!, 'localSave');
    mockRoute.params = { view: 'nonsense', section: 'nonsense' };
    await render(page());
    expect(tab('Tracking')).toBeSelected();
    expect(tab('Body')).toBeSelected();
    expect(local).not.toHaveBeenCalled();
    expect(mockSetParams).toHaveBeenCalledTimes(1);
  });
});

describe('haptics', () => {
  test('one tick when the view or the section really changes; none on open, on a re-tap or on restore', async () => {
    const first = await render(page());
    expect(selectionAsync).not.toHaveBeenCalled();
    await press('Tracking');
    await press('Body');
    expect(selectionAsync).not.toHaveBeenCalled();
    await press('Photos');
    expect(selectionAsync).toHaveBeenCalledTimes(1);
    await press('Insights');
    expect(selectionAsync).toHaveBeenCalledTimes(2);
    await press('Weekly');
    expect(selectionAsync).toHaveBeenCalledTimes(3);
    await first.unmount();
    await render(page());
    expect(tab('Weekly')).toBeSelected();
    expect(selectionAsync).toHaveBeenCalledTimes(3);
  });
  test('the Haptics switch in Settings turns the ticks off', async () => {
    mockRepository!.localSave('haptics', false);
    await render(page());
    await press('Insights');
    await press('Muscles');
    expect(selectionAsync).not.toHaveBeenCalled();
  });
});

describe('health is read only for Recovery, in front', () => {
  test('neither health hook is switched on anywhere on Tracking', async () => {
    await render(page());
    for (const name of ['Photos', 'Goals & PRs', 'Body']) await press(name);
    // On Tracking the Insights view is not drawn at all, so the hooks do not even run.
    expect(useRecovery).not.toHaveBeenCalled();
    expect(useOuraRecovery).not.toHaveBeenCalled();
  });
  test('on Insights both switch on for Recovery only, and off again when another tab is in front', async () => {
    await render(page());
    await press('Insights');
    for (const name of ['Muscles', 'Weekly', 'Trends']) await press(name);
    expect(reads().length).toBeGreaterThan(0);
    expect(reads()).not.toContain(true);
    await press('Recovery');
    expect(jest.mocked(useRecovery).mock.lastCall?.[0]).toBe(true);
    expect(jest.mocked(useOuraRecovery).mock.lastCall?.[0]).toBe(true);
    await route({ focused: false });
    expect(jest.mocked(useRecovery).mock.lastCall?.[0]).toBe(false);
    expect(jest.mocked(useOuraRecovery).mock.lastCall?.[0]).toBe(false);
    await route({ focused: true });
    expect(jest.mocked(useRecovery).mock.lastCall?.[0]).toBe(true);
    jest.clearAllMocks();
    await press('Tracking');
    expect(reads()).not.toContain(true);
  });
  test('a remembered Recovery section does not read while another tab is in front', async () => {
    mockRepository!.localSave('progress.view', 'insights');
    mockRepository!.localSave('progress.section.insights', 'recovery');
    mockRoute.focused = false;
    await render(page());
    expect(tab('Recovery')).toBeSelected();
    expect(reads()).not.toContain(true);
  });
});

describe('the Insights view keeps its clock and its count', () => {
  test('insights_opened fires each time the Insights view comes to the front, with nothing attached', async () => {
    await render(page());
    expect(track).not.toHaveBeenCalled();
    await press('Insights');
    expect(jest.mocked(track).mock.calls).toEqual([['insights_opened']]);
    // Moving between its sections is not a new opening.
    await press('Muscles');
    await press('Weekly');
    expect(track).toHaveBeenCalledTimes(1);
    await press('Tracking');
    await press('Insights');
    expect(track).toHaveBeenCalledTimes(2);
    // Leaving for another tab and coming back counts; sitting behind another tab does not.
    await route({ focused: false });
    expect(track).toHaveBeenCalledTimes(2);
    await route({ focused: true });
    expect(track).toHaveBeenCalledTimes(3);
  });
  test('the minute clock runs only while the Insights view is shown', async () => {
    const start = jest.spyOn(global, 'setInterval'), stop = jest.spyOn(global, 'clearInterval');
    const minuteClocks = () => start.mock.calls.flatMap((call, index) => call[1] === 60000 ? [start.mock.results[index].value] : []);
    try {
      await render(page());
      for (const name of ['Photos', 'Goals & PRs']) await press(name);
      expect(minuteClocks()).toHaveLength(0);
      await press('Insights');
      await press('Weekly');
      expect(minuteClocks()).toHaveLength(1);
      expect(stop).not.toHaveBeenCalledWith(minuteClocks()[0]);
      await press('Tracking');
      expect(stop).toHaveBeenCalledWith(minuteClocks()[0]);
      expect(minuteClocks()).toHaveLength(1);
    } finally { start.mockRestore(); stop.mockRestore(); }
  });
});

describe('the section tabs', () => {
  const options = [{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }, { value: 'c', label: 'Third' }] as const;
  // A saved appearance, as Settings writes it, so both modes can be drawn.
  const saved = (theme: string) => ({
    list: () => [{ ...syntheticRow('settings'), data: { theme_override: theme, accent: 'seaGlassTide' } } as Row],
    subscribe: () => () => {}, save: jest.fn(),
  }) as unknown as Repository;
  const draw = (onChange = jest.fn(), mode: 'light' | 'dark' = 'light') => render(<ThemeProvider repository={saved(mode)}>
    <SectionTabs label="Made-up sections" options={options} value="b" onChange={onChange} /></ThemeProvider>);
  test('a tablist of tabs, each at least 44 points, that say which is chosen', async () => {
    const onChange = jest.fn();
    await draw(onChange);
    const [list] = tablists();
    expect(list.props.accessibilityLabel).toBe('Made-up sections');
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map(node => node.props.accessibilityLabel)).toEqual(['First', 'Second', 'Third']);
    expect(tabs.map(node => node.props.accessibilityState.selected)).toEqual([false, true, false]);
    for (const node of tabs) {
      const style = StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      // Grows with the text: never a fixed height.
      expect(style.height).toBeUndefined();
    }
    await fireEvent.press(tabs[2]);
    expect(onChange).toHaveBeenCalledWith('c');
  });
  test.each(['light', 'dark'] as const)('in %s the chosen tab is the text colour with a 2pt line under it, the rest are muted, over a hairline', async mode => {
    await draw(jest.fn(), mode);
    const colors = createTheme(mode, 'seaGlassTide');
    const label = (name: string) => StyleSheet.flatten(within(screen.getByRole('tab', { name })).getByText(name).props.style);
    expect(label('Second')).toMatchObject({ color: colors.text, fontWeight: '600' });
    expect(label('First')).toMatchObject({ color: colors['text-muted'], fontWeight: '600' });
    const lines = screen.getAllByTestId('section-tabs-underline');
    expect(lines).toHaveLength(1);
    expect(StyleSheet.flatten(lines[0].props.style)).toMatchObject({ height: 2, bottom: 0, backgroundColor: colors.text });
    expect(within(screen.getByRole('tab', { name: 'Second' })).getByTestId('section-tabs-underline')).toBeTruthy();
  });
  test('the row scrolls sideways edge to edge, and labels are never cut short or shrunk', async () => {
    await draw();
    const list = screen.getByTestId('section-tabs');
    expect(list.props.horizontal).toBe(true);
    expect(list.props.showsHorizontalScrollIndicator).toBe(false);
    for (const name of ['First', 'Second', 'Third']) {
      const text = within(screen.getByRole('tab', { name })).getByText(name);
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.adjustsFontSizeToFit).toBeUndefined();
      expect(text.props.allowFontScaling).toBe(true);
    }
  });
});

describe('the view switch at very large text', () => {
  const basis = (name: string) => StyleSheet.flatten(screen.getByRole('tab', { name }).props.style).flexBasis;
  const choices = [{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }] as const;
  test('SegmentedControl stacks its choices only when asked', async () => {
    const view = await render(<ThemeProvider><SegmentedControl label="Made-up" options={choices} value="a" onChange={() => {}} /></ThemeProvider>);
    expect(basis('First')).toBe('28%');
    await view.rerender(<ThemeProvider><SegmentedControl label="Made-up" options={choices} value="a" onChange={() => {}} stack /></ThemeProvider>);
    expect(basis('First')).toBe('100%');
    expect(basis('Second')).toBe('100%');
  });
  test.each([[1, '28%'], [1.9, '28%'], [2, '100%'], [3.1, '100%']])('at text size x%s each choice of Tracking | Insights takes %s of the row', async (scale, expected) => {
    const getDimensions = Dimensions.get;
    const dimensions = jest.spyOn(Dimensions, 'get').mockImplementation(key => ({ ...getDimensions(key), fontScale: scale }));
    const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(scale);
    try {
      await render(page());
      expect(basis('Tracking')).toBe(expected);
      expect(basis('Insights')).toBe(expected);
    } finally { dimensions.mockRestore(); fontScale.mockRestore(); }
  });
});
