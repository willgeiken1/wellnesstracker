// Every reminder switch leads to a reminder on the phone, or says it is not available yet: routines' Remind me, the
// food meals and the rest timer alert are planned with the workout and weekly reminders, the app's root keeps them in
// step from launch, and the Reconnect Oura alert shows as coming later.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthContext, type AuthState } from '../src/auth/provider';
import Section from '../src/app/settings/[section]';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, type SettingsPrefs } from '../src/features/settings/prefs-model';
import { COUNTED_REMINDERS, MAX_SCHEDULED, OURA_ALERT_AVAILABLE, planReminders, remindersOn, type PlannedReminder } from '../src/features/reminders/plan';
import { REMINDER_ID_PREFIX, askForReminders, setNotifierForTests, syncReminders, type Notifier, type NotifyPermission } from '../src/features/reminders/notifier';
import { ReminderSync, mealsLoggedOn, reminderPlan } from '../src/features/reminders/sync';
import { clock, dayKey, emptyState, rById, type Item, type RoutinesState } from '../src/features/routines/model';
import { ROUTINES_KEY, createRoutinesStore, refreshNow } from '../src/features/routines/store';
import { RoutineDetail } from '../src/features/routines/screens';
import { showToast } from '../src/features/shell/toast';
import { t } from '../src/i18n/en';
import { saveReminder } from '../src/features/progress/local';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { phoneOnly: false } } } }));
jest.mock('expo-router', () => {
  const Stack = Object.assign(function Stack({ children }: { children: React.ReactNode }) { return children; }, { Screen: function Screen() { return null; } });
  return { Stack, router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ section: 'reminders' }), useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }), useIsFocused: () => true };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./progress-mocks').gestureMock());
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));

/* Wednesday, November 25 2026, 7:00 AM on the phone's clock: Wednesday is weekday 2, counting from Monday 0. */
const NOW = new Date(2026, 10, 25, 7, 0).getTime(), WED = 2;
const at = (days: number, h: number, m = 0) => new Date(2026, 10, 25 + days, h, m).getTime();
const REM: SettingsPrefs['rem'] = { ...DEFAULT_PREFS.rem, cap: false };
const ids = (list: readonly PlannedReminder[]) => list.map(r => r.id);

/** Two routines with one item each: Morning 6 to 10 AM every day, Night 9:30 to 11 PM on Mon, Wed and Fri (Sunday 0). */
function routines(over: (s: RoutinesState) => void = () => {}): RoutinesState {
  const s = emptyState();
  s.routines = [
    { id: 'morning', name: 'Morning', from: 6, to: 10, color: 'warning', days: [0, 1, 2, 3, 4, 5, 6], remind: true, pauses: [] },
    { id: 'night', name: 'Night', from: 21.5, to: 23, color: 'sleep', days: [1, 3, 5], remind: true, pauses: [] },
  ];
  const item = (id: string, routine: string, h: number): Item => ({ id, name: id, amt: null, unit: '', dose: 'Tick when done', type: 'Other', kind: 'check', routines: [routine], h, days: null, created: '2026-01-01', note: null });
  s.items = [item('stretch', 'morning', 7), item('read', 'night', 22)];
  over(s);
  return s;
}

function fakeNotifier(start: NotifyPermission, answer: NotifyPermission = 'granted') {
  let state = start;
  const scheduled: PlannedReminder[][] = [];
  const n: Notifier & { request: jest.Mock; permission: jest.Mock; replace: jest.Mock } = {
    permission: jest.fn(async () => state),
    request: jest.fn(async () => { if (state === 'undetermined') state = answer; return state; }),
    replace: jest.fn(async (list: readonly PlannedReminder[]) => { scheduled.push([...list]); }),
  };
  return { n, last: () => scheduled.at(-1) ?? [] };
}
type Repo = ReturnType<typeof memoryRepository>;
/** A signed-in person's repository (the in-memory one is the Look around account unless told otherwise). */
const account = (): Repo => Object.assign(memoryRepository(), { owner: 'person' });
const setRem = (repo: Repo, rem: Partial<SettingsPrefs['rem']>) => repo.localSave(SETTINGS_PREFS_KEY, { ...DEFAULT_PREFS, rem: { ...DEFAULT_PREFS.rem, ...rem } });
const auth = (repository: Repo | null): AuthState => ({ session: null, demo: false, ready: true, configured: true, configError: null,
  repository: repository as never, pending: 0, conflicts: 0, syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null),
  createAccount: jest.fn(async () => null), signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}) });
