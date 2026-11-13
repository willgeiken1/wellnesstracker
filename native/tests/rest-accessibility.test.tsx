// The rest timer for VoiceOver and large text (A11Y-01, A11Y-02). Made-up workout data only.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions } from 'react-native';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { ActiveWorkout } from '../src/features/workout/active';
import { Cardio } from '../src/features/cardio/screen';
import { useAuth } from '../src/auth/provider';
import type { Repository } from '../src/data/repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useIsFocused: () => true, router: { canDismiss: () => false, replace: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/workout/haptics', () => ({ tick: jest.fn(), restBuzz: jest.fn(), signatureBuzz: jest.fn(() => jest.fn()) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const window = Dimensions.get('window'), screenSize = Dimensions.get('screen');
const setFontScale = (fontScale: number) => Dimensions.set({ window: { ...window, fontScale }, screen: { ...screenSize, fontScale } });

let spoken: jest.SpyInstance;
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  spoken.mockClear();
});
afterEach(() => { jest.restoreAllMocks(); setFontScale(1); });

async function logger(prepare?: (repo: Repository) => void) {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  store.editDraft(entry.id, 0, { weight: '135', reps: '8' });
  prepare?.(repo);
  (useAuth as jest.Mock).mockReturnValue({ repository: repo, session: { user: { id: 'made-up-user' } } });
  await render(<ActiveWorkout />, { wrapper });
  return { repo, store };
}

test('when rest runs out VoiceOver says so once, even with haptics off', async () => {
  jest.useFakeTimers({ now: new Date(2026, 4, 12, 15, 0, 0), doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  // The timer only checks while the app is in front; the Jest mock has no app state, so say it is.
  const appState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  try {
    const { store } = await logger();
    await fireEvent.press(screen.getByTestId('set-0-0-done'));
    expect(spoken).not.toHaveBeenCalledWith('Rest complete · next set ready');
    await act(async () => { jest.advanceTimersByTime(91_000); });
    expect(store.timer()!.ended).toBe(true);
    expect(spoken.mock.calls.filter(([text]) => text === 'Rest complete · next set ready')).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(spoken.mock.calls.filter(([text]) => text === 'Rest complete · next set ready')).toHaveLength(1);
  } finally {
    jest.useRealTimers();
    if (appState) Object.defineProperty(AppState, 'currentState', appState);
  }
});

test.each([[1, false], [3, true]] as const)('at %sx text the full timer keeps its clock inside the contours (full-size copy: %s)', async (scale, copy) => {
  setFontScale(scale);
  await logger(repo => repo.localSave('restOpens', 'full'));
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  expect(screen.getByTestId('rest-clock').props.maxFontSizeMultiplier).toBe(1.2);
  if (!copy) expect(screen.queryByTestId('rest-clock-full')).toBeNull();
  else {
    const full = screen.getByTestId('rest-clock-full');
    expect(full.props.maxFontSizeMultiplier).toBe(0);
    expect(full).toHaveTextContent(/^1:30 of 1:30$/);
  }
});

test('"Rest complete" in the bar wraps instead of being cut off', async () => {
  const { store } = await logger();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  await act(async () => { store.updateTimer({ ended: true, endAt: Date.now() - 1000 }); });
  expect(screen.getByText('Rest complete · next set ready').props.numberOfLines).toBeUndefined();
});

test('the cardio clock is read with its time, and the weekly ring number is held to 1.2x with the minutes beside it', async () => {
  const repo = memoryRepository();
  setFontScale(3);
  await render(<Cardio repository={repo} />, { wrapper });
  const minutes = screen.getByText('0');
  expect(minutes.props).toMatchObject({ maxFontSizeMultiplier: 1.2, adjustsFontSizeToFit: true });
  expect(screen.getByText('0 of 150 minutes this week').props.maxFontSizeMultiplier).toBe(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Bike' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Start timer' }));
  expect(screen.getByLabelText(/^Elapsed time, \d+:\d\d$/)).toBeTruthy();
});
