// The way into the app from onboarding mockup v21: launch, Welcome's email sheet and Google stub, Skip for now and its two
// choices, the sample-data tour, the first-Home tips and the Home nudge.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AuthContext, signInWithGoogle, type AuthState } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { t } from '../src/i18n/en';
import { AUTH_ROUTES, MEDIUM_SHARE, detentOf } from '../src/features/navigation/presentation';
import { EmailSheet, emailProblem } from '../src/features/onboarding/auth-form';
import { googleNotice } from '../src/features/onboarding/welcome';
import { SkipSheet } from '../src/features/onboarding/welcome-skip';
import { chooseSkip } from '../src/features/onboarding/skip-choice';
import { LAUNCH_COLORS, LAUNCH_TIMING, PEAK, launchEnd, peakDash, peakHeight, peakStroke } from '../src/features/onboarding/launch';
import { onTourRequest, requestTour, takeTour, tourPending } from '../src/features/onboarding/tour/store';
import { TOUR_PAGES, tourSteps } from '../src/features/onboarding/tour/steps';
import { SampleTour } from '../src/features/onboarding/tour/sample-tour';
import { HomeTips, TIPS, deviceInsetBottom, TIPS_KEY, TIPS_SEEN_KEY, cardTop, finishTips, plusHole, scrimColor, tabHole, tipsDue, type Measurable } from '../src/features/onboarding/tips';
import { LATER_AT_KEY, LATER_COUNT_KEY, NUDGE_AGAIN_MS, nudgeDue, nudgeFor, nudgeLater } from '../src/features/onboarding/nudge/model';
import { NUDGE_RESUME, NudgeCard } from '../src/features/onboarding/nudge/nudge-card';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true } }));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
const mockToast = jest.fn();
jest.mock('../src/features/shell/toast', () => ({ ...jest.requireActual('../src/features/shell/toast'), showToast: (...a: unknown[]) => mockToast(...a) }));

const state = (more: Partial<AuthState> = {}): AuthState => ({ initialPullComplete: true, session: null, demo: false, ready: true, configured: true, configError: null,
  repository: null, pending: 0, conflicts: 0, syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null), createAccount: jest.fn(async () => null),
  signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}), ...more });
const wrap = (ui: React.ReactNode, auth = state()) => render(<AuthContext.Provider value={auth}><ThemeProvider>{ui}</ThemeProvider></AuthContext.Provider>);
/** A local key-value store like the repository's. */
function store(owner = 'user-1', seed: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(seed));
  return { owner, data, localGet: <T,>(key: string) => data.get(key) as T | undefined, localSave: (key: string, value: unknown) => { data.set(key, value); } };
}
const place = (x: number, y: number, w: number, h: number): Measurable => ({ measureInWindow: cb => cb(x, y, w, h) });

beforeEach(() => { jest.clearAllMocks(); takeTour(); });

describe('launch', () => {
  test('draws the line, then the name, then fades in about a second; Reduce Motion holds a still frame and fades', () => {
    expect(LAUNCH_TIMING.draw).toMatchObject({ delay: 40, duration: 720 });
    expect(LAUNCH_TIMING.name).toMatchObject({ delay: 380, duration: 420 });
    expect(LAUNCH_TIMING.out).toMatchObject({ delay: 860, duration: 260 });
    expect(launchEnd(false)).toBe(1120);
    expect(launchEnd(true)).toBe(650);
    expect(LAUNCH_COLORS).toEqual({ dark: { bg: '#0B0B0C', ink: '#F4F4F5' }, light: { bg: '#FAFAFA', ink: '#141416' } });
  });
  test('the mountain line keeps its proportions and stroke at any width', () => {
    expect(peakHeight(796)).toBe(470);
    expect(peakStroke(2, 796)).toBe(2);
    expect(peakStroke(2, 56)).toBeCloseTo(28.43, 1);
    expect(peakDash(0.5)).toEqual([PEAK.len * 0.5, PEAK.len + 1]);
    expect(peakDash(2)[0]).toBe(PEAK.len);
  });
});

describe('Google', () => {
  test('is a stub that says it is not set up, and Welcome turns that into one calm line', async () => {
    expect(await signInWithGoogle()).toEqual({ ok: false, reason: 'notConfigured' });
    expect(googleNotice({ ok: false, reason: 'notConfigured' })).toBe("Google sign-in isn't set up yet. Sign in with Apple or email instead.");
    expect(googleNotice({ ok: false, reason: 'cancelled' })).toBeNull();
    expect(googleNotice({ ok: true })).toBeNull();
    expect(t('obaGoogleOff')).not.toMatch(/!|—/);
  });
});

