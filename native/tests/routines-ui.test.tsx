import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, PixelRatio, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { Repository } from '../src/data/repository';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import Routines from '../src/app/(tabs)/routines';
import { ROW_STACKS_AT } from '../src/features/routines-ui/day-view';
import { DAY_BOX, sunDay, sunGeometry } from '../src/features/routines-ui/sun-model';
import { SUN_TEXT_INSIDE } from '../src/features/routines-ui/sun-path';
import { projectRoutineStore, type RoutineView } from '../src/features/routines/model/shape';
import { routineSunAxis } from '../src/features/routines/model/now';
import { routinesTab } from '../src/i18n/en';
import { SAMPLE, SAMPLE_DAY, SAMPLE_NOW, logOf, routinesRepository, sampleStore, seededRepository, stored, vialLog } from './routines-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
function open(repo: Repository | null) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  return render(<ThemeProvider><Routines /></ThemeProvider>);
}
const row = (id: string) => screen.getByTestId(`routine-row-${id}`);
const everyText = () => (screen.root?.queryAll(node => (node.type as unknown) === 'Text') ?? []).map(node => node.props.children).flat(4).filter(part => typeof part === 'string').join(' ');

/** Jest's phone reports text at twice the size; these tests start at the ordinary size and raise it on purpose. */
function textSize(fontScale: number) {
  const real = Dimensions.get;
  jest.spyOn(Dimensions, 'get').mockImplementation(key => ({ ...real(key), fontScale }));
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(fontScale);
}
beforeEach(() => {
  textSize(1);
  jest.useFakeTimers({ now: SAMPLE_NOW, doNotFake: [...KEEP_REAL] });
  jest.mocked(router.push).mockClear();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('the sun path', () => {
  test('time maps to x along the axis and the dome peaks over the centre', () => {
    const geometry = sunGeometry(routineSunAxis([]), DAY_BOX);
    expect(geometry.x(5 * 60)).toBeCloseTo(18);
    expect(geometry.x(23 * 60)).toBeCloseTo(274);
    expect(geometry.x(14 * 60)).toBeCloseTo(146);
    expect(geometry.y(146)).toBeCloseTo(26);
    expect(geometry.y(18)).toBeCloseTo(122);
    expect(geometry.arc(300, 300)).toBe('');
    expect(geometry.arc(300, 660)).toMatch(/^M18 122 A128 96 0 0 1 /);
    expect(geometry.minuteAt(146)).toBeCloseTo(14 * 60);
  });
  test('a day gives one window per timed routine, one pin per item, and the counts', () => {
    const view = projectRoutineStore(sampleStore(store => { store.logs = [vialLog(SAMPLE_DAY)]; })) as RoutineView;
    const day = sunDay(view, SAMPLE_DAY);
    expect(day.windows.map(window => [window.startMin, window.endMin])).toEqual([[300, 660], [1260, 1380]]);
    expect(day.pins).toHaveLength(4);
    expect(day.pins.find(pin => pin.id === SAMPLE.vial)).toMatchObject({ minute: 480, done: true, color: 'citrus' });
    // An item with no time of its own sits at the start of its routine.
    expect(day.pins.find(pin => pin.id === SAMPLE.wind)).toMatchObject({ minute: 1260, done: false, color: 'pink' });
    expect(day.legend).toEqual([
      { id: SAMPLE.morning, name: 'Morning', color: 'citrus', done: 1, total: 3 },
      { id: SAMPLE.night, name: 'Night', color: 'pink', done: 0, total: 1 },
    ]);
    expect([day.total, day.left]).toEqual([4, 3]);
  });
  test('it is one picture for VoiceOver, takes no touches, and reads the whole day', async () => {
    await open(seededRepository());
    const path = screen.getByTestId('sun-path');
    expect(path.props.accessibilityRole).toBe('image');
    expect(path.props.accessibilityLabel).toBe('Sun path, 05:00 to 23:00. Now 08:00. 4 left today. Morning 0 of 3. Night 0 of 1. Next: Zzyq Sample Vial, now.');
    expect(within(path).queryAllByRole('button')).toHaveLength(0);
    expect(path.queryAll(node => typeof node.props.onPress === 'function' || typeof node.props.onResponderRelease === 'function')).toHaveLength(0);
    expect(screen.getByTestId('sun-clock')).toHaveTextContent('08:00');
    expect(screen.getByTestId('sun-caption')).toHaveTextContent('4 left today');
    expect(screen.getAllByTestId('sun-window')).toHaveLength(2);
    expect(screen.getAllByTestId('sun-pin-open')).toHaveLength(4);
  });
  test('the clock sits inside the dome at ordinary text sizes and above the drawing at large ones', async () => {
    await open(seededRepository());
    expect(StyleSheet.flatten(screen.getByTestId('sun-text').props.style).position).toBe('absolute');
    await screen.unmount();
    jest.restoreAllMocks();
    textSize(SUN_TEXT_INSIDE + 0.2);
    await open(seededRepository());
    expect(StyleSheet.flatten(screen.getByTestId('sun-text').props.style).position).toBeUndefined();
  });
});

describe('the day view', () => {
  test('the rail keeps the clock time until the item is due, and does not say Now ahead of time', async () => {
    // Twenty minutes early the line above counts down, so the rail keeps the clock time.
    jest.setSystemTime(new Date(2026, 10, 23, 7, 40, 0));
    await open(seededRepository());
    expect(row(SAMPLE.vial).props.accessibilityLabel).toContain('08:00');
    expect(row(SAMPLE.vial).props.accessibilityLabel).not.toContain('Now');
    expect(everyText()).toContain('in 20 min');
  });
  test('an open item that is overdue, with nothing else ahead of it, reads Now', async () => {
    jest.setSystemTime(new Date(2026, 10, 23, 8, 30, 0));
    await open(seededRepository(store => { store.items = store.items.filter(item => item.id === SAMPLE.vial); store.placements = store.placements.filter(place => place.itemId === SAMPLE.vial); }));
    expect(row(SAMPLE.vial).props.accessibilityLabel).toContain('Now');
  });
  test('a row is one checkbox with its name, amount and time, and Skip, Undo and Details as its actions', async () => {
    await open(seededRepository());
    const dose = row(SAMPLE.vial);
    expect(dose.props.accessibilityRole).toBe('checkbox');
    expect(dose.props.accessibilityState).toMatchObject({ checked: false });
    // It is due at this minute, so the rail says Now in place of the time.
    // The sample count was typed on the 1st, three weeks back, so its supply line reads as run down.
    expect(dose.props.accessibilityLabel).toBe('Zzyq Sample Vial, 3 units, Now, Low supply, 20 on hand, 0 days left');
    expect(screen.getByTestId(`routine-supply-${SAMPLE.vial}`)).toHaveTextContent('Low supply · 20 on hand · 0 days left');
    expect(screen.queryByTestId(`routine-supply-${SAMPLE.walk}`)).toBeNull();
    expect(row(SAMPLE.walk).props.accessibilityLabel).toBe('Zzyq Walk, 10:00');
    expect(dose.props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual(['Skip', 'Details']);
    expect(StyleSheet.flatten(dose.props.style).minHeight).toBe(56);
  });
  test('tapping an open row logs it; a done row offers Undo and opens details', async () => {
    const repo = seededRepository();
    await open(repo);
    await fireEvent.press(row(SAMPLE.stretch));
    expect(logOf(repo, SAMPLE.stretch)).toMatchObject({ status: 'done' });
    expect(row(SAMPLE.stretch).props.accessibilityState).toMatchObject({ checked: true });
    expect(row(SAMPLE.stretch).props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual(['Undo', 'Details']);
    await fireEvent.press(row(SAMPLE.stretch));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/item', params: { itemId: SAMPLE.stretch, logId: logOf(repo, SAMPLE.stretch)?.id } });
    await fireEvent.press(screen.getByTestId(`routine-undo-${SAMPLE.stretch}`, { includeHiddenElements: true }));
    expect(logOf(repo, SAMPLE.stretch)).toBeNull();
    expect(row(SAMPLE.stretch).props.accessibilityState).toMatchObject({ checked: false });
  });
  test('Skip marks the row handled without ticking it, and the VoiceOver actions do the same work', async () => {
    const repo = seededRepository();
    await open(repo);
    await fireEvent.press(screen.getByTestId(`routine-skip-${SAMPLE.walk}`, { includeHiddenElements: true }));
    expect(logOf(repo, SAMPLE.walk)).toMatchObject({ status: 'skipped' });
    expect(row(SAMPLE.walk).props.accessibilityState).toMatchObject({ checked: false });
    expect(row(SAMPLE.walk).props.accessibilityLabel).toContain('Skipped');
    await fireEvent(row(SAMPLE.walk), 'accessibilityAction', { nativeEvent: { actionName: 'undo' } });
    expect(logOf(repo, SAMPLE.walk)).toBeNull();
    await fireEvent(row(SAMPLE.stretch), 'accessibilityAction', { nativeEvent: { actionName: 'skip' } });
    expect(logOf(repo, SAMPLE.stretch)).toMatchObject({ status: 'skipped' });
    await fireEvent(row(SAMPLE.vial), 'accessibilityAction', { nativeEvent: { actionName: 'details' } });
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/item', params: { itemId: SAMPLE.vial } });
  });
  test('Log all logs what is open, says so, and its Undo takes back only those logs', async () => {
    const repo = seededRepository(store => { store.logs = [{ ...vialLog(SAMPLE_DAY) }]; });
    const timers = jest.spyOn(globalThis, 'setTimeout');
    await open(repo);
    const button = screen.getByTestId(`routine-log-all-${SAMPLE.morning}`);
    expect(button.props.accessibilityLabel).toBe('Log all in Morning');
    await fireEvent.press(button);
    expect(logOf(repo, SAMPLE.stretch)).toMatchObject({ status: 'done' });
    expect(logOf(repo, SAMPLE.walk)).toMatchObject({ status: 'done' });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Logged 2 in Morning. Undo available.');
    expect(within(screen.getByTestId('routine-toast')).getByText('Logged')).toBeTruthy();
    await act(async () => {});
    expect(timers.mock.calls.some(call => call[1] === 3000)).toBe(true);
    // With fewer than two open, the button is gone.
    expect(screen.queryByTestId(`routine-log-all-${SAMPLE.morning}`)).toBeNull();
    await fireEvent.press(screen.getByTestId('routine-toast-undo'));
    expect(logOf(repo, SAMPLE.stretch)).toBeNull();
    expect(logOf(repo, SAMPLE.walk)).toBeNull();
    // The dose logged before Log all is left alone.
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ status: 'done', amount: 3 });
    expect(screen.queryByTestId('routine-toast')).toBeNull();
  });
  test('the toast stays ten seconds while VoiceOver is on', async () => {
    jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
    const timers = jest.spyOn(globalThis, 'setTimeout');
    await open(seededRepository());
    await fireEvent.press(screen.getByTestId(`routine-log-all-${SAMPLE.morning}`));
    await act(async () => {});
    expect(timers.mock.calls.some(call => call[1] === 10_000)).toBe(true);
    expect(timers.mock.calls.some(call => call[1] === 3000)).toBe(false);
  });
  test('a routine that is not current is folded to one line and opens on a tap', async () => {
    await open(seededRepository());
    const fold = screen.getByTestId(`routine-fold-${SAMPLE.night}`);
    expect(fold.props.accessibilityLabel).toBe('Night, 0 of 1 done');
    expect(fold.props.accessibilityState).toMatchObject({ expanded: false });
    expect(StyleSheet.flatten(fold.props.style).minHeight).toBe(56);
    expect(within(fold).getByText('from 21:00 · 0/1')).toBeTruthy();
    expect(screen.queryByTestId(`routine-row-${SAMPLE.wind}`)).toBeNull();
    await fireEvent.press(fold);
    expect(row(SAMPLE.wind)).toBeTruthy();
    expect(screen.getByTestId(`routine-fold-${SAMPLE.night}`).props.accessibilityState).toMatchObject({ expanded: true });
  });
  test('folding the current routine is remembered on the phone', async () => {
    const repo = seededRepository();
    await open(repo);
    expect(within(screen.getByTestId(`routine-block-${SAMPLE.morning}`)).getByText('05:00–11:00 · 0/3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`routine-fold-${SAMPLE.morning}`));
    expect(stored(repo).prefs.collapsedBlocks).toEqual([SAMPLE.morning]);
    expect(screen.queryByTestId(`routine-row-${SAMPLE.stretch}`)).toBeNull();
  });
  test('Focus mode shows only the routine for this time of day', async () => {
    await open(seededRepository(store => { store.prefs.focusMode = true; }));
    expect(screen.getByTestId(`routine-block-${SAMPLE.morning}`)).toBeTruthy();
    expect(screen.queryByTestId(`routine-block-${SAMPLE.night}`)).toBeNull();
  });
  test('the streak chip shows once there is a streak, and a rest day can be logged and taken back', async () => {
    const repo = seededRepository();
    await open(repo);
    expect(screen.queryByTestId('routine-streak')).toBeNull();
    await fireEvent.press(screen.getByTestId('routine-rest'));
    expect(stored(repo).logs.some(log => log.rest === true && log.deletedAt === null)).toBe(true);
    expect(screen.getByText('Rest logged')).toBeTruthy();
    // A rest day covers every routine, so Log all would write nothing. It is not offered, and the page says why.
    expect(screen.queryByTestId(`routine-log-all-${SAMPLE.morning}`)).toBeNull();
    expect(screen.getByTestId('routine-rest-note')).toHaveTextContent('Rest day. Nothing is due today.');
    await fireEvent.press(screen.getByTestId('routine-rest-undo'));
    expect(stored(repo).logs.some(log => log.rest === true && log.deletedAt === null)).toBe(false);
    expect(screen.getByTestId('routine-rest')).toBeTruthy();
    expect(screen.getByTestId(`routine-log-all-${SAMPLE.morning}`)).toBeTruthy();
    expect(screen.queryByTestId('routine-rest-note')).toBeNull();
  });
  test('the foot row and the header lead to New routine, Edit routines, History, settings and Add item', async () => {
    await open(seededRepository());
    const pushed = async (id: string) => { await fireEvent.press(screen.getByTestId(id)); return jest.mocked(router.push).mock.lastCall?.[0]; };
    expect(await pushed('routine-new')).toBe('/routines/new');
    expect(await pushed('routine-edit')).toBe('/routines/edit');
    expect(await pushed('routine-history')).toBe('/routines/history');
    expect(await pushed('routines-settings')).toBe('/routines/settings');
    expect(screen.getByTestId('routines-settings').props.accessibilityLabel).toBe('Routines settings');
    expect(await pushed('routines-add')).toEqual({ pathname: '/routines/add-item', params: {} });
    expect(screen.getByTestId('routines-add').props.accessibilityLabel).toBe('Add item');
  });
  test('with nothing added it offers setup and a first item, and the sun path still draws with no pins', async () => {
    const repo = routinesRepository();
    await open(repo);
    // Morning and Night are added the first time the tab opens.
    expect(stored(repo).blocks.map(block => block.name)).toEqual(['Morning routine', 'Night routine']);
    expect(screen.getByRole('header', { name: 'Add your first item' })).toBeTruthy();
    expect(screen.getByText('Add something you do or take. It shows on the sun path at its time.')).toBeTruthy();
    expect(screen.getByTestId('sun-caption')).toHaveTextContent('Nothing planned');
    expect(screen.queryAllByTestId('sun-pin-open')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('routine-empty-add'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/add-item', params: {} });
    await fireEvent.press(screen.getByRole('button', { name: 'Start setup' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/setup', params: {} });
  });
  test('with no data to read it still opens, empty', async () => {
    await open(null);
    expect(screen.getByRole('header', { name: 'Routines' })).toBeTruthy();
    expect(screen.getByTestId('sun-path')).toBeTruthy();
  });
  test('at the largest text sizes a row puts its time above its name', async () => {
    jest.restoreAllMocks();
    textSize(ROW_STACKS_AT);
    await open(seededRepository());
    const texts = within(row(SAMPLE.walk)).getAllByText(/Zzyq Walk|10:00/);
    expect(texts.map(node => node.props.children)).toEqual(['10:00', 'Zzyq Walk']);
    expect(texts[0].parent).toBe(texts[1].parent);
  });
});

describe('the type tabs', () => {
  const openPeptides = async (repo: Repository) => {
    await open(repo);
    await fireEvent.press(screen.getByRole('tab', { name: 'Peptides' }));
  };
  test('Peptides has three tools named for what they do, and never a calculator', async () => {
    await openPeptides(seededRepository());
    expect(screen.getByRole('tab', { name: 'Routines' })).toBeTruthy();
    const tools = within(screen.getByTestId('routine-tools')).getAllByRole('button').map(node => node.props.accessibilityLabel);
    expect(tools).toEqual(['Concentration converter', 'Injection sites', 'Add a peptide']);
    await fireEvent.press(screen.getByTestId('routine-tool-converter'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/add-item', params: { step: 'converter' } });
    await fireEvent.press(screen.getByTestId('routine-tool-sites'));
    expect(router.push).toHaveBeenLastCalledWith('/routines/sites');
    await fireEvent.press(screen.getByTestId('routine-tool-add'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/add-item', params: { type: 'peptide' } });
    expect(everyText()).not.toMatch(/calculator|reconstitut/i);
  });
  test('a card reads what is left, where it sits, this week, what is next and the last site as one element', async () => {
    await openPeptides(seededRepository(store => {
      store.logs = [vialLog('2026-11-21', { site: 'left-belly' }), vialLog('2026-11-22', { site: 'right-thigh' })];
    }));
    const card = screen.getByTestId(`routine-gauge-${SAMPLE.vial}`);
    expect(card.props.accessibilityLabel).toBe('Zzyq Sample Vial, 3 units. 18 of 20 doses left. Low supply, 20 on hand, 0 days left. Morning, Daily, 08:00. Next: now. Last site: Right thigh.');
    expect(screen.getByTestId('routine-gauge-left')).toHaveTextContent('18');
    expect(within(card).getByText('of 20')).toBeTruthy();
    // 23 November 2026 is a Monday: nothing taken yet this week, and Monday is outlined as today.
    expect(within(card).getAllByTestId('routine-week-open')).toHaveLength(7);
    expect(screen.getByTestId('routine-type-note')).toHaveTextContent('The ring shows doses left from the count you typed. Each one sits on the sun path at its time.');
    await fireEvent.press(card);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/item', params: { itemId: SAMPLE.vial } });
  });
  test('an item on a type tab and in no routine is logged, skipped and undone from its card', async () => {
    // Added from the Peptides tab with no routine picked: it has no row on the day view, so the card is where it is logged.
    const repo = seededRepository(store => { store.placements = store.placements.filter(place => place.itemId !== SAMPLE.vial); });
    await openPeptides(repo);
    // The visible Log, Skip and Undo are hidden from VoiceOver, which gets them as the card's actions instead.
    const card = () => screen.getByTestId(`routine-gauge-${SAMPLE.vial}`);
    expect(card().props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual(['Log', 'Skip', 'Details']);
    await fireEvent.press(screen.getByTestId(`routine-gauge-log-${SAMPLE.vial}`, { includeHiddenElements: true }));
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ status: 'done', amount: 3, unit: 'units' });
    expect(screen.getByTestId(`routine-gauge-state-${SAMPLE.vial}`, { includeHiddenElements: true })).toHaveTextContent('Logged today');
    expect(card().props.accessibilityLabel).toContain('Logged today.');
    expect(screen.queryByTestId(`routine-gauge-log-${SAMPLE.vial}`, { includeHiddenElements: true })).toBeNull();
    expect(card().props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual(['Undo', 'Details']);
    await fireEvent.press(screen.getByTestId(`routine-gauge-undo-${SAMPLE.vial}`, { includeHiddenElements: true }));
    expect(logOf(repo, SAMPLE.vial)).toBeNull();
    await fireEvent.press(screen.getByTestId(`routine-gauge-skip-${SAMPLE.vial}`, { includeHiddenElements: true }));
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ status: 'skipped' });
    expect(screen.getByTestId(`routine-gauge-state-${SAMPLE.vial}`, { includeHiddenElements: true })).toHaveTextContent('Skipped today');
    // VoiceOver reaches the same three through the card's own actions.
    await fireEvent(card(), 'accessibilityAction', { nativeEvent: { actionName: 'undo' } });
    expect(logOf(repo, SAMPLE.vial)).toBeNull();
    await fireEvent(card(), 'accessibilityAction', { nativeEvent: { actionName: 'log' } });
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ status: 'done' });
  });
  test('an empty Peptides tab says so in the approved words', async () => {
    await openPeptides(seededRepository(store => {
      store.items = store.items.filter(item => item.id !== SAMPLE.vial);
      store.placements = store.placements.filter(place => place.itemId !== SAMPLE.vial);
      store.prefs.typeTabs = ['peptide'];
    }));
    expect(screen.getByTestId('routine-type-empty')).toHaveTextContent('No peptides yet. Add one to see its vial ring and week here.');
  });
});

test('no Routines line names a calculator, and the reminder line is the approved one', () => {
  for (const [key, line] of Object.entries(routinesTab)) expect([key, /calculator|reconstitut|desired|to draw/i.test(line)]).toEqual([key, false]);
  expect(routinesTab.converter).toBe('Concentration converter');
  expect(routinesTab.doctor).toBe('Check with your doctor or pharmacist in addition to using this app, and before making any medical decision.');
});