const show = (ui: React.ReactNode, repo: Repo | null) => render(<AuthContext.Provider value={auth(repo)}><ThemeProvider>{ui}</ThemeProvider></AuthContext.Provider>);

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => setNotifierForTests(null));

describe('routines with Remind me on', () => {
  test('come every week on the routine’s days at the start of its window, then once later in it', () => {
    // Today's Morning item is still open, so today's second nudge stays on its weekly schedule too.
    const list = planReminders(REM, [], { now: NOW, routines: routines() });
    const morning = list.filter(r => r.id.startsWith('routine-morning-') && !r.id.includes('left'));
    expect(morning.map(r => [r.weekday, r.hour, r.minute, r.at])).toEqual([0, 1, 2, 3, 4, 5, 6].map(d => [d, 6, 0, undefined]));
    // Mon, Wed and Fri in the routine (Sunday 0) are 0, 2 and 4 from Monday; the window opens at 9:30 PM.
    expect(list.filter(r => /^routine-night-\d$/.test(r.id)).map(r => [r.weekday, r.hour, r.minute])).toEqual([[0, 21, 30], [2, 21, 30], [4, 21, 30]]);
    // The second nudge: an hour before the window closes, at least half an hour after it opens.
    expect(list.filter(r => r.id.startsWith('routine-morning-left-')).map(r => [r.hour, r.minute])).toEqual(Array(7).fill([9, 0]));
    expect(list.filter(r => r.id.startsWith('routine-night-left-')).map(r => [r.hour, r.minute])).toEqual(Array(3).fill([22, 0]));
    expect(list.find(r => r.id === 'routine-morning-2')).toMatchObject({ title: 'Morning', body: t('reminderRoutineBody').replace('{name}', 'Morning') });
    expect(list.every(r => !/stretch|read/.test(r.title + r.body))).toBe(true);
  });
  test('once nothing is left today, today’s second nudge waits for the same day next week', () => {
    const s = routines(x => { x.log[dayKey(new Date(NOW))] = { stretch: 'd' }; });
    const list = planReminders(REM, [], { now: NOW, routines: s });
    expect(list.find(r => r.id === `routine-morning-left-${WED}`)).toMatchObject({ at: at(7, 9), weekday: WED, hour: 9, minute: 0 });
    // Every other day keeps its weekly nudge, and the start reminder is not affected.
    expect(list.find(r => r.id === 'routine-morning-left-3')!.at).toBeUndefined();
    expect(list.find(r => r.id === `routine-morning-${WED}`)!.at).toBeUndefined();
  });
  test('a paused routine, one with Remind me off, and one with nothing in it get no reminder', () => {
    const s = routines(x => {
      x.routines[0].pauses = [{ from: '2026-11-24', until: '2026-11-30', why: null }];
      x.routines[1].remind = false;
      x.routines.push({ id: 'empty', name: 'Empty', from: 12, to: 13, color: 'food', days: [0, 1, 2, 3, 4, 5, 6], remind: true, pauses: [] });
    });
    expect(planReminders(REM, [], { now: NOW, routines: s })).toEqual([]);
  });
  test('only on the weekdays an item is due', () => {
    const s = routines(x => { x.items[0].days = [6]; }); // Saturday (Sunday 0) is 5 from Monday
    expect(ids(planReminders(REM, [], { now: NOW, routines: s }).filter(r => r.id.startsWith('routine-morning')))).toEqual(['routine-morning-5', 'routine-morning-left-5']);
  });
});

