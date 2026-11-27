import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import { t } from '../src/i18n/en';
import { estimateTargets } from '../src/features/onboarding/model';
import {
  blankDraft, heightLabel, heightOptions, markSkip, nextOf, prevOf, routinePlan, skipTarget, slotLabel, suggest, switchUnit, withKcal, withMacro, type FlowDraft,
} from '../src/features/onboarding/flow/model';
import { ONBOARDING_TIPS, addSuggestedRoutines, isSetUp, saveOnboarding, saveResumed } from '../src/features/onboarding/flow/save';
import { Onboarding, OnboardingDraftProvider } from '../src/features/onboarding/screen';
import { ROUTINES_KEY, createRoutinesStore, type RoutinesStore } from '../src/features/routines/store';
import type { RoutinesState } from '../src/features/routines/model';
import { applyAppIcon } from '../src/features/settings/app-icon';
import { loadSettingsPrefs } from '../src/features/settings/prefs';
import { memoryRepository } from './workout-repository';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  Stack: { Screen: () => null }, useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
const mockHealth = { access: 'ask' as 'ask' | 'asked' | 'unavailable', busy: false, added: null, failed: false, connect: jest.fn() };
jest.mock('../src/features/health/use-apple-health', () => ({ useAppleHealth: () => ({ ...mockHealth }) }));
const mockRing = { state: 'off' as 'off' | 'on' | 'unavailable', busy: false, failed: false, connect: jest.fn(), refresh: jest.fn(), disconnect: jest.fn() };
jest.mock('../src/features/health/use-oura', () => ({ useOura: () => mockRing }));
let mockStore: RoutinesStore;
jest.mock('../src/features/routines/store', () => ({ ...jest.requireActual('../src/features/routines/store'), routinesStoreFor: () => mockStore }));
jest.mock('../src/features/settings/app-icon', () => ({ ...jest.requireActual('../src/features/settings/app-icon'), applyAppIcon: jest.fn(async () => 'set') }));

const DAY = '2026-11-26';
/** A Routines store over memory, with the outside write the app's storage gives it. */
let mockWrite: (next: RoutinesState) => void = () => {};
const memoryStore = () => {
  let s: unknown; const ls = new Set<() => void>();
  mockWrite = next => { s = next; ls.forEach(l => l()); };
  return createRoutinesStore({ get: () => s, save: v => { s = v; }, subscribe: l => { ls.add(l); return () => { ls.delete(l); }; } });
};
/** The reference basics: 182.1 lb, 5 ft 11 in, 34, sex not given, active. */
const basics = (over: Partial<FlowDraft> = {}): FlowDraft => ({ ...blankDraft('lb'), name: 'Sam Example', heightIn: 71, weight: '182.1', age: '34', activity: 'active', ...over });
const fallback = { kcal: 2200, p: 165 };
const names = { morning: 'Morning', night: 'Night', water: 'Glass of water', stretch: 'Stretch, 5 minutes', outside: 'Ten minutes outside', read: 'Read, 15 minutes', screens: 'Screens off' };

beforeEach(() => {
  jest.mocked(router.replace).mockClear(); jest.mocked(router.back).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(applyAppIcon).mockClear();
  Object.assign(mockHealth, { access: 'ask', busy: false }); Object.assign(mockRing, { state: 'off', busy: false });
  mockStore = memoryStore();
});

