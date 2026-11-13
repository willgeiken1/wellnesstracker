import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Onboarding, OnboardingDraftProvider } from '../src/features/onboarding/screen';
import { estimateTargets, readProfile, saveProfile, validProfile, type ProfileInput } from '../src/features/onboarding/model';
import { shouldOfferHealth } from '../src/features/onboarding/health-step';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { loadTiles } from '../src/features/home/tiles';
import type { HealthAccess, HealthSource } from '../src/features/health/source';
import { t } from '../src/i18n/en';
import { memoryRepository } from './workout-repository';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn(async () => ({ forOwner: () => ({ localGet: () => undefined, localSave: () => {} }), wipeAll: () => {} })) }));
// Made-up Apple Health: no real health values anywhere in these tests.
let mockSource: HealthSource | null = null;
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => mockSource }));

function fakeHealth(start: HealthAccess, options: { failRequest?: boolean } = {}) {
  let access = start;
  const source: HealthSource & { request: jest.Mock } = {
    access: jest.fn(async () => access),
    request: jest.fn(async () => { if (options.failRequest) throw new Error('synthetic'); access = 'asked'; }),
    weights: jest.fn(async () => []), steps: jest.fn(async () => 0), sleep: jest.fn(async () => []),
  };
  return source;
}

const state = (repository = memoryRepository()): AuthState => ({ initialPullComplete: true, session: { user: { id: 'synthetic' } } as AuthState['session'], demo: false, ready: true,
  configured: true, configError: null, repository, pending: 0, conflicts: 0, syncStatus: 'idle', lookAround: jest.fn(), signIn: jest.fn(async () => null),
  createAccount: jest.fn(async () => null), signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}) });

/** About you (birthday only), then Start, then Finish. */
async function finishSetup(auth = state()) {
  await render(<AuthContext.Provider value={auth}><OnboardingDraftProvider><ThemeProvider><Onboarding /></ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>);
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')), '2000-01-01');
  await fireEvent.press(screen.getByRole('button', { name: t('continueOnboarding') }));
  await fireEvent.press(screen.getByRole('button', { name: t('finishOnboarding') }));
  return auth;
}

beforeEach(() => { jest.clearAllMocks(); mockSource = null; });

describe('Apple Health step (REDESIGN §3.6: three steps plus Health)', () => {
  test('after Start, it says what Insight reads and that it only reads, then Not now goes Home without asking', async () => {
    const source = fakeHealth('ask'); mockSource = source;
    const auth = await finishSetup();
    expect(await screen.findByRole('header', { name: t('healthStepTitle') })).toBeTruthy();
    for (const key of ['healthStepWeight', 'healthStepSteps', 'healthStepSleep', 'healthStepPrivacy'] as const) expect(screen.getByText(t(key))).toBeTruthy();
    expect(screen.queryByText(/heart|later update|coming soon/i)).toBeNull();
    // The profile is already saved before this step, so skipping loses nothing.
    expect(auth.repository!.list('profile')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: t('healthStepSkip') }));
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(source.request).not.toHaveBeenCalled();
    expect(loadTiles(auth.repository).order).not.toContain('steps');
  });

  test('Connect shows Apple\'s sheet, puts Steps and Sleep on Home, then goes Home', async () => {
    const source = fakeHealth('ask'); mockSource = source;
    const auth = await finishSetup();
    await fireEvent.press(await screen.findByRole('button', { name: t('appleHealthConnect') }));
    await act(async () => {});
    expect(source.request).toHaveBeenCalledTimes(1);
    expect(loadTiles(auth.repository).order).toEqual(expect.arrayContaining(['steps', 'sleep']));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  test('a failed request stays on the step with a quiet retry row', async () => {
    mockSource = fakeHealth('ask', { failRequest: true });
    await finishSetup();
    await fireEvent.press(await screen.findByRole('button', { name: t('appleHealthConnect') }));
    await act(async () => {});
    expect(screen.getByTestId('onboarding-health-failed')).toHaveTextContent(t('appleHealthFailed'), { exact: false });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t('healthStepSkip') })).toBeEnabled();
  });

  test.each([['already asked (a reinstall)', () => fakeHealth('asked')], ['not on this phone or build', () => null]])('when Apple Health was %s, setup goes straight Home', async (_, make) => {
    mockSource = make();
    await finishSetup();
    await act(async () => {});
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(screen.queryByText(t('healthStepTitle'))).toBeNull();
  });

  test('shouldOfferHealth is false when the access check throws', async () => {
    const source = fakeHealth('ask'); source.access = jest.fn(async () => { throw new Error('synthetic'); });
    await expect(shouldOfferHealth(source)).resolves.toBe(false);
    await expect(shouldOfferHealth(null)).resolves.toBe(false);
    await expect(shouldOfferHealth(fakeHealth('ask'))).resolves.toBe(true);
  });
});