describe('food reminders', () => {
  const food = { ...REM, food: true };
  test('each meal that is on comes every day at its time; off, none come', () => {
    const list = planReminders({ ...food, lunch: false }, [], { now: NOW });
    expect(list.filter(r => r.id.startsWith('food-breakfast-')).map(r => [r.weekday, r.hour, r.minute])).toEqual([0, 1, 2, 3, 4, 5, 6].map(d => [d, 9, 30]));
    expect(list.filter(r => r.id.startsWith('food-dinner-')).map(r => [r.hour, r.minute])).toEqual(Array(7).fill([20, 0]));
    expect(list.some(r => r.id.startsWith('food-lunch'))).toBe(false);
    expect(list.find(r => r.id === 'food-breakfast-0')).toMatchObject({ title: 'Log breakfast', body: t('reminderMealBody') });
    expect(planReminders({ ...REM, food: false }, [], { now: NOW })).toEqual([]);
  });
  test('a meal already logged today is not nudged today, and is again from next week', () => {
    const list = planReminders(food, [], { now: NOW, mealsLogged: ['breakfast'] });
    expect(list.find(r => r.id === `food-breakfast-${WED}`)).toMatchObject({ at: at(7, 9, 30) });
    expect(list.find(r => r.id === `food-lunch-${WED}`)!.at).toBeUndefined();
  });
  test('a meal skipped today keeps coming in the weeks after next, not only once', () => {
    const list = planReminders(food, [], { now: NOW, mealsLogged: ['breakfast'] });
    expect(list.find(r => r.id === `food-breakfast-${WED}`)!.then).toEqual([at(14, 9, 30), at(21, 9, 30), at(28, 9, 30)]);
    expect(list.find(r => r.id === `food-lunch-${WED}`)!.then).toBeUndefined();
  });
  test('reads which meals have something logged on the day, and nothing else', () => {
    const repo = account();
    repo.save('food_entries', { day: '2026-11-25', meal_id: 'fd000000-0000-4000-8000-000000000002', name: 'Soup', energy_kj: 900 });
    repo.save('food_entries', { day: '2026-11-24', meal_id: 'fd000000-0000-4000-8000-000000000000', name: 'Eggs', energy_kj: 600 });
    expect(mealsLoggedOn(repo as never, '2026-11-25')).toEqual(['dinner']);
    expect(reminderPlan(repo as never, food, NOW).find(r => r.id === `food-dinner-${WED}`)).toMatchObject({ at: at(7, 20) });
  });
});

describe('the rest timer alert', () => {
  const end = NOW + 90_000;
  test('comes once, when the running rest ends', () => {
    expect(planReminders({ ...REM, rest: true }, [], { now: NOW, timer: { endAt: end, ended: false } }))
      .toEqual([{ id: 'rest', at: end, weekday: WED, hour: 7, minute: 1, title: t('reminderRestTitle'), body: t('reminderRestBody') }]);
  });
  test('not for a rest that ended, one already over, or with the switch off', () => {
    expect(planReminders({ ...REM, rest: true }, [], { now: NOW, timer: { endAt: end, ended: true } })).toEqual([]);
    expect(planReminders({ ...REM, rest: true }, [], { now: NOW, timer: { endAt: NOW - 1, ended: false } })).toEqual([]);
    expect(planReminders({ ...REM, rest: false }, [], { now: NOW, timer: { endAt: end, ended: false } })).toEqual([]);
    expect(planReminders({ ...REM, rest: true }, [], { now: NOW, timer: null })).toEqual([]);
  });
});

describe('the photo reminder', () => {
  test('comes every Sunday at 8:00 AM while it is on, and not when off', () => {
    expect(planReminders(REM, [], { now: NOW, photo: true }))
      .toEqual([{ id: 'photo-6', weekday: 6, hour: 8, minute: 0, title: t('reminderPhotoTitle'), body: t('reminderPhotoBody') }]);
    expect(planReminders(REM, [], { now: NOW, photo: false })).toEqual([]);
  });
  test('the plan reads it from Progress, Photos', () => {
    const repo = memoryRepository();
    expect(reminderPlan(repo, REM, NOW)).toEqual([]);
    saveReminder(repo, true);
    expect(reminderPlan(repo, REM, NOW).map(r => r.id)).toEqual(['photo-6']);
  });
});

