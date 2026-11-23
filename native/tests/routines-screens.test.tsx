import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, PixelRatio } from 'react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import type { Repository } from '../src/data/repository';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { ItemDetails } from '../src/features/routines-ui/details';
import { RoutinesHistory } from '../src/features/routines-ui/history';
import { ROUTINE_FAQ, RoutinesSettings } from '../src/features/routines-ui/settings';
import { SitesSheet, siteDays } from '../src/features/routines-ui/sites';
import { routineLogId } from '../src/features/routines/model/ids';
import { ROUTINE_SITES, projectRoutineStore, type RoutineView } from '../src/features/routines/model/shape';
import { SAMPLE, SAMPLE_DAY, SAMPLE_NOW, logOf, sampleStore, seededRepository, stored, vialLog } from './routines-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
function show(repo: Repository, page: ReactElement) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  return render(<ThemeProvider>{page}</ThemeProvider>);
}
const everyText = () => (screen.root?.queryAll(node => (node.type as unknown) === 'Text') ?? []).map(node => node.props.children).flat(4).filter(part => typeof part === 'string').join(' ');
const DOCTOR = 'Check with your doctor or pharmacist in addition to using this app, and before making any medical decision.';
const todayLog = routineLogId(SAMPLE.vial, SAMPLE_DAY);

