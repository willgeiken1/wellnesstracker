// Every reminder starts off (owner, 2026-11-27): no notification prompt until the person turns one on in Settings,
// Reminders, which then asks iOS once and schedules it; the chosen time is kept.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthContext, type AuthState } from '../src/auth/provider';
import Section from '../src/app/settings/[section]';
import Settings from '../src/app/settings/index';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, readSettingsPrefs, type SettingsPrefs } from '../src/features/settings/prefs-model';
import { REMINDER_SWITCHES, parseTime, planReminders, plannedWorkoutDays, type PlannedReminder } from '../src/features/reminders/plan';
import { REMINDER_ID_PREFIX, setNotifierForTests, type Notifier, type NotifyPermission } from '../src/features/reminders/notifier';
import { readReminder } from '../src/features/progress/local';
import { emptyState } from '../src/features/routines/model';
import { createRoutinesStore } from '../src/features/routines/store';
import { showToast } from '../src/features/shell/toast';
import { t } from '../src/i18n/en';

let mockSection = 'reminders';
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { phoneOnly: false } } } }));
jest.mock('expo-router', () => {
  const Stack = Object.assign(function Stack({ children }: { children: React.ReactNode }) { return children; }, { Screen: function Screen() { return null; } });
  return { Stack, router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ section: mockSection }) };
});
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));
// The no-module case below is a build without expo-notifications: requiring it fails, as it would there. The adapter
// tests further down stand in their own copy.
jest.mock('expo-notifications', () => { throw new Error('expo-notifications is not in this build'); });

/** A stand-in for the phone's notifications: iOS answers `answer` when asked. */
function fakeNotifier(start: NotifyPermission, answer: NotifyPermission = 'granted') {
  let state = start;
  const scheduled: PlannedReminder[][] = [];
  const n: Notifier & { request: jest.Mock; permission: jest.Mock; replace: jest.Mock } = {
    permission: jest.fn(async () => state),
    request: jest.fn(async () => { if (state === 'undetermined') state = answer; return state; }),
    replace: jest.fn(async (list: readonly PlannedReminder[]) => { scheduled.push([...list]); }),
  };
  return { n, scheduled, last: () => scheduled.at(-1) ?? [] };
}

const auth = (repository: ReturnType<typeof memoryRepository> | null): AuthState => ({ session: null, demo: false, ready: true, configured: true, configError: null,
  repository: repository as never, pending: 0, conflicts: 0, syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null),
  createAccount: jest.fn(async () => null), signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}) });
const show = (ui: React.ReactNode, repo: ReturnType<typeof memoryRepository> | null) =>
  render(<AuthContext.Provider value={auth(repo)}><ThemeProvider>{ui}</ThemeProvider></AuthContext.Provider>);
const saved = (repo: ReturnType<typeof memoryRepository>) => repo.localGet<SettingsPrefs>(SETTINGS_PREFS_KEY)!;
const switchOf = (key: string) => screen.getByTestId(`reminders-${key}`);
const checked = (key: string) => {
  const s = screen.getAllByRole('switch').find(el => { let p = el.parent; while (p) { if (p.props.testID === `reminders-${key}`) return true; p = p.parent; } return false; });
  return s?.props.accessibilityState?.checked;
};
/** A two-workout plan. Without the synced plan settings it rotates 3 days a week: Monday, Wednesday and Friday (Monday 0). */
function withPlan(repo: ReturnType<typeof memoryRepository>) {
  const a = repo.save('routines', { name: 'Push' }), b = repo.save('routines', { name: 'Pull' });
  repo.localSave('plans:definition', { days: [{ routineId: a.id, weekdays: [0] }, { routineId: b.id, weekdays: [3] }] });
  return repo;
}

beforeEach(() => { jest.clearAllMocks(); mockSection = 'reminders'; });
afterEach(() => setNotifierForTests(null));

