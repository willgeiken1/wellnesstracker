// The rest timer for VoiceOver and large text (A11Y-01, A11Y-02). Made-up workout data only.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
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

describe('the logger and rest sheet at the largest text size (simulator AX5 findings)', () => {
  const { StyleSheet } = require('react-native') as typeof import('react-native');
  const inside = (node: { parent: unknown; props: Record<string, unknown> } | null, testID: string) => {
    for (let up = node; up; up = up.parent as typeof node) if (up.props.testID === testID) return true;
    return false;
  };

  test.each([[1, false], [3, true]] as const)('at %sx the header scrolls with the sets: %s', async (scale, scrolls) => {
    setFontScale(scale);
    await logger();
    const header = screen.getByTestId('logger-header');
    expect(inside(header as never, 'logger-exercises')).toBe(scrolls);
    // The finish button stays in the first row; the name takes its own line only at large sizes.
    const name = screen.getByText('Workout');
    let row = name.parent as unknown as { type: unknown; parent: unknown; props: { style?: unknown } };
    while (row.type !== 'View') row = row.parent as typeof row;
    expect(StyleSheet.flatten(row.props.style as never)?.flexBasis).toBe(scrolls ? '100%' : undefined);
    expect(screen.getByTestId('finish-button')).toBeTruthy();
  });

  test.each([[1, false], [3, true]] as const)('at %sx the full rest sheet scrolls and shows Minimize: %s', async (scale, large) => {
    setFontScale(scale);
    const { store } = await logger(repo => repo.localSave('restOpens', 'full'));
    await fireEvent.press(screen.getByTestId('set-0-0-done'));
    expect(!!screen.queryByTestId('rest-sheet-scroll')).toBe(large);
    expect(inside(screen.getByTestId('rest-contours') as never, 'rest-sheet-scroll')).toBe(large);
    if (!large) { expect(screen.queryByTestId('rest-minimize')).toBeNull(); return; }
    await fireEvent.press(screen.getByRole('button', { name: 'Minimize rest timer' }));
    expect(store.timer()!.minimized).toBe(true);
  });
});

describe('the minimized rest bar and exercise names at the largest text size (AX5 re-shoot)', () => {
  const { StyleSheet } = require('react-native') as typeof import('react-native');
  // The device ignored a shrinking percentage basis inside a wrapping row, so at large sizes the bar must not depend
  // on wrapping at all: a column, the words at full width, and the chips in their own row.
  test.each([[1, false], [3, true]] as const)('at %sx the bar is a column with the words at full width: %s', async (scale, column) => {
    setFontScale(scale);
    await logger();
    await fireEvent.press(screen.getByTestId('set-0-0-done'));
    const words = StyleSheet.flatten(screen.getByRole('button', { name: 'Expand rest timer' }).props.style);
    const row = StyleSheet.flatten(screen.getByTestId('rest-bar-row').props.style);
    expect(row.flexDirection).toBe(column ? 'column' : 'row');
    if (column) {
      expect(row.flexWrap).toBeUndefined();
      expect(words).toMatchObject({ width: '100%' });
      expect(words.flexBasis).toBeUndefined();
      expect(words.flexShrink).toBeUndefined();
    } else expect(words).toMatchObject({ flexBasis: 96, flexGrow: 1 });
    expect(within(screen.getByTestId('rest-bar-chips')).getAllByRole('button').map(chip => chip.props.accessibilityLabel)).toHaveLength(3);
  });
  test.each([[1, undefined], [3, '100%']] as const)('at %sx the exercise name has width %s, so it breaks between words', async (scale, width) => {
    setFontScale(scale);
    await logger();
    const name = screen.getByTestId('exercise-name-0');
    expect(name).toHaveTextContent(/Close-Grip Bench Press/);
    const style = StyleSheet.flatten(name.props.style);
    expect(style?.width).toBe(width);
    if (width) { expect(style?.flexBasis).toBeUndefined(); expect(style?.flexShrink).toBeUndefined(); }
  });
});