describe('weight goal', () => {
  const input: ProfileInput = { name: 'Synthetic', dob: '2000-10-27', unit: 'kg', height: '180', weight: '80', sex: 'male', activity: 'light' };
  const kcal = (goal?: ProfileInput['goal']) => Math.round(estimateTargets({ ...input, goal }, '2026-10-27')!.energy_kj / 4.184);

  test('maintain and a missing goal estimate the same; lose is 400 under and gain 250 over, as in the web app', () => {
    expect(kcal(undefined)).toBe(kcal('maintain'));
    expect(kcal('maintain') - kcal('lose')).toBe(400);
    expect(kcal('gain') - kcal('maintain')).toBe(250);
    // Protein follows body weight, not the goal; carbs take up the change.
    const lose = estimateTargets({ ...input, goal: 'lose' }, '2026-10-27')!, keep = estimateTargets(input, '2026-10-27')!;
    expect(lose.protein_g).toBe(keep.protein_g);
    expect(lose.carbs_g).toBeLessThan(keep.carbs_g);
  });

  test('is saved on this phone with the other extras and read back; older profiles read as maintain', () => {
    const repo = memoryRepository();
    saveProfile(repo, { ...input, goal: 'gain' }, '2026-10-27');
    expect(repo.localGet('profileExtras')).toEqual({ sex: 'male', activity: 'light', goal: 'gain' });
    expect(readProfile(repo).goal).toBe('gain');
    repo.localSave('profileExtras', { sex: 'male', activity: 'light' });
    expect(readProfile(repo).goal).toBe('maintain');
    repo.localSave('profileExtras', { sex: 'male', activity: 'light', goal: 'bulk' });
    expect(readProfile(repo).goal).toBe('maintain');
  });

  test('an unknown goal is not a valid profile', () => {
    expect(validProfile({ ...input, goal: 'bulk' as never }, '2026-10-27')).toBe(false);
    expect(validProfile({ ...input, goal: 'lose' }, '2026-10-27')).toBe(true);
  });

  test('About you offers Lose, Maintain and Gain with Maintain chosen, and the choice sets the Start estimate and its line', async () => {
    mockSource = null;
    await render(<AuthContext.Provider value={state()}><OnboardingDraftProvider><ThemeProvider><Onboarding /></ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>);
    expect(screen.getByRole('tab', { name: t('goalMaintain') })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: t('goalLose') }));
    await fireEvent.changeText(screen.getByLabelText(t('birthDate')), '2000-01-01');
    await fireEvent.press(screen.getByRole('tab', { name: t('metricUnits') }));
    await fireEvent.changeText(screen.getByLabelText(t('profileHeight').replace('{unit}', 'cm')), '180');
    await fireEvent.changeText(screen.getByLabelText(t('profileWeight').replace('{unit}', 'kg')), '80');
    await fireEvent.press(screen.getByRole('tab', { name: t('sexMale') }));
    await fireEvent.press(screen.getByRole('button', { name: t('continueOnboarding') }));
    expect(screen.getByText(t('estimatedTargetsHelpLose'))).toBeTruthy();
    const lose = estimateTargets({ ...input, dob: '2000-01-01', goal: 'lose' })!;
    expect(screen.getByLabelText(t('targetCalories'))).toHaveDisplayValue(String(Math.round(lose.energy_kj / 4.184)));
  });
});
