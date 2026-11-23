import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/provider';
import type { Repository } from '../src/data/repository';
import { SetupSheet } from '../src/features/routines-ui/setup';
import { keepSetupDraft } from '../src/features/routines-ui/setup-draft';
import { askedQuestions, setupQuestion } from '../src/features/routines/model/setup';
import { seededRepository, stored, wrapper } from './routines-sheets-kit';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

let repo: Repository;
let said: jest.SpyInstance;
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const text = (testID: string) => screen.getByTestId(testID).props.children;
const nextButton = () => screen.getByTestId('setup-next');

beforeEach(() => {
  repo = seededRepository();
  keepSetupDraft(null);
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  jest.mocked(router.back).mockClear();
  said = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

test('one question a step: pick-any waits for Next, a single answer moves on, and only Finish saves', async () => {
  await render(<SetupSheet />, { wrapper });
  expect(screen.getByRole('header', { name: 'Set up Routines' })).toBeTruthy();
  expect(text('setup-question')).toBe('What brings you to Routines?');
  expect(text('setup-step')).toBe(`1 of ${askedQuestions({}).length}`);
  expect(text('setup-intro')).toBe('Your answers decide what this page starts with. You can add anything else later in Routines settings.');
  expect(screen.getByTestId('setup-skip')).toBeTruthy();
  expect(screen.queryByTestId('setup-back')).toBeNull();
  expect(screen.queryByTestId('setup-doctor')).toBeNull();
  expect(nextButton().props.accessibilityState.disabled).toBe(true);

  await press('setup-choice-habits');
  await press('setup-choice-supplements');
  expect(screen.getByRole('checkbox', { name: 'Build daily habits' }).props.accessibilityState.checked).toBe(true);
  expect(text('setup-question')).toBe('What brings you to Routines?');
  await press('setup-next');

  expect(text('setup-question')).toBe('How much have you tracked before?');
  expect(text('setup-step')).toMatch(/^2 of \d+$/);
  expect(screen.queryByTestId('setup-intro')).toBeNull();
  expect(screen.queryByTestId('setup-skip')).toBeNull();
  expect(said).toHaveBeenLastCalledWith(expect.stringMatching(/^2 of \d+\. How much have you tracked before\?$/));
  // A single answer is a radio and moves on by itself.
  expect(screen.getByRole('radio', { name: 'New to it' }).props.accessibilityState.checked).toBe(false);
  await press('setup-choice-new');
  expect(text('setup-question')).toBe('What do your days look like?');

  await press('setup-back');
  expect(text('setup-question')).toBe('How much have you tracked before?');
  expect(screen.getByRole('radio', { name: 'New to it' }).props.accessibilityState.checked).toBe(true);
  await press('setup-next');
  expect(text('setup-question')).toBe('What do your days look like?');

  // Walk to the last question, skipping one on the way.
  await press('setup-skip-question');
  for (let guard = 0; guard < 30 && nextButton().props.accessibilityLabel !== 'Finish'; guard += 1) {
    const question = setupQuestion(currentId())!;
    await press(`setup-choice-${question.choices[0].value}`);
    if (question.multi) await press('setup-next');
  }
  expect(nextButton().props.accessibilityLabel).toBe('Finish');
  expect(text('setup-doctor')).toBe('Check with your doctor or pharmacist in addition to using this app, and before making any medical decision.');
  expect(stored(repo).prefs.setup).toBeUndefined();

  // The last answer does not close the sheet. Finish does.
  const last = setupQuestion(currentId())!;
  await press(`setup-choice-${last.choices[0].value}`);
  if (last.multi) expect(nextButton().props.accessibilityState.disabled).toBe(false);
  expect(router.back).not.toHaveBeenCalled();
  expect(stored(repo).prefs.setup).toBeUndefined();
  await press('setup-next');
  const setup = stored(repo).prefs.setup!;
  expect(setup.status).toBe('done');
  expect(setup.answers).toMatchObject({ goals: ['habits', 'supplements'], experience: 'new' });
  expect(setup.answers.days).toBeUndefined();
  expect(said).toHaveBeenLastCalledWith('Your Routines page is set up.');
  expect(router.back).toHaveBeenCalledTimes(1);
});

/* Which question is on screen, from its title. */
function currentId(): string {
  const title = screen.getByTestId('setup-question').props.children;
  return ['goals', 'experience', 'days', 'wake', 'sleep', 'train', 'track', 'enhancers', 'inject', 'count', 'supply', 'timing', 'watch', 'home', 'feel']
    .find((id) => setupQuestion(id)?.title === title) ?? '';
}

test('Skip setup saves a skipped setup and nothing else', async () => {
  await render(<SetupSheet />, { wrapper });
  await press('setup-choice-habits');
  await press('setup-skip');
  expect(stored(repo).prefs.setup).toMatchObject({ status: 'skipped', answers: {} });
  expect(said).toHaveBeenLastCalledWith('Setup skipped. You can set up your page from Routines settings.');
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('closing part way saves nothing and the quiz opens again where it was left', async () => {
  const first = await render(<SetupSheet />, { wrapper });
  await press('setup-choice-habits');
  await press('setup-next');
  await press('setup-choice-some');
  await press('setup-close');
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(stored(repo).prefs.setup).toBeUndefined();
  await first.unmount();

  await render(<SetupSheet />, { wrapper });
  expect(text('setup-question')).toBe('What do your days look like?');
  await press('setup-back');
  expect(screen.getByRole('radio', { name: 'Some' }).props.accessibilityState.checked).toBe(true);
});

test('a retake starts from the saved answers and has no Skip setup', async () => {
  const first = await render(<SetupSheet />, { wrapper });
  await press('setup-choice-looking');
  await press('setup-next');
  await press('setup-choice-early');
  const sleep = setupQuestion('sleep')!;
  await press(`setup-choice-${sleep.choices[0].value}`);
  await press('setup-next');
  expect(stored(repo).prefs.setup).toMatchObject({ status: 'done', answers: { goals: ['looking'], wake: 'early' } });
  await first.unmount();

  await render(<SetupSheet mode="retake" />, { wrapper });
  expect(text('setup-question')).toBe('What brings you to Routines?');
  expect(screen.getByRole('checkbox', { name: 'Just looking' }).props.accessibilityState.checked).toBe(true);
  expect(screen.queryByTestId('setup-skip')).toBeNull();
  expect(screen.queryByTestId('setup-intro')).toBeNull();
  expect(nextButton().props.accessibilityState.disabled).toBe(false);
});
