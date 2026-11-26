import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { lockAtLaunch, lockDelayMs, nextLock, shouldLock, type LockState } from '../src/features/privacy-lock/timing';
import { authenticate, lockAvailable, type Biometrics } from '../src/features/privacy-lock/biometrics';
import { switchLock } from '../src/features/privacy-lock/turn-on';
import { PrivacyCover, resetLaunchForTests } from '../src/features/privacy-lock/cover';
import { rateInsight } from '../src/features/settings/rate';
import { SETTINGS_PREFS_KEY, loadSettingsPrefs, withPref } from '../src/features/settings/prefs';
import Section from '../src/app/settings/[section]';

const mockBio = { hasHardwareAsync: jest.fn(async () => true), isEnrolledAsync: jest.fn(async () => true), authenticateAsync: jest.fn(async (_o?: unknown) => ({ success: true }) as { success: boolean; error?: string }) };
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: () => mockBio.hasHardwareAsync(), isEnrolledAsync: () => mockBio.isEnrolledAsync(), authenticateAsync: (o: unknown) => mockBio.authenticateAsync(o) }));
const mockReview = { isAvailableAsync: jest.fn(async () => true), requestReview: jest.fn(async () => {}), storeUrl: jest.fn((): string | null => null) };
jest.mock('expo-store-review', () => ({ isAvailableAsync: () => mockReview.isAvailableAsync(), requestReview: () => mockReview.requestReview(), storeUrl: () => mockReview.storeUrl() }));
jest.mock('react-native-screens', () => ({ ...jest.requireActual('react-native-screens'), FullWindowOverlay: ({ children }: { children: React.ReactNode }) => children }));
let mockSection = 'privacy';
jest.mock('expo-router', () => {
  function Stack({ children }: { children: React.ReactNode }) { return children; }
  Stack.Screen = function Screen() { return null; };
  return { Stack, router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: () => ({ section: mockSection }) };
});
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { phoneOnly: false } } } }));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));

const MIN = 60_000;
const on = (after = '1') => ({ enabled: true, after });

describe('when Face ID lock asks again', () => {
  test('each Require Face ID choice waits its own time; Immediately waits none', () => {
    expect(['0', '1', '5', '15'].map(lockDelayMs)).toEqual([0, MIN, 5 * MIN, 15 * MIN]);
    expect(lockDelayMs('soon')).toBe(0);
  });
  test('coming back locks once the chosen time has passed, and not before', () => {
    expect(shouldLock(on('5'), 0, 5 * MIN - 1)).toBe(false);
    expect(shouldLock(on('5'), 0, 5 * MIN)).toBe(true);
    expect(shouldLock(on('0'), 1000, 1000)).toBe(true);
    expect(shouldLock({ enabled: false, after: '0' }, 0, 10 * MIN)).toBe(false);
    expect(shouldLock(on(), null, 10 * MIN)).toBe(false);
  });
  test('only the background counts as leaving; inactive (the Face ID prompt, Control Center) never locks', () => {
    let s: LockState = { locked: false, awayAt: null };
    s = nextLock(s, 'inactive', on('0'), true, 0);
    s = nextLock(s, 'active', on('0'), true, 10 * MIN);
    expect(s.locked).toBe(false);
    s = nextLock(s, 'inactive', on('1'), true, 0);
    s = nextLock(s, 'background', on('1'), true, 1000);
    s = nextLock(s, 'active', on('1'), true, 1000 + 30_000);
    expect(s).toEqual({ locked: false, awayAt: null });
    s = nextLock(s, 'background', on('1'), true, 0);
    s = nextLock(s, 'inactive', on('1'), true, 10);
    s = nextLock(s, 'active', on('1'), true, MIN);
    expect(s).toEqual({ locked: true, awayAt: null });
  });
  test('a lock that is off, or a phone that cannot ask, never locks, at launch or later', () => {
    expect(lockAtLaunch(on(), true).locked).toBe(true);
    expect(lockAtLaunch(on(), false).locked).toBe(false);
    expect(lockAtLaunch({ enabled: false, after: '1' }, true).locked).toBe(false);
    const locked = { locked: true, awayAt: null };
    expect(nextLock(locked, 'active', { enabled: false, after: '0' }, true, 0).locked).toBe(false);
    expect(nextLock(locked, 'active', on('0'), false, 0).locked).toBe(false);
  });
});