describe('defaults', () => {
  test('every reminder a new person has starts off', () => {
    for (const key of REMINDER_SWITCHES.filter(k => !['breakfast', 'lunch', 'dinner'].includes(k))) {
      expect([key, DEFAULT_PREFS.rem[key]]).toEqual([key, false]);
      expect([key, readSettingsPrefs(undefined).rem[key]]).toEqual([key, false]);
    }
    // The limit stays on, and nothing is planned for the phone.
    expect(DEFAULT_PREFS.rem.cap).toBe(true);
    expect(planReminders(DEFAULT_PREFS.rem, [0, 1, 2, 3, 4, 5, 6])).toEqual([]);
    // The weekly progress photo reminder and every routine's reminder start off too.
    expect(readReminder(memoryRepository())).toBe(false);
    expect(emptyState().routines.map(r => r.remind)).toEqual([false, false, false]);
    let state: unknown;
    const store = createRoutinesStore({ get: () => state, save: next => { state = next; } });
    expect(store.addRoutine({ name: 'Evening', from: 18, to: 19, days: [], color: 'sleep', items: [] }).remind).toBe(false);
  });
  test('a choice the person made is kept: the photo reminder they turned on stays on', () => {
    const repo = memoryRepository();
    repo.localSave('progressPhotoReminder', true);
    expect(readReminder(repo)).toBe(true);
  });
});

describe('people who saved settings before reminders started off', () => {
  const OLD = { cap: true, workout: true, workoutTime: '5:30 PM', rest: true, weekly: true, food: false, breakfast: true, lunch: true, dinner: true, oura: true };
  test('reminders still at the old defaults were never chosen, so they take the new defaults; other settings are kept', () => {
    const p = readSettingsPrefs({ units: { weight: 'kg' }, rem: OLD });
    expect(p.units.weight).toBe('kg');
    expect(p.rem).toEqual(DEFAULT_PREFS.rem);
  });
  test('any reminder set differently means they chose, so every reminder they had is kept, the ones on included', () => {
    expect(readSettingsPrefs({ rem: { ...OLD, food: true } }).rem).toMatchObject({ workout: true, rest: true, weekly: true, food: true, oura: true });
    expect(readSettingsPrefs({ rem: { ...OLD, workoutTime: '7:00 AM' } }).rem).toMatchObject({ workout: true, workoutTime: '7:00 AM', weekly: true });
    expect(readSettingsPrefs({ rem: { ...OLD, oura: false } }).rem).toMatchObject({ workout: true, rest: true, weekly: true, oura: false });
  });
  test('a save made with the new defaults is read as it is, so a reminder turned on stays on', () => {
    const p = readSettingsPrefs({ rem: { ...DEFAULT_PREFS.rem, workout: true, rest: true, weekly: true, oura: true } });
    expect(p.rem).toMatchObject({ workout: true, rest: true, weekly: true, oura: true });
  });
});