describe('targets', () => {
  test('the reference basics suggest 2,370 kcal, 165 g protein, 279 g carbs and 66 g fat', () => {
    expect(suggest(basics(), 'maintain', fallback, DAY)).toEqual({ kcal: 2370, p: 165, c: 279, f: 66, est: true });
  });
  test('Cut is 85 percent and Bulk 110 percent, to the nearest ten; protein stays 2 g per kg', () => {
    expect(suggest(basics(), 'cut', fallback, DAY)).toMatchObject({ kcal: 2010, p: 165 });
    expect(suggest(basics(), 'bulk', fallback, DAY)).toMatchObject({ kcal: 2610, p: 165 });
  });
  test('sex shifts the estimate by +5 male, -161 female, and the midpoint -78 when not given', () => {
    const kcal = (sex: FlowDraft['sex']) => suggest(basics({ sex }), 'maintain', fallback, DAY).kcal;
    const raw = (sex: '' | 'male' | 'female') => estimateTargets({ name: '', dob: '1992-01-01', unit: 'kg', height: '180.34', weight: String(182.1 / 2.2046226218487757), sex, activity: 'active' }, DAY)!.energy_kj / 4.184;
    // 83 kcal of BMR either side of the midpoint, times 1.15, then rounded to the nearest ten.
    expect(Math.abs(raw('male') - raw('') - 83 * 1.15)).toBeLessThanOrEqual(10);
    expect(Math.abs(raw('') - raw('female') - 83 * 1.15)).toBeLessThanOrEqual(10);
    expect(kcal('none')).toBe(kcal(''));
  });
  test('without the basics the app targets are the start, marked as typical', () => {
    expect(suggest(blankDraft(), 'maintain', fallback, DAY)).toEqual({ kcal: 2200, p: 165, f: 61, c: 248, est: false });
  });
  test('moving calories keeps protein, sets fat to 25 percent and gives carbs the rest; a macro moves calories', () => {
    const base = suggest(basics(), 'maintain', fallback, DAY);
    expect(withKcal(base, 2420)).toEqual({ ...base, kcal: 2420, f: 67, c: 289 });
    expect(withMacro(base, 'p', 180)).toEqual({ ...base, p: 180, kcal: Math.round((180 * 4 + 279 * 4 + 66 * 9) / 10) * 10 });
  });
});

describe('units', () => {
  test('switching units converts the weight typed to one decimal and keeps the height', () => {
    const kg = switchUnit(basics(), 'kg');
    expect(kg).toMatchObject({ unit: 'kg', weight: '82.6', heightIn: 71 });
    expect(switchUnit(kg, 'lb').weight).toBe('182.1');
  });
  test('height menus run 4 ft 6 in to 7 ft 0 in, or 140 to 210 cm', () => {
    const us = heightOptions('lb'), cm = heightOptions('kg');
    expect([us[0].l, us.at(-1)!.l, us.length]).toEqual(['4 ft 6 in', '7 ft 0 in', 31]);
    expect([cm[0].l, cm.at(-1)!.l, cm.length]).toEqual(['140 cm', '210 cm', 71]);
    expect([heightLabel(71, 'lb'), heightLabel(71, 'kg')]).toEqual(['5 ft 11 in', '180 cm']);
  });
  test('quiz times follow the 12 or 24 hour clock', () => {
    expect(['5.5', '6.5', '7.5', '8.5'].map(v => slotLabel('wake', v))).toEqual(['Before 6 AM', '6 to 7 AM', '7 to 8 AM', 'After 8 AM']);
    expect(['20.5', '21.5', '22.5', '23'].map(v => slotLabel('wind', v))).toEqual(['Before 9 PM', '9 to 10 PM', '10 to 11 PM', 'After 11 PM']);
    expect(slotLabel('wake', '6.5', true)).toBe('06:00 to 07:00');
  });
});