describe('asking for Face ID', () => {
  const host = (over: Partial<Biometrics> = {}): Biometrics => ({ hasHardwareAsync: async () => true, isEnrolledAsync: async () => true, authenticateAsync: async () => ({ success: true }), ...over });
  test('the web and phones without Face ID or Touch ID set up are unavailable, so nothing locks there', async () => {
    expect(await lockAvailable(null)).toBe(false);
    expect(await lockAvailable(host({ isEnrolledAsync: async () => false }))).toBe(false);
    expect(await lockAvailable(host({ hasHardwareAsync: async () => { throw new Error('x'); } }))).toBe(false);
    expect(await authenticate('Unlock Insight', null)).toBe('unavailable');
  });
  test('asks with the passcode fallback on and reads the answer', async () => {
    const ask = jest.fn(async () => ({ success: true }) as const);
    expect(await authenticate('Unlock Insight', host({ authenticateAsync: ask }))).toBe('ok');
    expect(ask).toHaveBeenCalledWith({ promptMessage: 'Unlock Insight', disableDeviceFallback: false });
    const answer = (error: string) => authenticate('x', host({ authenticateAsync: async () => ({ success: false, error }) as never }));
    expect(await answer('user_cancel')).toBe('cancelled');
    expect(await answer('passcode_not_set')).toBe('unavailable');
    expect(await answer('authentication_failed')).toBe('failed');
  });
});

describe('the Face ID lock switch', () => {
  test('turning it on saves only once Face ID goes through', async () => {
    const save = jest.fn();
    expect(await switchLock(true, save, async () => 'ok', false)).toBeNull();
    expect(save).toHaveBeenLastCalledWith(true);
    save.mockClear();
    expect(await switchLock(true, save, async () => 'cancelled', false)).toBe('settingsFaceIdNotConfirmed');
    expect(await switchLock(true, save, async () => 'unavailable', false)).toBe('settingsFaceIdUnavailable');
    expect(save).not.toHaveBeenCalled();
  });
  test('turning it off saves at once without asking, and the web just keeps the choice', async () => {
    const save = jest.fn(), auth = jest.fn();
    await switchLock(false, save, auth, false);
    await switchLock(true, save, auth, true);
    expect(save.mock.calls).toEqual([[false], [true]]);
    expect(auth).not.toHaveBeenCalled();
  });
});

describe('Rate Insight', () => {
  test('uses the system rating prompt where iOS offers it', async () => {
    const host = { isAvailableAsync: async () => true, requestReview: jest.fn(async () => {}), storeUrl: () => 'https://apps.apple.com/app/id1' }, open = jest.fn(async () => {});
    expect(await rateInsight(host, open)).toBe('review');
    expect(host.requestReview).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
  test('otherwise opens the store page when one is configured, and otherwise does nothing', async () => {
    const open = jest.fn(async () => {});
    expect(await rateInsight({ isAvailableAsync: async () => false, requestReview: jest.fn(), storeUrl: () => 'https://apps.apple.com/app/id1' }, open)).toBe('store');
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/app/id1');
    open.mockClear();
    expect(await rateInsight({ isAvailableAsync: async () => false, requestReview: jest.fn(), storeUrl: () => null }, open)).toBe('none');
    expect(await rateInsight({ isAvailableAsync: async () => { throw new Error('x'); }, requestReview: jest.fn(), storeUrl: () => null }, open)).toBe('none');
    expect(open).not.toHaveBeenCalled();
  });
});

const auth = (repository = memoryRepository()): AuthState => ({ session: null, demo: true, ready: true, configured: true, configError: null, repository: repository as never, pending: 0, conflicts: 0,
  syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null), createAccount: jest.fn(async () => null), signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}) });