describe('at most 2 a day', () => {
  const all = { ...DEFAULT_PREFS.rem, cap: true, workout: true, weekly: true, food: true, rest: true };
  test('each day keeps the two that matter most; the rest alert is never held back', () => {
    const list = planReminders(all, [0, 1, 2, 3, 4, 5, 6], { now: NOW, routines: routines(), timer: { endAt: NOW + 60_000 } });
    for (let wd = 0; wd < 7; wd++) expect([wd, list.filter(r => r.weekday === wd && r.id !== 'rest').length]).toEqual([wd, 2]);
    // Workout first, then the first routine's start; the weekly report and meals give way.
    expect(ids(list.filter(r => r.weekday === 0 && r.id !== 'rest'))).toEqual(['workout-0', 'routine-morning-0']);
    expect(list.some(r => r.id === 'weekly' || r.id.startsWith('food-'))).toBe(false);
    expect(list.filter(r => r.id === 'rest')).toHaveLength(1);
    // Off, everything that is on comes.
    expect(planReminders({ ...all, cap: false }, [0], { now: NOW }).map(r => r.id)).toContain('weekly');
  });
  test('a nudge nothing calls for today frees its place today only', () => {
    const rem = { ...DEFAULT_PREFS.rem, cap: true, food: true };
    const list = planReminders(rem, [], { now: NOW, mealsLogged: ['breakfast'] });
    // Today: lunch and dinner (breakfast is logged); from next week on Wednesdays, breakfast and lunch again.
    expect(list.filter(r => r.weekday === WED).map(r => [r.id, r.at])).toEqual([[`food-breakfast-${WED}`, at(7, 9, 30)], [`food-lunch-${WED}`, undefined], [`food-dinner-${WED}`, at(0, 20)]]);
  });
  test('never more than iOS keeps', () => {
    const s = routines(x => { for (let k = 0; k < 6; k++) { x.routines.push({ ...x.routines[0], id: `r${k}`, name: `R${k}` }); x.items[0].routines.push(`r${k}`); } });
    const list = planReminders({ ...REM, workout: true, food: true, weekly: true, rest: true }, [0, 1, 2, 3, 4, 5, 6], { now: NOW, routines: s, timer: { endAt: NOW + 1000 } });
    expect(list).toHaveLength(MAX_SCHEDULED);
    expect(list.at(-1)!.id).toBe('rest');
  });
});