describe('email sheet', () => {
  test('opens as a medium sheet, like Skip for now, at the heights measured from the design', () => {
    expect(AUTH_ROUTES.email.mock).toBe('ob-email');
    expect(AUTH_ROUTES.skip.mock).toBe('ob-skip');
    expect(AUTH_ROUTES.email.options.sheetAllowedDetents).toEqual([detentOf(MEDIUM_SHARE['ob-email'])]);
    expect(AUTH_ROUTES.skip.options.sheetAllowedDetents).toEqual([detentOf(MEDIUM_SHARE['ob-skip'])]);
    expect(AUTH_ROUTES.email.options.presentation).toBe('formSheet');
    expect((require('../src/app/auth/email') as { default: unknown }).default).toBe(EmailSheet);
    expect((require('../src/app/auth/skip') as { default: unknown }).default).toBe(SkipSheet);
  });
  test('checks the email and password before it asks', () => {
    expect(emailProblem('', 'secret12')).toBe('invalidEmail');
    expect(emailProblem('a@b', 'secret12')).toBe('invalidEmail');
    expect(emailProblem('maya@example.com', '')).toBe('requiredPassword');
    expect(emailProblem(' maya@example.com ', 'secret12')).toBeNull();
  });
  test('one Continue for new and returning people; a failure shows in plain words', async () => {
    const continueWithEmail = jest.fn(async () => 'authFailed' as const);
    await wrap(<EmailSheet />, state({ continueWithEmail }));
    expect(screen.getByRole('header')).toHaveTextContent(t('obaEmail'));
    expect(screen.getByText(t('obaEmailLede'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('email-sheet-continue'));
    expect(continueWithEmail).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth-error')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(t('obaEmailLabel')), ' maya@example.com ');
    await fireEvent.changeText(screen.getByLabelText(t('obaPasswordLabel')), 'secret123');
    await act(async () => { fireEvent.press(screen.getByTestId('email-sheet-continue')); await new Promise(r => setTimeout(r, 0)); });
    expect(continueWithEmail).toHaveBeenCalledWith('maya@example.com', 'secret123');
    expect(screen.getByTestId('auth-error')).toHaveTextContent(t('authFailed'));
  });
});

describe('Skip for now', () => {
  test('a guest goes into setup; sample data asks for the tour and opens the example week', () => {
    const auth = { continueAsGuest: jest.fn(), lookAround: jest.fn() }, replace = jest.fn();
    chooseSkip('guest', { auth, replace });
    expect(replace).toHaveBeenCalledWith('/onboarding');
    expect(auth.continueAsGuest).toHaveBeenCalledTimes(1);
    expect(auth.lookAround).not.toHaveBeenCalled();
    expect(tourPending()).toBe(false);
    chooseSkip('demo', { auth, replace });
    expect(auth.lookAround).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(takeTour()).toBe(true);
    expect(takeTour()).toBe(false);
  });
  test('the sheet offers both choices with their lines, closes, then acts', async () => {
    jest.useFakeTimers();
    const auth = state({ continueAsGuest: jest.fn() });
    await wrap(<SkipSheet />, auth);
    expect(screen.getByText(t('obaSkipLede'))).toBeTruthy();
    expect(screen.getByText(t('obaGuestBody'))).toBeTruthy();
    expect(screen.getByText(t('obaSampleBody'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('skip-demo'));
    expect(router.back).toHaveBeenCalled();
    expect(auth.lookAround).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(auth.lookAround).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('skip-guest'));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(router.replace).toHaveBeenCalledWith('/onboarding');
    expect(auth.continueAsGuest).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('sample-data tour', () => {
  test('four stops in order, each in its tab colour, with the design words', () => {
    expect(TOUR_PAGES).toEqual(['home', 'training', 'food', 'progress']);
    const steps = tourSteps();
    expect(steps.map(s => s.href)).toEqual(['/', '/workouts', '/food', '/progress']);
    expect(steps.map(s => s.eyebrow)).toEqual(['Sample data · Home', 'Sample data · Training', 'Sample data · Food', 'Sample data · Progress']);
    expect(steps[2]).toMatchObject({ title: 'Food', color: 'food', body: 'Meals, calories and protein against your targets.' });
    expect(steps[0].body).toBe('Your day at a glance. This is an example week, so look around freely.');
  });
  test('a request reaches a listener once', () => {
    const heard = jest.fn(), off = onTourRequest(heard);
    requestTour(); off(); requestTour();
    expect(heard).toHaveBeenCalledTimes(1);
  });
  test('plays on sample data after a request, opens each tab, and ends on Home with a toast', async () => {
    requestTour();
    await wrap(<SampleTour demo />);
    await waitFor(() => expect(screen.getByTestId('coach-tour')).toBeTruthy());
    expect(router.navigate).toHaveBeenLastCalledWith('/');
    expect(screen.getByTestId('coach-skip')).toBeTruthy();
    for (const href of ['/workouts', '/food', '/progress']) {
      await fireEvent.press(screen.getByTestId('coach-next'));
      expect(router.navigate).toHaveBeenLastCalledWith(href);
    }
    expect(screen.queryByTestId('coach-skip')).toBeNull();
    expect(screen.getByTestId('coach-next')).toHaveProp('accessibilityLabel', 'Start exploring');
    await fireEvent.press(screen.getByTestId('coach-next'));
    expect(screen.queryByTestId('coach-tour')).toBeNull();
    expect(router.navigate).toHaveBeenLastCalledWith('/');
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Sample data. Make an account any time in Settings.'));
  });
  test('never plays without a request or off sample data', async () => {
    await wrap(<SampleTour demo />);
    requestTour();
    const other = await wrap(<SampleTour demo={false} />);
    await new Promise(r => setTimeout(r, 600));
    expect(screen.queryByTestId('coach-tour')).toBeNull();
    other.unmount();
  });
});

describe('first-Home tips', () => {
  test('are due once after setup, never on sample data, and Got it clears the flag', () => {
    expect(tipsDue(store('user-1'))).toBe(false);
    expect(tipsDue(store('demo', { [TIPS_KEY]: '1' }))).toBe(false);
    const s = store('user-1', { [TIPS_KEY]: '1' });
    expect(tipsDue(s)).toBe(true);
    finishTips(s);
    expect(s.data.get(TIPS_KEY)).toBeNull();
    expect(s.data.get(TIPS_SEEN_KEY)).toBe(true);
    expect(tipsDue(s)).toBe(false);
    expect(tipsDue(store('guest', { [TIPS_KEY]: '1', [TIPS_SEEN_KEY]: true }))).toBe(false);
  });
  test('three tips over the hero, the + and the initial, then Got it', async () => {
    const s = store('user-1', { [TIPS_KEY]: '1' });
    await wrap(<HomeTips store={s} hero={{ current: place(16, 44, 361, 588) }} avatar={{ current: place(333, 53, 44, 44) }} />);
    await waitFor(() => expect(screen.getByTestId('coach-tips')).toBeTruthy());
    const words = TIPS.map(tip => [t(tip.title), t(tip.body)]);
    expect(words).toEqual([
      ['Your day in one number', 'The score blends training, food and sleep. Tap a day in This week to look back.'],
      ['Log from anywhere', 'Plus adds a meal, a workout, water or a weigh-in.'],
      ['Settings live here', 'Your initial opens Settings: goals, units, connections and reminders.'],
    ]);
    for (let i = 0; i < 3; i++) {
      expect(screen.getByText(`Tip ${i + 1} of 3`)).toBeTruthy();
      expect(screen.getByText(words[i][0])).toBeTruthy();
      expect(screen.queryByTestId('coach-skip')).toBeNull();
      expect(screen.getByTestId('coach-next')).toHaveProp('accessibilityLabel', i < 2 ? 'Next' : 'Got it');
      await fireEvent.press(screen.getByTestId('coach-next'));
    }
    expect(screen.queryByTestId('coach-tips')).toBeNull();
    expect(s.data.get(TIPS_KEY)).toBeNull();
    expect(s.data.get(TIPS_SEEN_KEY)).toBe(true);
  });
  test.each([[{ x: 350, y: 70 }, true], [{ x: 100, y: 400 }, false]] as const)('in the last tip, a tap at %j opens Settings: %s', async (at, opens) => {
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
    router.push.mockClear();
    const s = store('user-1', { [TIPS_KEY]: '1' });
    await wrap(<HomeTips store={s} hero={{ current: place(16, 44, 361, 588) }} avatar={{ current: place(333, 53, 44, 44) }} />);
    await waitFor(() => expect(screen.getByTestId('coach-tips')).toBeTruthy());
    for (let i = 0; i < 2; i++) await fireEvent.press(screen.getByTestId('coach-next'));
    await waitFor(() => expect(screen.getByText('Tip 3 of 3')).toBeTruthy());
    await act(async () => { await new Promise(done => setTimeout(done, 50)); });
    await act(async () => { fireEvent(screen.getByTestId('coach-scrim'), 'responderRelease', { nativeEvent: { locationX: at.x, locationY: at.y } }); });
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    expect(screen.queryByTestId('coach-tips')).toBeNull();
    expect(s.data.get(TIPS_SEEN_KEY)).toBe(true);
    expect(router.push.mock.calls).toEqual(opens ? [['/settings']] : []);
  });
  test('the card sits under its target when it fits and over it when not; the scrim is darker for tips', () => {
    expect(cardTop({ x: 0, y: 100, w: 10, h: 100, r: 0 }, 150, 852, 'auto')).toBe(214);
    expect(cardTop({ x: 0, y: 700, w: 10, h: 60, r: 0 }, 150, 852, 'auto')).toBe(536);
    expect(cardTop({ x: 0, y: 44, w: 10, h: 600, r: 0 }, 164, 852, 'below')).toBe(658);
    expect(scrimColor('tips', true)).toBe('rgba(0, 0, 0, 0.58)');
    expect(scrimColor('tour', false)).toBe('rgba(16, 18, 20, 0.26)');
  });
  test('the + and tab spotlights sit on the bar, inside the screen', () => {
    const screenSize = { width: 393, height: 852, insetBottom: 34 };
    const plus = plusHole(screenSize, 'home'), tab = tabHole(screenSize, 'food');
    for (const hole of [plus, tab]) {
      expect(hole.w).toBe(hole.h);
      expect(hole.y + hole.h).toBeLessThanOrEqual(852);
      expect(hole.y).toBeGreaterThan(700);
    }
    expect(plus.x).toBeGreaterThan(tab.x);
    // On the + exactly: 24 pt above the bottom on a phone with no inset, 28 pt to its centre.
    const flat = plusHole({ width: 393, height: 852, insetBottom: 0 }, 'home');
    expect(flat.y + flat.h / 2).toBe(800);
    // The bar is placed from the phone's own inset, not the tabs' larger one that includes the bar.
    expect(deviceInsetBottom()).toBeLessThan(60);
  });
});

describe('Home nudge', () => {
  const done = (skipped: { about: boolean; goals: boolean }, more: Record<string, unknown> = {}, owner = 'user-1') =>
    store(owner, { onboardingComplete: true, onboardingSkipped: skipped, ...more });
  test('says what was skipped and lights the line for what is done', () => {
    expect(nudgeFor({ about: false, goals: false })).toBeNull();
    expect(nudgeFor({ about: true, goals: true })).toMatchObject({ title: 'obaNudgeBoth', body: 'obaNudgeBothBody', frac: 0.12 });
    expect(nudgeFor({ about: true, goals: false })).toMatchObject({ title: 'obaNudgeAbout', frac: 0.5 });
    expect(nudgeFor({ about: false, goals: true })).toMatchObject({ title: 'obaNudgeGoals', frac: 0.5 });
  });
  test('shows after setup with a skip, never on sample data; Later waits three days once, then stops', () => {
    expect(nudgeDue(store('user-1', { onboardingSkipped: { about: true, goals: true } }))).toBeNull();
    expect(nudgeDue(done({ about: true, goals: true }, {}, 'demo'))).toBeNull();
    const s = done({ about: false, goals: true }), now = 1_000_000_000_000;
    expect(nudgeDue(s, now)?.title).toBe('obaNudgeGoals');
    expect(nudgeLater(s, now)).toBe('obaLaterFirst');
    expect(s.data.get(LATER_COUNT_KEY)).toBe(1);
    expect(s.data.get(LATER_AT_KEY)).toBe(now);
    expect(nudgeDue(s, now + NUDGE_AGAIN_MS - 1)).toBeNull();
    expect(nudgeDue(s, now + NUDGE_AGAIN_MS)?.title).toBe('obaNudgeGoals');
    expect(nudgeLater(s, now + NUDGE_AGAIN_MS)).toBe('obaLaterLast');
    expect(nudgeDue(s, now + NUDGE_AGAIN_MS * 10)).toBeNull();
  });
  test('the card continues setup where it was skipped, or steps aside with a toast', async () => {
    const s = done({ about: true, goals: true });
    await wrap(<NudgeCard store={s} />);
    expect(screen.getByText('Finish setting up')).toBeTruthy();
    expect(screen.getByText('Your basics and goals shape calorie and protein suggestions.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-nudge-continue'));
    expect(router.push).toHaveBeenCalledWith(NUDGE_RESUME);
    expect(NUDGE_RESUME).toEqual({ pathname: '/onboarding', params: { resume: '1' } });
    await fireEvent.press(screen.getByTestId('home-nudge-later'));
    expect(mockToast).toHaveBeenCalledWith('We will ask again in a few days');
    await waitFor(() => expect(screen.queryByTestId('home-nudge')).toBeNull());
  });
  test('sample data never shows it', async () => {
    await wrap(<NudgeCard store={done({ about: true, goals: true }, {}, 'demo')} />);
    expect(screen.queryByTestId('home-nudge')).toBeNull();
  });
});