const show = (ui: React.ReactNode, a = auth()) => render(<AuthContext.Provider value={a}><ThemeProvider>{ui}</ThemeProvider></AuthContext.Provider>);
const prefsIn = (repo: ReturnType<typeof memoryRepository>) => loadSettingsPrefs(repo as never);

beforeEach(() => {
  jest.clearAllMocks();
  mockBio.hasHardwareAsync.mockImplementation(async () => true);
  mockBio.isEnrolledAsync.mockImplementation(async () => true);
  mockBio.authenticateAsync.mockImplementation(async () => ({ success: true }));
  mockReview.isAvailableAsync.mockImplementation(async () => true);
  resetLaunchForTests();
});

describe('Settings wiring', () => {
  test('Privacy: switching Face ID lock on asks first; off saves at once; Require Face ID shows only while on', async () => {
    mockSection = 'privacy';
    const repo = memoryRepository(), a = auth(repo);
    await show(<Section />, a);
    const lock = await screen.findByRole('switch', { name: 'Face ID lock' });
    await waitFor(() => expect(lock.props.accessibilityState?.checked ?? lock.props['aria-checked']).toBe(true));
    await fireEvent(lock, 'valueChange', false);
    expect(prefsIn(repo).priv.lock).toBe(false);
    expect(mockBio.authenticateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText('Require Face ID')).toBeNull();
    mockBio.authenticateAsync.mockImplementationOnce(async () => ({ success: false, error: 'user_cancel' }));
    await act(async () => { await fireEvent(screen.getByRole('switch', { name: 'Face ID lock' }), 'valueChange', true); });
    expect(prefsIn(repo).priv.lock).toBe(false);
    await act(async () => { await fireEvent(screen.getByRole('switch', { name: 'Face ID lock' }), 'valueChange', true); });
    expect(mockBio.authenticateAsync).toHaveBeenLastCalledWith({ promptMessage: 'Turn on Face ID lock', disableDeviceFallback: false });
    expect(prefsIn(repo).priv.lock).toBe(true);
    expect(await screen.findByText('Require Face ID')).toBeTruthy();
  });
  test('Privacy: a phone without Face ID set up shows the lock as off', async () => {
    mockSection = 'privacy';
    mockBio.isEnrolledAsync.mockImplementation(async () => false);
    await show(<Section />);
    await waitFor(() => expect(screen.queryByText('Require Face ID')).toBeNull());
  });
  test('About: Rate Insight sits between What’s New and Send feedback and asks for the system rating', async () => {
    mockSection = 'about';
    await show(<Section />);
    const titles = screen.getAllByText(/What’s New|Rate Insight|Send feedback/).map(n => n.props.children);
    expect(titles).toEqual(['What’s New', 'Rate Insight', 'Send feedback']);
    await act(async () => { await fireEvent.press(screen.getByTestId('settings-rate')); });
    expect(mockReview.requestReview).toHaveBeenCalledTimes(1);
  });
});