describe('order and skip', () => {
  test('Not now on About you goes to goals, on Goals to connect, and on the quiz or routine to the finale', () => {
    const d = blankDraft();
    expect([skipTarget('name', d), skipTarget('body', d), skipTarget('goals', d), skipTarget('targets', d)]).toEqual(['goals', 'goals', 'connect', 'connect']);
    expect(['quiz', 'quiz-2', 'quiz-3', 'routine'].map(s => skipTarget(s as never, d))).toEqual(['finale', 'finale', 'finale', 'finale']);
    expect(markSkip('body', d).skipped).toEqual({ about: true, goals: false });
    expect(markSkip('targets', d).skipped).toEqual({ about: false, goals: true });
  });
  test('Back skips over skipped steps, and from the finale to quiz 1 when the routines were skipped there', () => {
    const d = { ...blankDraft(), skipped: { about: true, goals: true } };
    expect(prevOf('goals', d)).toBe('name');
    expect(prevOf('connect', d)).toBe('goals');
    expect(prevOf('finale', d)).toBe('quiz');
    expect(prevOf('finale', { ...d, quiz: { ...d.quiz, wind: '21.5' } })).toBe('routine');
    expect(prevOf('name', d)).toBeNull();
  });
  test('a resumed setup shows only the skipped sections, then ends', () => {
    const both = { ...blankDraft(), skipped: { about: true, goals: true } }, about = { ...blankDraft(), skipped: { about: true, goals: false } };
    expect([nextOf('name', both, true), nextOf('body', both, true), nextOf('goals', both, true), nextOf('targets', both, true)]).toEqual(['body', 'goals', 'targets', null]);
    expect(nextOf('body', about, true)).toBeNull();
    expect(skipTarget('name', about, true)).toBeNull();
    expect(prevOf('targets', both, true)).toBe('goals');
    expect(prevOf('body', both, true)).toBeNull();
  });
});