describe('the Reconnect Oura alert', () => {
  test('is not available yet: never planned or counted, and its switch says so and does nothing', async () => {
    expect(OURA_ALERT_AVAILABLE).toBe(false);
    expect(COUNTED_REMINDERS).not.toContain('oura');
    expect(remindersOn({ ...DEFAULT_PREFS.rem, oura: true, weekly: true })).toBe(1);
    expect(planReminders({ ...REM, oura: true }, [0, 1, 2, 3, 4, 5, 6], { now: NOW })).toEqual([]);
    const { n } = fakeNotifier('undetermined');
    setNotifierForTests(n);
    const repo = account();
    setRem(repo, { oura: true });
    await show(<Section />, repo);
    const row = screen.getByTestId('reminders-oura');
    expect(row).toHaveTextContent(new RegExp(t('settingsOuraAlertLater').slice(0, 30)));
    const sw = screen.getAllByRole('switch').find(el => { let p = el.parent; while (p) { if (p.props.testID === 'reminders-oura') return true; p = p.parent; } return false; })!;
    expect(sw.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    await fireEvent(row, 'onToggle', true);
    expect(n.request).not.toHaveBeenCalled();
  });
});

describe('the phone notifications adapter', () => {
  test('puts a one-off on a date trigger and skips one whose moment has passed', async () => {
    const calls: unknown[] = [];
    const fake = {
      getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
      requestPermissionsAsync: jest.fn(),
      getAllScheduledNotificationsAsync: jest.fn(async () => [{ identifier: `${REMINDER_ID_PREFIX}rest` }]),
      cancelScheduledNotificationAsync: jest.fn(async (id: string) => { calls.push(['cancel', id]); }),
      scheduleNotificationAsync: jest.fn(async (r: unknown) => { calls.push(['schedule', r]); return 'x'; }),
    };
    jest.doMock('expo-notifications', () => fake, { virtual: true });
    const soon = Date.now() + 60_000;
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy that loads the mocked module
      const { notifier } = require('../src/features/reminders/notifier') as typeof import('../src/features/reminders/notifier');
      await notifier().replace([
        { id: 'rest', at: soon, weekday: 0, hour: 0, minute: 0, title: 'Rest is over', body: 'Next set' },
        { id: 'old', at: Date.now() - 1000, weekday: 0, hour: 0, minute: 0, title: 'x', body: 'y' },
      ]);
    });
    expect(calls).toEqual([
      ['cancel', `${REMINDER_ID_PREFIX}rest`],
      ['schedule', { identifier: `${REMINDER_ID_PREFIX}rest`, content: { title: 'Rest is over', body: 'Next set', sound: true }, trigger: { type: 'date', date: soon } }],
    ]);
    jest.dontMock('expo-notifications');
  });
  test("puts a skipped reminder's later weeks on date triggers, within iOS's limit", async () => {
    const calls: { identifier: string; trigger: unknown }[] = [];
    const fake = {
      getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
      requestPermissionsAsync: jest.fn(),
      getAllScheduledNotificationsAsync: jest.fn(async () => []),
      cancelScheduledNotificationAsync: jest.fn(async () => {}),
      scheduleNotificationAsync: jest.fn(async (r: { identifier: string; trigger: unknown }) => { calls.push(r); return 'x'; }),
    };
    jest.doMock('expo-notifications', () => fake, { virtual: true });
    const week = 7 * 86_400_000, first = Date.now() + week;
    const skipped = { id: 'food-breakfast-2', at: first, then: [first + week, first + 2 * week], weekday: 2, hour: 9, minute: 30, title: 'Log breakfast', body: 'b' };
    const weekly = (i: number) => ({ id: `w-${i}`, weekday: i % 7, hour: 8, minute: i % 60, title: 't', body: 'b' });
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy that loads the mocked module
      const { notifier } = require('../src/features/reminders/notifier') as typeof import('../src/features/reminders/notifier');
      await notifier().replace([skipped, weekly(0)]);
      expect(calls.map(c => c.identifier)).toEqual([`${REMINDER_ID_PREFIX}food-breakfast-2`, `${REMINDER_ID_PREFIX}w-0`,
        `${REMINDER_ID_PREFIX}food-breakfast-2-week2`, `${REMINDER_ID_PREFIX}food-breakfast-2-week3`]);
      expect(calls[2].trigger).toEqual({ type: 'date', date: first + week });
      calls.length = 0;
      // A full plan leaves no room: the plan's own reminders come first and nothing goes past the limit.
      await notifier().replace([skipped, ...Array.from({ length: MAX_SCHEDULED - 1 }, (_, i) => weekly(i))]);
      expect(calls).toHaveLength(MAX_SCHEDULED);
      expect(calls.some(c => c.identifier.endsWith('-week2'))).toBe(false);
    });
    jest.dontMock('expo-notifications');
  });
  test('the same plan is not put on the phone twice, and syncs never ask', async () => {
    const { n } = fakeNotifier('granted');
    const list = planReminders({ ...REM, weekly: true }, [], { now: NOW });
    expect(await syncReminders(list, n)).toBe(true);
    expect(await syncReminders(list, n)).toBe(true);
    expect(n.replace).toHaveBeenCalledTimes(1);
    expect(await syncReminders([], n)).toBe(true);
    expect(n.replace).toHaveBeenCalledTimes(2);
    const waiting = fakeNotifier('undetermined').n;
    expect(await syncReminders(list, waiting)).toBe(false);
    expect(waiting.request).not.toHaveBeenCalled();
    expect(waiting.replace).not.toHaveBeenCalled();
  });
  test('asking: once, only when iOS was never asked', async () => {
    const fresh = fakeNotifier('undetermined', 'denied').n;
    expect(await askForReminders(fresh)).toBe('denied');
    expect(await askForReminders(fresh)).toBe('denied');
    expect(fresh.request).toHaveBeenCalledTimes(1);
  });
});