describe('the lock and app switcher covers', () => {
  let listeners: ((s: AppStateStatus) => void)[] = [];
  const change = (s: AppStateStatus) => listeners.forEach(f => f(s));
  beforeEach(() => {
    listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, f: (s: AppStateStatus) => void) => { listeners.push(f); return { remove: () => { listeners = listeners.filter(g => g !== f); } }; }) as never);
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  });
  const withPrefs = (path: string, value: unknown) => {
    const repo = memoryRepository();
    repo.localSave(SETTINGS_PREFS_KEY, withPref(loadSettingsPrefs(repo as never), path, value));
    return repo;
  };

  test('with the lock on, opening Insight shows the lock and asks for Face ID; a match lets them in', async () => {
    let answer: (r: { success: boolean }) => void = () => {};
    mockBio.authenticateAsync.mockImplementationOnce(() => new Promise(r => { answer = r; }));
    await show(<PrivacyCover access />);
    expect(screen.getByTestId('privacy-lock')).toBeTruthy();
    expect(screen.getByText('Insight is locked')).toBeTruthy();
    await waitFor(() => expect(mockBio.authenticateAsync).toHaveBeenCalledWith({ promptMessage: 'Unlock Insight', disableDeviceFallback: false }));
    expect(screen.getByTestId('privacy-lock')).toBeTruthy();
    await act(async () => { answer({ success: true }); });
    await waitFor(() => expect(screen.queryByTestId('privacy-lock')).toBeNull());
  });
  test('a cancelled prompt keeps the lock with Unlock to try again', async () => {
    mockBio.authenticateAsync.mockImplementationOnce(async () => ({ success: false, error: 'user_cancel' }));
    await show(<PrivacyCover access />);
    expect(await screen.findByText("Face ID didn't go through. Tap Unlock to try again.")).toBeTruthy();
    await act(async () => { await fireEvent.press(screen.getByTestId('privacy-unlock')); });
    await waitFor(() => expect(screen.queryByTestId('privacy-lock')).toBeNull());
  });
  test('nobody is locked out on a phone without Face ID set up', async () => {
    mockBio.isEnrolledAsync.mockImplementation(async () => false);
    await show(<PrivacyCover access />);
    await waitFor(() => expect(screen.queryByTestId('privacy-lock')).toBeNull());
    expect(mockBio.authenticateAsync).not.toHaveBeenCalled();
  });
  test('nobody is locked out before they are in the app', async () => {
    await show(<PrivacyCover access={false} />);
    expect(screen.queryByTestId('privacy-lock')).toBeNull();
  });
  test('nobody is locked out with the lock off', async () => {
    await show(<PrivacyCover access />, auth(withPrefs('priv.lock', false)));
    expect(screen.queryByTestId('privacy-lock')).toBeNull();
    expect(mockBio.authenticateAsync).not.toHaveBeenCalled();
  });
  test('locks again after the chosen time in the background, not after a short trip', async () => {
    const now = jest.fn(() => 0);
    await show(<PrivacyCover access clock={now} />, auth(withPrefs('priv.blur', false)));
    await waitFor(() => expect(mockBio.authenticateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('privacy-lock')).toBeNull());
    await act(async () => { change('background'); });
    now.mockReturnValue(30_000);
    await act(async () => { change('active'); });
    expect(screen.queryByTestId('privacy-lock')).toBeNull();
    now.mockReturnValue(40_000);
    await act(async () => { change('background'); });
    now.mockReturnValue(40_000 + MIN);
    mockBio.authenticateAsync.mockImplementationOnce(async () => ({ success: false, error: 'user_cancel' }));
    await act(async () => { change('active'); });
    expect(screen.getByTestId('privacy-lock')).toBeTruthy();
  });
  test('Blur in app switcher covers the app while inactive and goes on return', async () => {
    await show(<PrivacyCover access />, auth(withPrefs('priv.lock', false)));
    expect(screen.queryByTestId('privacy-blur')).toBeNull();
    await act(async () => { change('inactive'); });
    expect(screen.getByTestId('privacy-blur')).toBeTruthy();
    await act(async () => { change('active'); });
    expect(screen.queryByTestId('privacy-blur')).toBeNull();
  });
  test('with Blur in app switcher off, the app shows in the switcher', async () => {
    const repo = withPrefs('priv.lock', false);
    repo.localSave(SETTINGS_PREFS_KEY, withPref(loadSettingsPrefs(repo as never), 'priv.blur', false));
    await show(<PrivacyCover access />, auth(repo));
    await act(async () => { change('inactive'); });
    expect(screen.queryByTestId('privacy-blur')).toBeNull();
  });
});