beforeEach(() => {
  const real = Dimensions.get;
  jest.spyOn(Dimensions, 'get').mockImplementation(key => ({ ...real(key), fontScale: 1 }));
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
  jest.useFakeTimers({ now: SAMPLE_NOW, doNotFake: [...KEEP_REAL] });
  jest.mocked(router.push).mockClear(); jest.mocked(router.back).mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('item details', () => {
  test('an open dose item explains the tap, links to its form and the converter, and ends with the doctor line', async () => {
    await show(seededRepository(), <ItemDetails itemId={SAMPLE.vial} />);
    expect(screen.getByRole('header', { name: 'Zzyq Sample Vial' })).toBeTruthy();
    expect(screen.getByText('Log this dose with a tap. Amount, day, time, a note, and an optional injection site are edited here after it is logged. A site is not required to log.')).toBeTruthy();
    expect(screen.queryByTestId('log-save')).toBeNull();
    expect(screen.getByText('Opens the converter for this item. It shows U-100 units for what you entered. It does not suggest an amount.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('details-converter'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/add-item', params: { step: 'converter', itemId: SAMPLE.vial } });
    await fireEvent.press(screen.getByTestId('details-edit-item'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/add-item', params: { itemId: SAMPLE.vial } });
    expect(screen.getByTestId('details-doctor')).toHaveTextContent(DOCTOR);
    expect(screen.getByText('Nothing logged for this item yet.')).toBeTruthy();
    expect(everyText()).not.toMatch(/calculator|reconstitut|stays open|how you felt/i);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
  test('an item in no routine is logged, undone and skipped from its details', async () => {
    const repo = seededRepository(store => { store.placements = store.placements.filter(place => place.itemId !== SAMPLE.vial); });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} />);
    await fireEvent.press(screen.getByTestId('details-log'));
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ status: 'done', amount: 3, unit: 'units' });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('Logged today');
    // The log opens in the form at once, with the web's line that the app suggests no amount.
    expect(screen.getByTestId('log-amount').props.value).toBe('3');
    expect(screen.getByTestId('details-intro')).toHaveTextContent('This saves the amount and the day you enter. It does not suggest an amount.');
    expect(screen.queryByTestId('details-log')).toBeNull();
    await fireEvent.press(screen.getByTestId('details-undo'));
    expect(logOf(repo, SAMPLE.vial)).toBeNull();
    expect(screen.queryByTestId('log-amount')).toBeNull();
    await fireEvent.press(screen.getByTestId('details-skip'));
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ status: 'skipped' });
    expect(screen.getByTestId('details-undo')).toBeTruthy();
  });
  test('a past log opens from the item\'s history, and its edit is saved on that day', async () => {
    const past = routineLogId(SAMPLE.vial, '2026-11-21');
    const repo = seededRepository(store => { store.logs = [vialLog('2026-11-21'), vialLog(SAMPLE_DAY)]; });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} />);
    // Today's log is the one open. The older one is a button in the list.
    expect(screen.getByTestId('log-day')).toHaveTextContent('Nov 23, 2026');
    const older = screen.getByTestId(`details-history-${past}`);
    expect(older.props.accessibilityRole).toBe('button');
    expect(older.props.accessibilityHint).toBe('Opens this log to edit.');
    await fireEvent.press(older);
    expect(screen.getByTestId('log-day')).toHaveTextContent('Nov 21, 2026');
    expect(screen.getByTestId(`details-history-${past}`)).toBeSelected();
    await fireEvent.changeText(screen.getByTestId('log-amount'), '2');
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(logOf(repo, SAMPLE.vial, '2026-11-21')).toMatchObject({ amount: 2, day: '2026-11-21' });
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ amount: 3 });
  });
  test('opened from History with a past log, it shows that log and not today\'s', async () => {
    const repo = seededRepository(store => { store.logs = [vialLog('2026-11-21', { amount: 1.5 }), vialLog(SAMPLE_DAY)]; });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} logId={routineLogId(SAMPLE.vial, '2026-11-21')} />);
    expect(screen.getByTestId('log-day')).toHaveTextContent('Nov 21, 2026');
    expect(screen.getByTestId('log-amount').props.value).toBe('1.5');
  });
  test('a check has no amount, no site and no doctor line', async () => {
    await show(seededRepository(), <ItemDetails itemId={SAMPLE.stretch} />);
    expect(screen.getByText('This is a check. A tap logs it.')).toBeTruthy();
    expect(screen.queryByTestId('details-doctor')).toBeNull();
    expect(screen.queryByTestId('details-converter')).toBeNull();
  });
  test('a logged dose opens with what was saved, with no example amount, and saves an edited amount and note', async () => {
    const repo = seededRepository(store => { store.logs = [vialLog(SAMPLE_DAY)]; });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} logId={todayLog} />);
    const amount = screen.getByTestId('log-amount');
    expect(amount.props.value).toBe('3');
    expect(amount.props.placeholder).toBeUndefined();
    expect(amount.props.keyboardType).toBe('decimal-pad');
    expect(screen.getByText('Unit: units. This is the unit already on the log.')).toBeTruthy();
    expect(screen.getByTestId('log-day')).toHaveTextContent('Nov 23, 2026');
    // Today is the latest day a log can sit on, and the time is asked for only on an earlier day.
    expect(screen.getByTestId('log-day-later')).toBeDisabled();
    expect(screen.queryByTestId('log-time')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Add ¼' }));
    expect(screen.getByTestId('log-amount').props.value).toBe('3.25');
    await fireEvent.press(screen.getByRole('button', { name: 'Take away ¼' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Take away ¼' }));
    expect(screen.getByTestId('log-amount').props.value).toBe('2.75');
    await fireEvent.changeText(screen.getByTestId('log-note'), 'zq note');
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ amount: 2.75, unit: 'units', note: 'zq note' });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Log updated.');
    expect(router.back).toHaveBeenCalledTimes(1);
  });
  test('a refused edit says why and keeps the sheet open', async () => {
    const repo = seededRepository(store => { store.logs = [vialLog(SAMPLE_DAY)]; });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} logId={todayLog} />);
    await fireEvent.changeText(screen.getByTestId('log-amount'), '');
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount and a day up to today. A day that already has a log stays as it is. On an earlier day, leave the time blank or use hours and minutes.');
    expect(router.back).not.toHaveBeenCalled();
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ amount: 3 });
  });
  test('moving the log to an earlier day shows the time field and saves the day', async () => {
    const repo = seededRepository(store => { store.logs = [vialLog(SAMPLE_DAY)]; });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} logId={todayLog} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Earlier day' }));
    expect(screen.getByTestId('log-day')).toHaveTextContent('Nov 22, 2026');
    expect(screen.getByTestId('log-time')).toBeTruthy();
    expect(screen.getByText('Shown when the day is before today. Leave it blank to keep the logged time.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(logOf(repo, SAMPLE.vial)).toBeNull();
    expect(logOf(repo, SAMPLE.vial, '2026-11-22')).toMatchObject({ amount: 3, status: 'done' });
  });
  test('the site picker is eight radios and No site; the same site as last time warns, never blocks, and can be dismissed', async () => {
    const repo = seededRepository(store => { store.logs = [vialLog('2026-11-22', { site: 'left-thigh' }), vialLog(SAMPLE_DAY)]; });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} logId={todayLog} />);
    expect(screen.getByText('Injection site, optional')).toBeTruthy();
    expect(screen.getByText('A site is optional. Saving does not require one.')).toBeTruthy();
    expect(screen.getByText('Last site: Left thigh')).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.map(node => node.props.accessibilityLabel)).toEqual(['No site', ...ROUTINE_SITES.map(site => site.label)]);
    expect(screen.getByRole('radio', { name: 'No site' })).toBeChecked();
    expect(screen.queryByTestId('log-site-warning')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Left thigh' }));
    const warning = screen.getByTestId('log-site-warning');
    expect(within(warning).getByText('Same site as last time.')).toBeTruthy();
    expect(within(warning).getByText('You can dismiss this and still save.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('log-site-warning')).toBeNull();
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ site: 'left-thigh' });
  });
  test('saving with the warning still showing goes through', async () => {
    const repo = seededRepository(store => { store.logs = [vialLog('2026-11-22', { site: 'left-thigh' }), vialLog(SAMPLE_DAY)]; });
    await show(repo, <ItemDetails itemId={SAMPLE.vial} logId={todayLog} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Left thigh' }));
    await fireEvent.press(screen.getByTestId('log-save'));
    expect(logOf(repo, SAMPLE.vial)).toMatchObject({ site: 'left-thigh' });
  });
  test('the history lists each log with the amount stored on it', async () => {
    await show(seededRepository(store => { store.logs = [vialLog('2026-11-21', { amount: 2.5, status: 'partial' }), vialLog('2026-11-22')]; }), <ItemDetails itemId={SAMPLE.vial} />);
    const rows = ['2026-11-22', '2026-11-21'].map(day => screen.getByTestId(`details-history-${routineLogId(SAMPLE.vial, day)}`));
    expect(within(rows[0]).getByText('Nov 22, 2026')).toBeTruthy();
    expect(within(rows[0]).getByText('Logged · 3 units')).toBeTruthy();
    expect(within(rows[1]).getByText('Partial · 2.5 units')).toBeTruthy();
    expect(screen.getByText('Logged amounts. Changing the item amount does not change them.')).toBeTruthy();
  });
  test('an item that is gone says so', async () => {
    await show(seededRepository(), <ItemDetails itemId="missing" />);
    expect(screen.getByText('This item is no longer in Routines.')).toBeTruthy();
  });
});