describe('what setup saves', () => {
  test('Open Insight writes the profile, weight, extras, units, targets, goals and flow state', () => {
    const repo = memoryRepository();
    const t1 = suggest(basics(), 'maintain', fallback, DAY);
    saveOnboarding(repo, { ...basics(), goals: { train: true, eat: true, sleep: false, routines: false }, t: t1 }, DAY);
    expect(repo.list('profile')).toHaveLength(1);
    expect(repo.list('profile')[0].data).toMatchObject({ name: 'Sam', dob: '1992-01-01', weight_unit: 'lb', height_m: 1.8034 });
    expect(repo.list('weigh_ins')[0].data).toMatchObject({ day: DAY, weight_kg: expect.closeTo(82.6, 1), entered_unit: 'lb', source: 'app' });
    expect(repo.localGet('profileExtras')).toEqual({ sex: '', activity: 'active' });
    expect(loadSettingsPrefs(repo).units).toMatchObject({ weight: 'lb', height: 'ftin', distance: 'mi', energy: 'kcal' });
    expect(repo.list('food_targets')[0].data).toEqual({ day: DAY, energy_kj: 2370 * 4.184, protein_g: 165, carbs_g: 279, fat_g: 66 });
    expect(loadSettingsPrefs(repo).goals).toMatchObject({ kcal: 2370, protein: 165 });
    expect(repo.localGet('targetBasis')).toBe('estimated');
    expect(repo.localGet('targetPlan')).toBe('maintain');
    expect(repo.localGet('onboardingGoals')).toEqual({ train: true, eat: true, sleep: false, routines: false });
    expect(repo.localGet('onboardingSkipped')).toEqual({ about: false, goals: false });
    expect(repo.localGet('onboardingComplete')).toBe(true);
    expect(repo.localGet(ONBOARDING_TIPS)).toBe('1');
  });
  test('metric units save as kilograms, centimetres and kilometres; a plan or an edit makes the targets their own', () => {
    const repo = memoryRepository(), d = switchUnit(basics({ plan: 'cut' }), 'kg');
    saveOnboarding(repo, { ...d, t: suggest(d, 'cut', fallback, DAY) }, DAY);
    expect(loadSettingsPrefs(repo).units).toMatchObject({ weight: 'kg', height: 'cm', distance: 'km' });
    expect(repo.localGet('targetBasis')).toBe('manual');
    expect(repo.localGet('targetPlan')).toBe('cut');
  });
  test('a weight filled from Apple Health is not saved again as a typed weigh-in, and targets worked out from it are not saved', () => {
    const repo = memoryRepository();
    // Made-up reading, kept the way the Apple Health import keeps it.
    const reading = repo.save('weigh_ins', { day: '2026-11-25', weight_kg: 82.6, source: 'healthkit' });
    const d = switchUnit({ ...basics({ weight: (82.6 * 2.2046226218487757).toFixed(1), filled: true, healthKg: 82.6 }), goals: { train: false, eat: true, sleep: false, routines: false } }, 'kg');
    saveOnboarding(repo, { ...d, t: suggest(d, 'maintain', fallback, DAY) }, DAY);
    expect(repo.list('weigh_ins')).toEqual([reading]);
    expect(repo.list('food_targets')).toEqual([]);
    expect(loadSettingsPrefs(repo).goals).toMatchObject({ kcal: 2200 });
    expect(repo.localGet('targetBasis')).toBe('estimated');
    expect(repo.localGet('onboardingGoals')).toMatchObject({ eat: true });
    expect(repo.list('profile')[0].data).toMatchObject({ weight_unit: 'kg', height_m: 1.8034 });
  });
  test('a weight typed over the Health one, and targets changed by hand, are the person\'s own and are saved', () => {
    const repo = memoryRepository();
    const typed = basics({ filled: true, healthKg: null });
    saveOnboarding(repo, { ...typed, t: suggest(typed, 'maintain', fallback, DAY) }, DAY);
    expect(repo.list('weigh_ins').map(r => r.data)).toEqual([expect.objectContaining({ day: DAY, entered_value: 182.1, source: 'app' })]);
    expect(repo.list('food_targets')).toHaveLength(1);
    const other = memoryRepository(), filled = basics({ filled: true, healthKg: 82.6 });
    saveOnboarding(other, { ...filled, t: withKcal(suggest(filled, 'maintain', fallback, DAY), 2400), edited: true }, DAY);
    expect(other.list('weigh_ins')).toEqual([]);
    expect(other.list('food_targets')[0].data).toMatchObject({ energy_kj: 2400 * 4.184 });
    expect(other.localGet('targetBasis')).toBe('manual');
  });
  test('a skipped section writes nothing, but a profile row still marks the account as set up', () => {
    const repo = memoryRepository();
    saveOnboarding(repo, { ...basics({ name: '' }), skipped: { about: true, goals: true }, t: suggest(basics(), 'maintain', fallback, DAY) }, DAY);
    expect(repo.list('profile')).toHaveLength(1);
    expect(repo.list('profile')[0].data).toEqual({ name: null });
    for (const table of ['weigh_ins', 'food_targets'] as const) expect(repo.list(table)).toEqual([]);
    for (const key of ['profileExtras', 'targetBasis', 'targetPlan', 'onboardingGoals']) expect(repo.localGet(key)).toBeUndefined();
    expect(loadSettingsPrefs(repo).goals.kcal).toBe(2200);
    expect(repo.localGet('onboardingSkipped')).toEqual({ about: true, goals: true });
    expect(isSetUp(repo)).toBe(true);
  });
  test('under 13 writes nothing at all', () => {
    const repo = memoryRepository();
    expect(() => saveOnboarding(repo, basics({ age: '12' }), DAY)).toThrow();
    expect(repo.list('profile')).toEqual([]); expect(repo.localGet('onboardingComplete')).toBeUndefined();
  });
  test('a resumed setup saves only what was skipped before', () => {
    const repo = memoryRepository();
    saveOnboarding(repo, { ...basics(), skipped: { about: false, goals: true } }, DAY);
    const d = { ...basics({ weight: '200' }), skipped: { about: false, goals: false }, t: suggest(basics(), 'maintain', fallback, DAY) };
    saveResumed(repo, d, { about: false, goals: true }, DAY);
    expect(repo.list('weigh_ins')).toHaveLength(1);
    expect(repo.list('food_targets')).toHaveLength(1);
    expect(repo.localGet('onboardingSkipped')).toEqual({ about: false, goals: false });
  });
  test('the suggested routines are check-offs on every day with reminders off and never a dose', async () => {
    const q = { wake: '7.5', wind: '22.5', keep: { water: true, outside: true, read: true, supps: true } };
    expect(routinePlan(q)).toEqual({ am: { from: 7.5, to: 8.5, items: ['water', 'outside'] }, pm: { from: 21.5, to: 22.5, items: ['read'] }, supps: true });
    await addSuggestedRoutines(mockStore, q, names, mockWrite);
    const s = mockStore.read();
    // The new account's empty Morning and Night take the suggested windows; Midday is left as it was.
    expect(s.routines.map(r => [r.id, r.name, r.from, r.to, r.color, r.days, r.remind])).toEqual([
      ['morning', 'Morning', 7.5, 8.5, 'warning', [0, 1, 2, 3, 4, 5, 6], false], ['midday', 'Midday', 12, 14, 'recovery', [0, 1, 2, 3, 4, 5, 6], true],
      ['night', 'Night', 21.5, 22.5, 'sleep', [0, 1, 2, 3, 4, 5, 6], false]]);
    expect(s.items.map(i => i.name)).toEqual(['Glass of water', 'Ten minutes outside', 'Read, 15 minutes']);
    expect(s.items.every(i => i.kind === 'check' && i.type === 'Other' && i.amt === null)).toBe(true);
    expect(new Set(s.items.map(x => x.id)).size).toBe(3);
    expect(s.items.map(i => i.routines)).toEqual([['morning'], ['morning'], ['night']]);
  });
  test('a Morning that already has items is kept, and a new one is added beside it', async () => {
    await addSuggestedRoutines(mockStore, { wake: '6.5', wind: '21.5', keep: {} }, names, mockWrite);
    await addSuggestedRoutines(mockStore, { wake: '5.5', wind: '21.5', keep: {} }, names, mockWrite);
    const s = mockStore.read();
    expect(s.routines.filter(r => r.name === 'Morning').map(r => [r.from, r.remind])).toEqual([[6.5, false], [5.5, false]]);
    expect(new Set([...s.routines, ...s.items].map(x => x.id)).size).toBe(s.routines.length + s.items.length);
  });
  test('with nothing picked the routine is a glass of water in the morning and screens off at night', () => {
    expect(routinePlan({ wake: '', wind: '', keep: {} })).toMatchObject({ am: { from: 6.5, items: ['water'] }, pm: { from: 20.5, items: ['screens'] } });
  });
});