describe('the app-wide sync', () => {
  test('from launch, keeps the phone in step with the switches, routines and the rest timer, without asking', async () => {
    const { n, last } = fakeNotifier('granted');
    setNotifierForTests(n);
    const repo = account();
    setRem(repo, { weekly: true });
    await show(<ReminderSync repository={repo as never} />, repo);
    await waitFor(() => expect(ids(last())).toEqual(['weekly']));
    // A routine's Remind me turned on elsewhere (another screen or device) goes on the phone.
    await act(async () => { repo.localSave(ROUTINES_KEY, routines(s => { s.routines[1].remind = false; })); });
    await waitFor(() => expect(last().some(r => r.id === 'routine-morning-0')).toBe(true));
    // A rest that starts with the alert on comes once at its end; skipping the rest takes it off.
    await act(async () => { setRem(repo, { weekly: true, rest: true }); repo.localSave('timer', { sessionId: 's', setId: 'x', entryId: 'e', endAt: Date.now() + 120_000, duration: 120, minimized: false, ended: false }); });
    await waitFor(() => expect(last().some(r => r.id === 'rest')).toBe(true));
    await act(async () => { repo.localSave('timer', null); });
    await waitFor(() => expect(last().some(r => r.id === 'rest')).toBe(false));
    // Everything off takes them all off.
    await act(async () => { setRem(repo, {}); repo.localSave(ROUTINES_KEY, routines(s => { s.routines.forEach(r => { r.remind = false; }); })); });
    await waitFor(() => expect(last()).toEqual([]));
    expect(n.request).not.toHaveBeenCalled();
  });
  test('never asks iOS, and does nothing in the phone-only build or for Look around’s sample routines', async () => {
    const ask = fakeNotifier('undetermined');
    setNotifierForTests(ask.n);
    const repo = account();
    setRem(repo, { weekly: true });
    await show(<ReminderSync repository={repo as never} />, repo);
    await waitFor(() => expect(ask.n.permission).toHaveBeenCalled());
    expect(ask.n.request).not.toHaveBeenCalled();
    expect(ask.n.replace).not.toHaveBeenCalled();
    await screen.unmount();

    const phoneOnly = fakeNotifier('granted');
    setNotifierForTests(phoneOnly.n);
    await show(<ReminderSync repository={repo as never} limited />, repo);
    await new Promise(r => setTimeout(r, 300));
    expect(phoneOnly.n.permission).not.toHaveBeenCalled();
    await screen.unmount();

    const sample = memoryRepository(); // the Look around account
    sample.localSave(ROUTINES_KEY, routines());
    expect(reminderPlan(sample as never, DEFAULT_PREFS.rem, NOW)).toEqual([]);
    expect(reminderPlan(Object.assign(memoryRepository(), { owner: 'person', localGet: (k: string) => (k === ROUTINES_KEY ? routines() : undefined) }) as never, DEFAULT_PREFS.rem, NOW).length).toBeGreaterThan(0);
  });
});

describe('a routine’s Remind me', () => {
  const realNow = clock.now;
  beforeAll(() => { clock.now = () => new Date(NOW); refreshNow(); });
  afterAll(() => { clock.now = realNow; refreshNow(); });
  const storeOver = (repo: Repo) => createRoutinesStore({ get: () => repo.localGet(ROUTINES_KEY), save: s => repo.localSave(ROUTINES_KEY, s), subscribe: l => repo.subscribe(l) });

  test('asks iOS the first time it is turned on, and then the routine goes on the phone', async () => {
    const { n, last } = fakeNotifier('undetermined', 'granted');
    setNotifierForTests(n);
    const repo = account();
    repo.localSave(ROUTINES_KEY, routines(s => { s.routines.forEach(r => { r.remind = false; }); }));
    const store = storeOver(repo);
    await show(<><ReminderSync repository={repo as never} /><RoutineDetail store={store} rid="morning" /></>, repo);
    expect(n.replace).not.toHaveBeenCalled();
    await act(async () => { fireEvent(screen.getByRole('switch'), 'valueChange', true); });
    await waitFor(() => expect(n.request).toHaveBeenCalledTimes(1));
    expect(rById(store.read(), 'morning')!.remind).toBe(true);
    await waitFor(() => expect(last().filter(r => r.id.startsWith('routine-morning')).length).toBe(14));
    expect(showToast).toHaveBeenCalledWith('Morning reminders on', expect.anything());
  });
  test('if iOS says no, it goes back off and says where to allow notifications', async () => {
    const { n } = fakeNotifier('undetermined', 'denied');
    setNotifierForTests(n);
    const repo = account();
    repo.localSave(ROUTINES_KEY, routines(s => { s.routines.forEach(r => { r.remind = false; }); }));
    const store = storeOver(repo);
    await show(<RoutineDetail store={store} rid="morning" />, repo);
    await act(async () => { fireEvent(screen.getByRole('switch'), 'valueChange', true); });
    await waitFor(() => expect(rById(store.read(), 'morning')!.remind).toBe(false));
    expect(showToast).toHaveBeenCalledWith(t('settingsRemNeedsIos'), expect.anything());
    expect(n.replace).not.toHaveBeenCalled();
  });
  test('turning it off asks nothing', async () => {
    const { n } = fakeNotifier('undetermined');
    setNotifierForTests(n);
    const repo = account();
    repo.localSave(ROUTINES_KEY, routines());
    const store = storeOver(repo);
    await show(<RoutineDetail store={store} rid="morning" />, repo);
    await act(async () => { fireEvent(screen.getByRole('switch'), 'valueChange', false); });
    expect(rById(store.read(), 'morning')!.remind).toBe(false);
    expect(n.request).not.toHaveBeenCalled();
  });
});