describe('no notification prompt until a reminder is turned on', () => {
  test('opening Settings and the Reminders page never asks iOS', async () => {
    const { n } = fakeNotifier('undetermined');
    setNotifierForTests(n);
    const repo = memoryRepository();
    await show(<Settings />, repo);
    expect(screen.getByTestId('settings-row-reminders')).toHaveTextContent(/0 on/);
    await screen.unmount();
    await show(<Section />, repo);
    await waitFor(() => expect(n.permission).toHaveBeenCalled());
    expect(n.request).not.toHaveBeenCalled();
    expect(n.replace).not.toHaveBeenCalled();
    for (const key of ['workout', 'rest', 'weekly', 'food', 'oura']) expect(checked(key)).toBe(false);
  });
  test('only turning a reminder on can ask: no launch, onboarding or other code reaches the notifications module', () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
    walk(join(__dirname, '../src'));
    const rel = (p: string) => p.slice(p.indexOf('src/'));
    expect(files.filter(f => /expo-notifications/.test(readFileSync(f, 'utf8'))).map(rel)).toEqual(['src/features/reminders/notifier.ts']);
    // The Reminders page and a routine's Remind me are the two switches that turn a reminder on.
    expect(files.filter(f => /features\/reminders\/notifier/.test(readFileSync(f, 'utf8'))).map(rel)).toEqual(['src/features/progress/screens/photos.tsx', 'src/features/routines/screens.tsx', 'src/features/settings/pages.tsx']);
    // Asking goes through one helper, called only from those switches; the app-wide sync never asks.
    expect(files.filter(f => /askForReminders\(/.test(readFileSync(f, 'utf8'))).map(rel))
      .toEqual(['src/features/progress/screens/photos.tsx', 'src/features/reminders/notifier.ts', 'src/features/routines/screens.tsx', 'src/features/settings/pages.tsx']);
    expect(files.filter(f => /features\/reminders\//.test(f) && /\.request\(/.test(readFileSync(f, 'utf8'))).map(rel)).toEqual(['src/features/reminders/notifier.ts']);
    expect(files.filter(f => /requestPermissions|\.request\(\)/.test(readFileSync(f, 'utf8')) && /onboarding|_layout|\(tabs\)/.test(f)).map(rel)).toEqual([]);
  });
});

describe('turning a reminder on in Settings', () => {
  test('asks iOS once, then puts the workout reminder on the planned days at the chosen time', async () => {
    const { n, last } = fakeNotifier('undetermined');
    setNotifierForTests(n);
    const repo = withPlan(memoryRepository());
    expect(plannedWorkoutDays(repo)).toEqual([0, 2, 4]);
    await show(<Section />, repo);
    await fireEvent(switchOf('workout'), 'onToggle', true);
    await waitFor(() => expect(n.request).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(last().map(r => [r.id, r.weekday, r.hour, r.minute])).toEqual([['workout-0', 0, 17, 30], ['workout-2', 2, 17, 30], ['workout-4', 4, 17, 30]]));
    expect(saved(repo).rem.workout).toBe(true);
    expect(checked('workout')).toBe(true);
    // A second reminder needs no second prompt.
    await fireEvent(switchOf('weekly'), 'onToggle', true);
    await waitFor(() => expect(last().map(r => r.id)).toEqual(['workout-0', 'workout-2', 'workout-4', 'weekly']));
    expect(n.request).toHaveBeenCalledTimes(1);
    expect(last().find(r => r.id === 'weekly')).toMatchObject({ weekday: 0, hour: 8, minute: 0, title: t('reminderWeeklyTitle') });
    // Turning them off takes them off the phone.
    await fireEvent(switchOf('workout'), 'onToggle', false);
    await fireEvent(switchOf('weekly'), 'onToggle', false);
    await waitFor(() => expect(last()).toEqual([]));
  });
  test('a new workout time is saved, kept after reopening, and rescheduled', async () => {
    const { n, last } = fakeNotifier('granted');
    setNotifierForTests(n);
    const repo = withPlan(memoryRepository());
    const page = await show(<Section />, repo);
    await fireEvent(switchOf('workout'), 'onToggle', true);
    await waitFor(() => expect(last()).toHaveLength(3));
    // The row opens its menu where it sits on screen; the test places it (its host views have no layout here).
    const row = screen.getByTestId('reminders-workoutTime');
    const place = jest.spyOn(View.prototype as unknown as { measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void }, 'measureInWindow')
      .mockImplementation(cb => cb(0, 300, 390, 44));
    await fireEvent.press(row);
    await fireEvent.press(await screen.findByRole('menuitem', { name: '7:00 AM' }));
    place.mockRestore();
    expect(saved(repo).rem.workoutTime).toBe('7:00 AM');
    await waitFor(() => expect(last().map(r => [r.weekday, r.hour, r.minute])).toEqual([[0, 7, 0], [2, 7, 0], [4, 7, 0]]));
    await page.unmount();
    await show(<Section />, repo);
    expect(screen.getByTestId('reminders-workoutTime')).toHaveTextContent(/7:00 AM/);
    expect(n.request).not.toHaveBeenCalled();
  });
  test('the food reminders keep which meals are on', async () => {
    setNotifierForTests(fakeNotifier('granted').n);
    const repo = memoryRepository();
    await show(<Section />, repo);
    await fireEvent(switchOf('food'), 'onToggle', true);
    expect(checked('breakfast')).toBe(true);
    await fireEvent(switchOf('lunch'), 'onToggle', false);
    expect(saved(repo).rem).toMatchObject({ food: true, breakfast: true, lunch: false, dinner: true });
  });
  test('if iOS says no, the switch goes back off and says where to allow notifications', async () => {
    const { n } = fakeNotifier('undetermined', 'denied');
    setNotifierForTests(n);
    const repo = memoryRepository();
    await show(<Section />, repo);
    await fireEvent(switchOf('weekly'), 'onToggle', true);
    await waitFor(() => expect(saved(repo).rem.weekly).toBe(false));
    expect(showToast).toHaveBeenCalledWith(t('settingsRemNeedsIos'), expect.anything());
    expect(n.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('reminders-ios')).toHaveTextContent(/Off/);
  });
  test('when the phone reports notifications unavailable, the choice is still kept, and nothing is asked or scheduled', async () => {
    const { n } = fakeNotifier('unavailable');
    setNotifierForTests(n);
    const repo = memoryRepository();
    await show(<Section />, repo);
    await fireEvent(switchOf('workout'), 'onToggle', true);
    await waitFor(() => expect(n.permission).toHaveBeenCalled());
    expect(saved(repo).rem.workout).toBe(true);
    expect(n.request).not.toHaveBeenCalled();
    expect(n.replace).not.toHaveBeenCalled();
  });
});

describe('a build without the notifications module', () => {
  test('shows every reminder off and greyed out, says they come later, and never asks', async () => {
    setNotifierForTests(null);
    const repo = memoryRepository();
    await show(<Section />, repo);
    expect(screen.getByText('Reminders arrive with notifications in a later version. Nothing here is sent yet.')).toBeTruthy();
    expect(checked('workout')).toBe(false);
    expect(screen.queryByTestId('reminders-ios')).toBeNull();
    const sw = screen.getAllByRole('switch');
    expect(sw.length).toBeGreaterThan(0);
    expect(sw.every(el => el.props.accessibilityState?.disabled === true)).toBe(true);
  });
});

describe('the phone notifications adapter', () => {
  test('asks for alerts and sounds, replaces only its own reminders, and counts weekdays from Sunday as iOS does', async () => {
    const calls: unknown[] = [];
    const fake = {
      getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', granted: false })),
      requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
      getAllScheduledNotificationsAsync: jest.fn(async () => [{ identifier: `${REMINDER_ID_PREFIX}weekly` }, { identifier: 'someone-else' }]),
      cancelScheduledNotificationAsync: jest.fn(async (id: string) => { calls.push(['cancel', id]); }),
      scheduleNotificationAsync: jest.fn(async (r: unknown) => { calls.push(['schedule', r]); return 'x'; }),
    };
    jest.doMock('expo-notifications', () => fake, { virtual: true });
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy that loads the mocked module
      const { notifier } = require('../src/features/reminders/notifier') as typeof import('../src/features/reminders/notifier');
      const n = notifier();
      expect(await n.permission()).toBe('undetermined');
      expect(fake.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(await n.request()).toBe('granted');
      expect(fake.requestPermissionsAsync).toHaveBeenCalledWith({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
      await n.replace(planReminders({ ...DEFAULT_PREFS.rem, workout: true, weekly: true }, [6]));
    });
    expect(calls).toEqual([
      ['cancel', `${REMINDER_ID_PREFIX}weekly`],
      ['schedule', { identifier: `${REMINDER_ID_PREFIX}workout-6`, content: { title: t('reminderWorkoutTitle'), body: t('reminderWorkoutBody'), sound: true }, trigger: { type: 'weekly', weekday: 1, hour: 17, minute: 30 } }],
      ['schedule', { identifier: `${REMINDER_ID_PREFIX}weekly`, content: { title: t('reminderWeeklyTitle'), body: t('reminderWeeklyBody'), sound: true }, trigger: { type: 'weekly', weekday: 2, hour: 8, minute: 0 } }],
    ]);
    jest.dontMock('expo-notifications');
  });
  test('times read on a 12-hour clock', () => {
    expect(parseTime('12:00 PM')).toEqual({ hour: 12, minute: 0 });
    expect(parseTime('12:30 AM')).toEqual({ hour: 0, minute: 30 });
    expect(parseTime('6:00 AM')).toEqual({ hour: 6, minute: 0 });
    expect(parseTime('7:00 PM')).toEqual({ hour: 19, minute: 0 });
  });
});