const session = { user: { id: 'synthetic' } } as AuthState['session'];
const auth = (repository: ReturnType<typeof memoryRepository> | null, over: Partial<AuthState> = {}): AuthState => ({
  initialPullComplete: true, session, demo: false, ready: true, configured: true, configError: null, repository, pending: 0, conflicts: 0, syncStatus: 'idle',
  lookAround: jest.fn(), signIn: jest.fn(async () => null), createAccount: jest.fn(async () => null), signOut: jest.fn(async () => {}), syncNow: jest.fn(async () => {}),
  blockOnboarding: jest.fn(), ...over,
} as AuthState);
function PaletteProbe() { return <Text testID="palette-probe">{useTheme().palette}</Text>; }
async function open(value: AuthState) {
  await render(<AuthContext.Provider value={value}><OnboardingDraftProvider><ThemeProvider repository={value.repository}><Onboarding /><PaletteProbe /></ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>);
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const title = (key: Parameters<typeof t>[0]) => expect(screen.getByText(t(key))).toBeTruthy();

describe('the flow', () => {
  test('walks every step in order and saves on Open Insight, then goes Home', async () => {
    const repo = memoryRepository();
    await open(auth(repo));
    title('obbNameTitle');
    expect(screen.getByRole('progressbar', { name: 'Setup progress, 0 percent' })).toBeTruthy();
    expect(screen.getByTestId('onboarding-continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText(t('obbFirstName')), '  Sam  ');
    await press('onboarding-continue');
    title('obbBodyTitle');
    expect(screen.getByRole('progressbar', { name: 'Setup progress, 17 percent' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(t('obbWeightLb')), '182.1');
    await fireEvent.changeText(screen.getByLabelText(t('obbAgeYears')), '34');
    await press('onboarding-activity-active');
    await press('onboarding-continue');
    title('obbGoalsTitle');
    expect(screen.getByTestId('onboarding-continue')).toBeDisabled();
    await press('onboarding-goal-eat'); await press('onboarding-continue');
    title('obbTargetsTitle');
    // No height, so the app's own targets are the start (the full estimate is checked above).
    expect(screen.getByTestId('onboarding-kcal')).toHaveTextContent('2,200');
    expect(screen.getByText(t('obbNoteTypical'))).toBeTruthy();
    await press('onboarding-kcal-more');
    expect(screen.getByTestId('onboarding-kcal')).toHaveTextContent('2,250');
    expect(screen.getByText(t('obbNoteYours'))).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t('obbUseSuggestion') }));
    expect(screen.getByTestId('onboarding-kcal')).toHaveTextContent('2,200');
    await press('onboarding-continue');
    title('obbConnectTitle');
    await press('onboarding-continue');
    title('obbQuiz1Title');
    expect(screen.getByText('Routines · 1 of 3')).toBeTruthy();
    await press('onboarding-wake-6.5'); await press('onboarding-continue');
    title('obbQuiz2Title');
    await press('onboarding-habit-water'); await press('onboarding-continue');
    title('obbQuiz3Title');
    await press('onboarding-wind-21.5');
    expect(screen.getByRole('button', { name: t('obbSeeRoutine') })).toBeTruthy();
    await press('onboarding-continue');
    title('obbRoutineTitle');
    await act(async () => { fireEvent.press(screen.getByTestId('onboarding-continue')); await new Promise(r => setTimeout(r, 30)); });
    title('obbFinaleTitle');
    expect(repo.localGet<RoutinesState>(ROUTINES_KEY)!.routines.map(r => [r.name, r.from, r.remind])).toEqual([['Morning', 6.5, false], ['Midday', 12, true], ['Night', 20.5, false]]);
    expect(mockStore.read().items.map(i => i.name)).toEqual(['Glass of water', 'Screens off']);
    expect(screen.getByRole('progressbar', { name: 'Setup progress, 100 percent' })).toBeTruthy();
    await press('onboarding-finish');
    expect(repo.list('profile')[0].data).toMatchObject({ name: 'Sam', dob: `${new Date().getFullYear() - 34}-01-01`, weight_unit: 'lb', height_m: null });
    expect(repo.list('food_targets')[0].data).toMatchObject({ protein_g: 165, carbs_g: 248, fat_g: 61 });
    expect(repo.localGet('profileExtras')).toEqual({ sex: '', activity: 'active' });
    expect(repo.localGet(ONBOARDING_TIPS)).toBe('1');
    expect(router.replace).toHaveBeenLastCalledWith('/');
  });

  /** Opens setup on About you's body step and fills the weight from a made-up Apple Health reading. */
  async function fillFromHealth(repo: ReturnType<typeof memoryRepository>) {
    const value = auth(repo);
    // A fresh auth value draws the flow again, as the app's provider does when Health finishes reading.
    const tree = () => <AuthContext.Provider value={{ ...value }}><OnboardingDraftProvider><ThemeProvider repository={repo}><Onboarding /></ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>;
    const view = await render(tree());
    await fireEvent.changeText(screen.getByLabelText(t('obbFirstName')), 'Sam'); await press('onboarding-continue');
    // A newer typed weight is not a Health reading, so it never fills the field.
    repo.save('weigh_ins', { day: '2026-11-25', weight_kg: 90, entered_value: 90, entered_unit: 'kg', source: 'app' });
    await press('onboarding-health-fill');
    expect(mockHealth.connect).toHaveBeenCalled();
    Object.assign(mockHealth, { busy: true }); await view.rerender(tree());
    const reading = repo.save('weigh_ins', { day: '2026-11-24', weight_kg: 82.6, source: 'healthkit' });
    Object.assign(mockHealth, { busy: false, access: 'asked' }); await view.rerender(tree());
    expect(screen.getByLabelText(t('obbWeightLb'))).toHaveProp('value', '182.1');
    await fireEvent.changeText(screen.getByLabelText(t('obbAgeYears')), '34');
    return reading;
  }
  const finishFromBody = async () => {
    await press('onboarding-continue');
    await press('onboarding-skip'); await press('onboarding-continue'); await press('onboarding-skip');
    await press('onboarding-finish');
  };
  test('Fill from Apple Health fills the newest Health reading, which Open Insight leaves in the Health store', async () => {
    const repo = memoryRepository(), reading = await fillFromHealth(repo);
    await finishFromBody();
    expect(repo.list('weigh_ins').filter(r => r.data.source === 'app').map(r => r.data.day)).toEqual(['2026-11-25']);
    expect(repo.list('weigh_ins')).toContainEqual(reading);
    expect(repo.list('profile')[0].data).toMatchObject({ name: 'Sam' });
  });
  test('a weight typed over the one filled from Apple Health is saved as typed', async () => {
    const repo = memoryRepository();
    await fillFromHealth(repo);
    await fireEvent.changeText(screen.getByLabelText(t('obbWeightLb')), '180');
    await finishFromBody();
    expect(repo.list('weigh_ins').filter(r => r.data.source === 'app' && r.data.day !== '2026-11-25').map(r => r.data))
      .toEqual([expect.objectContaining({ entered_value: 180, entered_unit: 'lb', source: 'app' })]);
  });

  test('Not now skips About you and Goals; Back then passes over them', async () => {
    const repo = memoryRepository();
    await open(auth(repo));
    await press('onboarding-skip');
    title('obbGoalsTitle');
    await press('onboarding-skip');
    title('obbConnectTitle');
    await press('onboarding-back');
    title('obbGoalsTitle');
    await press('onboarding-back');
    title('obbNameTitle');
  });

  test('the finale applies the palette at once, keeps the icon choice and sets the icon on Open Insight', async () => {
    const repo = memoryRepository();
    await open(auth(repo));
    await press('onboarding-skip'); await press('onboarding-skip'); await press('onboarding-continue'); await press('onboarding-skip');
    title('obbFinaleTitle');
    await press('onboarding-palette-auroraFjord');
    expect(screen.getByTestId('palette-probe')).toHaveTextContent('auroraFjord');
    await press('onboarding-icon-duskGlow');
    expect(loadSettingsPrefs(repo).look.icon).toBe('duskGlow');
    await press('onboarding-finish');
    expect(applyAppIcon).toHaveBeenCalledWith('duskGlow', 'auroraFjord', expect.any(String));
    expect(repo.localGet('onboardingSkipped')).toEqual({ about: true, goals: true });
  });

  test('under 13 stops setup with nothing saved, and stays stopped', async () => {
    const repo = memoryRepository(), value = auth(repo);
    await open(value);
    await press('onboarding-skip'); await press('onboarding-back');
    await fireEvent.changeText(screen.getByLabelText(t('obbFirstName')), 'Sam'); await press('onboarding-continue');
    await fireEvent.changeText(screen.getByLabelText(t('obbAgeYears')), '12');
    await press('onboarding-continue');
    expect(screen.getByText(t('ages13Title'))).toBeTruthy();
    expect(value.blockOnboarding).toHaveBeenCalled();
    expect(repo.list('profile')).toEqual([]); expect(repo.localSnapshot?.() ?? {}).not.toHaveProperty('onboardingComplete');
    await press('onboarding-blocked-back');
    expect(router.replace).toHaveBeenLastCalledWith('/auth');
  });

  test('a failed save says so quietly, and Open Insight tries the same save again', async () => {
    const repo = memoryRepository();
    const atomic = jest.spyOn(repo, 'atomic').mockImplementationOnce(() => { throw new Error('synthetic write failure'); });
    await open(auth(repo));
    await press('onboarding-skip'); await press('onboarding-skip'); await press('onboarding-continue'); await press('onboarding-skip');
    await press('onboarding-finish');
    expect(screen.getByRole('alert')).toHaveTextContent(t('workoutSaveError'));
    expect(repo.list('profile')).toHaveLength(0); expect(router.replace).not.toHaveBeenCalled();
    await press('onboarding-finish');
    expect(atomic).toHaveBeenCalledTimes(2); expect(repo.list('profile')).toHaveLength(1); expect(router.replace).toHaveBeenLastCalledWith('/');
  });
  test('while the account is still loading, Open Insight is off and a line says why', async () => {
    await open(auth(memoryRepository(), { initialPullComplete: false }));
    await press('onboarding-skip'); await press('onboarding-skip'); await press('onboarding-continue'); await press('onboarding-skip');
    expect(screen.getByText(t('onboardingPreparing'))).toBeTruthy();
    expect(screen.getByTestId('onboarding-finish')).toBeDisabled();
  });
  test('the ages 13+ screen is plain and offers only the way back', async () => {
    await open(auth(memoryRepository()));
    await press('onboarding-skip'); await press('onboarding-back');
    await fireEvent.changeText(screen.getByLabelText(t('obbFirstName')), 'Sam'); await press('onboarding-continue');
    await fireEvent.changeText(screen.getByLabelText(t('obbAgeYears')), '9'); await press('onboarding-continue');
    expect(screen.getByRole('header')).toHaveTextContent(t('ages13Title'));
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
  test('Connect shows Connected once a service is on, and says so when one is not available', async () => {
    const repo = memoryRepository();
    Object.assign(mockRing, { state: 'unavailable' });
    await open(auth(repo));
    await press('onboarding-skip'); await press('onboarding-skip');
    await press('onboarding-connect-health');
    expect(mockHealth.connect).toHaveBeenCalled();
    expect(screen.getByText(t('obbOuraUnavailable'))).toBeTruthy();
    expect(screen.queryByTestId('onboarding-connect-oura')).toBeNull();
  });
});

describe('no second setup', () => {
  test('isSetUp is true for any profile row or a finished setup on this phone', () => {
    const a = memoryRepository(); expect(isSetUp(a)).toBe(false);
    a.save('profile', { name: 'Sam' }); expect(isSetUp(a)).toBe(true);
    const b = memoryRepository(); b.localSave('onboardingComplete', true); expect(isSetUp(b)).toBe(true);
  });
  test('an account with a profile goes straight Home and never sees a step', async () => {
    const repo = memoryRepository(); repo.save('profile', { name: 'Sam' });
    await open(auth(repo));
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(screen.queryByText(t('obbNameTitle'))).toBeNull();
  });
  test('waits for the first pull before deciding', async () => {
    const repo = memoryRepository();
    await open(auth(repo, { initialPullComplete: false }));
    expect(router.replace).not.toHaveBeenCalled();
  });
  test('resume reopens only the skipped sections, then saves and goes Home with a note', async () => {
    const repo = memoryRepository();
    saveOnboarding(repo, { ...basics(), skipped: { about: false, goals: true } });
    jest.mocked(useLocalSearchParams).mockReturnValue({ resume: '1' });
    await open(auth(repo));
    title('obbGoalsTitle');
    await press('onboarding-goal-train'); await press('onboarding-continue');
    title('obbTargetsTitle');
    await press('onboarding-continue');
    expect(repo.list('food_targets')).toHaveLength(1);
    expect(repo.localGet('onboardingSkipped')).toEqual({ about: false, goals: false });
    expect(router.replace).toHaveBeenLastCalledWith('/');
  });
  test('resume with nothing skipped goes Home', async () => {
    const repo = memoryRepository(); saveOnboarding(repo, basics());
    jest.mocked(useLocalSearchParams).mockReturnValue({ resume: '1' });
    await open(auth(repo));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