describe('injection sites', () => {
  test('each site shows the day it was last logged on a taken dose', async () => {
    const logs = [vialLog('2026-11-20', { site: 'left-belly' }), vialLog('2026-11-22', { site: 'left-belly' }), vialLog('2026-11-21', { site: 'right-arm', status: 'skipped' })];
    expect([...siteDays(projectRoutineStore(sampleStore(store => { store.logs = logs; })) as RoutineView)]).toEqual([['left-belly', '2026-11-22']]);
    await show(seededRepository(store => { store.logs = logs; }), <SitesSheet />);
    expect(screen.getByRole('header', { name: 'Injection sites' })).toBeTruthy();
    expect(within(screen.getByTestId('routine-site-left-belly')).getByText('Nov 22, 2026')).toBeTruthy();
    expect(within(screen.getByTestId('routine-site-right-arm')).getByText('Not used yet')).toBeTruthy();
    expect(ROUTINE_SITES.every(site => !!screen.getByTestId(`routine-site-${site.id}`))).toBe(true);
    expect(screen.queryByTestId('routine-sites-none')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
  test('with nothing logged it says so', async () => {
    await show(seededRepository(), <SitesSheet />);
    expect(screen.getByTestId('routine-sites-none')).toHaveTextContent('No site logged yet.');
    expect(screen.getAllByText('Not used yet')).toHaveLength(8);
  });
});

describe('history', () => {
  const logs = () => [vialLog('2026-11-21'), vialLog('2026-11-22', { amount: 1.5, status: 'partial' })];
  test('Days lists the days with something on them, newest first, with stored amounts', async () => {
    await show(seededRepository(store => { store.logs = logs(); }), <RoutinesHistory />);
    expect(screen.getByLabelText('History view').props.accessibilityRole).toBe('tablist');
    expect(screen.getByTestId('history-month')).toHaveTextContent('November 2026');
    const day = screen.getByTestId('history-day-2026-11-22');
    expect(within(day).getByRole('header', { name: 'November 22' })).toBeTruthy();
    expect(within(day).getByLabelText('Zzyq Sample Vial, Partial, 1.5 units')).toBeTruthy();
    expect(screen.getByTestId('history-next')).toBeDisabled();
  });
  test('Calendar picks a day, and a day with nothing says so', async () => {
    await show(seededRepository(store => { store.items = store.items.filter(item => item.id === SAMPLE.vial); store.placements = store.placements.filter(place => place.itemId === SAMPLE.vial); store.logs = logs(); }), <RoutinesHistory />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));
    const cell = screen.getByTestId('history-cell-2026-11-22');
    expect(cell.props.accessibilityLabel).toBe('November 22, Partial');
    expect(screen.getByTestId('history-cell-2026-11-23').props.accessibilityLabel).toContain('today');
    expect(screen.getByTestId('history-cell-2026-11-24')).toBeDisabled();
    await fireEvent.press(cell);
    expect(screen.getByTestId('history-cell-2026-11-22')).toBeSelected();
    expect(screen.getByTestId('history-day-2026-11-22')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByTestId('history-month')).toHaveTextContent('October 2026');
    expect(screen.getByTestId('history-nothing')).toHaveTextContent('Nothing logged this day.');
  });
  test('Graph counts logs, says it does not add amounts, and remembers its tab', async () => {
    const repo = seededRepository(store => { store.logs = logs(); });
    await show(repo, <RoutinesHistory />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Graph' }));
    expect(screen.getByTestId('history-graph-note')).toHaveTextContent('This graph counts logs. It does not add amounts.');
    /* The bars are thinner than a finger, so the strip is one control: VoiceOver steps a day at a time and
       hears the day with its count, and a touch picks the day under it. No bar is a button of its own. */
    const bars = () => screen.getByTestId('history-bars');
    expect(bars().props.accessibilityRole).toBe('adjustable');
    expect(bars().props.accessibilityLabel).toBe('Logs by day');
    expect(bars().props.accessibilityHint).toBe('Swipe up or down to move the day.');
    expect(bars().props.accessibilityValue).toEqual({ text: 'Nov 23, 0 logged' });
    expect(screen.getByTestId('history-bar-2026-11-22').props.accessibilityRole).toBeUndefined();
    expect(within(bars()).queryAllByRole('button')).toHaveLength(0);
    await fireEvent(bars(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(bars().props.accessibilityValue).toEqual({ text: 'Nov 22, 1 logged' });
    expect(screen.getByTestId('history-graph-selected')).toHaveTextContent('Nov 22 · 1 log');
    await fireEvent(bars(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(bars().props.accessibilityValue).toEqual({ text: 'Nov 23, 0 logged' });
    // The strip runs from the 1st to today, the 23rd. A touch 265 points across its 300 lands on the 21st.
    await fireEvent(bars(), 'layout', { nativeEvent: { layout: { width: 300, height: 96, x: 0, y: 0 } } });
    await fireEvent(bars(), 'press', { nativeEvent: { locationX: 265 } });
    expect(screen.getByTestId('history-graph-selected')).toHaveTextContent('Nov 21 · 1 log');
    await fireEvent.press(screen.getByRole('tab', { name: 'Skipped' }));
    expect(stored(repo).prefs.historyGraph).toBe('skipped');
    expect(bars().props.accessibilityValue).toEqual({ text: 'Nov 21, 0 skipped' });
  });
  test('a logged row on a past day opens that log to be corrected', async () => {
    const repo = seededRepository(store => { store.logs = logs(); });
    await show(repo, <RoutinesHistory />);
    const logged = within(screen.getByTestId('history-day-2026-11-22')).getByLabelText('Zzyq Sample Vial, Partial, 1.5 units');
    expect(logged.props.accessibilityRole).toBe('button');
    expect(logged.props.accessibilityHint).toBe('Opens this log to edit.');
    await fireEvent.press(logged);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/item', params: { itemId: SAMPLE.vial, logId: routineLogId(SAMPLE.vial, '2026-11-22') } });
  });
});

describe('Routines settings', () => {
  test('Focus mode and the hour a new day starts are saved, each with its note', async () => {
    const repo = seededRepository();
    await show(repo, <RoutinesSettings />);
    expect(screen.getByText('Focus mode shows only the routine for this time of day. When it is done, the next one shows. Countdowns stay on the row. Routines does not send reminders.')).toBeTruthy();
    expect(screen.getByText('A log before this hour counts for the previous day. The default is 04:00.')).toBeTruthy();
    await fireEvent(screen.getByTestId('routines-focus'), 'valueChange', true);
    expect(stored(repo).prefs.focusMode).toBe(true);
    expect(screen.getByRole('button', { name: '04:00' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: '02:00' }));
    expect(stored(repo).settings.dayRolloverHour).toBe(2);
    expect(screen.getByRole('button', { name: '02:00' })).toBeSelected();
  });
  test('it carries the converter note and the doctor line, and never the word calculator', async () => {
    await show(seededRepository(), <RoutinesSettings />);
    expect(screen.getByTestId('routines-converter-note')).toHaveTextContent('The converter shows the arithmetic of what you entered. It does not suggest an amount.');
    expect(screen.getByTestId('routines-doctor')).toHaveTextContent(DOCTOR);
    expect(everyText()).not.toMatch(/calculator|reconstitut/i);
  });
  test('it says routines stay on this phone and that a backup cannot put them back yet', async () => {
    await show(seededRepository(), <RoutinesSettings />);
    expect(screen.getByText('On this iPhone only')).toBeTruthy();
    expect(screen.getByTestId('routines-phone-only')).toHaveTextContent('Routines are saved on this iPhone and are not synced. Signing out or deleting your account erases them from this phone. A backup file holds a copy of them to keep, but this version of Insight cannot put routines back from a backup.');
  });
  test('a part that is not on the page can be added, under the iPhone names', async () => {
    const repo = seededRepository(store => { store.items = store.items.filter(item => item.id !== SAMPLE.vial); store.placements = store.placements.filter(place => place.itemId !== SAMPLE.vial); store.prefs.added = []; });
    await show(repo, <RoutinesSettings />);
    const parts = screen.getByTestId('routines-parts');
    // The web calls this part's tool a calculator; on iPhone it is the converter.
    expect(within(parts).getByText('Peptides and Enhancers tabs, with dose amounts, the converter and supply.')).toBeTruthy();
    expect(everyText()).not.toMatch(/calculator|reconstitut/i);
    await fireEvent.press(screen.getByRole('button', { name: 'Add Peptides and Enhancers tabs' }));
    expect(stored(repo).prefs.typeTabs).toEqual(expect.arrayContaining(['peptide', 'enhancer']));
    expect(within(screen.getByTestId('routines-parts')).queryByText('Peptides and Enhancers tabs')).toBeNull();
  });
  test('the FAQ is a plain list that opens with the doctor line and drops the web-only questions', async () => {
    await show(seededRepository(), <RoutinesSettings />);
    expect(screen.getByTestId('routines-faq-doctor')).toHaveTextContent(DOCTOR);
    const questions = within(screen.getByTestId('routines-faq')).getAllByRole('header').map(node => node.props.children);
    expect(questions).toHaveLength(ROUTINE_FAQ.length);
    expect(questions).toEqual(['What is Routines?', 'Who can use it?', 'How do I log an item?', 'What do the counts by each routine show?', 'When does a streak reset?',
      'Can I change a logged amount or day?', 'What does the converter show?', 'Does Routines send reminders?']);
    expect(screen.getByText('Anyone using Insight on this iPhone. Routines are saved on this iPhone and are separate from Routines on the web for now.')).toBeTruthy();
    expect(everyText()).not.toMatch(/refresh|Discover/);
    await fireEvent.press(screen.getByRole('button', { name: 'Retake setup quiz' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/routines/setup', params: { mode: 'retake' } });
  });
});
