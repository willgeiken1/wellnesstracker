import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { useAuth } from '../src/auth/provider';
import { ActiveWorkout, SUMMARY_AFTER_SHEET_MS } from '../src/features/workout/active';
import { memoryRepository } from './workout-repository';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn(), dismissTo: jest.fn(),
    canDismiss: jest.fn(() => false), canGoBack: jest.fn(() => false) } }));
const mockModalProps: { last?: { visible?: boolean; onDismiss?: () => void } } = {};
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const Mock = (props: { visible?: boolean; onDismiss?: () => void; children?: React.ReactNode }) => {
    mockModalProps.last = props;
    return props.visible ? props.children : null;
  };
  return { __esModule: true, default: Mock };
});
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../src/features/workout/haptics', () => ({ tick: jest.fn(), restBuzz: jest.fn(), signatureBuzz: jest.fn(() => jest.fn()) }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const ISO_DAY = /\d{4}-\d{2}-\d{2}/;
/** The logger's one sheet host is a React Native Modal. A hidden one renders nothing, so the mock keeps its last props. */
const sheetHost = () => mockModalProps.last!;
/** What iOS reports when the hidden modal has finished closing. */
const nativeDismiss = () => act(() => { sheetHost().onDismiss?.(); });
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => jest.useRealTimers());

async function saveFromLogger() {
  const repo = memoryRepository(), store = new WorkoutStore(repo), session = store.start(undefined, Date.now() - 20 * 60000);
  repo.save('sessions', { ...session.data, name: 'Push Day A' }, session.id);
  const bench = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(bench.id, 0, { weight: '100', reps: '8' });
  store.toggleDone(bench.id, 0);
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  const view = await render(<ActiveWorkout />, { wrapper });
  expect(screen.getByText('Push Day A')).toBeTruthy();
  expect(screen.queryByText(ISO_DAY)).toBeNull();
  await fireEvent.press(screen.getByTestId('finish-button'));
  expect(sheetHost().visible).toBe(true);
  await fireEvent.press(screen.getByTestId('save-workout'));
  await act(async () => {});
  return { store, session, view };
}
function expectOnlySummaryReplace(id: string) {
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/workout/summary', params: { id, just: '1' } });
  for (const call of [router.push, router.back, router.navigate, router.dismiss, router.dismissAll, router.dismissTo]) expect(call).not.toHaveBeenCalled();
}
/** The logger as the summary is about to replace it: this workout, its name and running clock, the sheet closed. */
function expectLoggerKept() {
  // Not the no-workout screen, whose only way on is a Close workout button (a replace to Home).
  expect(screen.queryByText('Close workout')).toBeNull();
  expect(screen.getByTestId('finish-button')).toBeTruthy();
  expect(screen.queryByTestId('save-workout')).toBeNull();
  expect(screen.getByText('Push Day A')).toBeTruthy();
  // Saving makes the workout history; the header must not switch from its clock to the raw ISO day.
  expect(screen.queryByText(ISO_DAY)).toBeNull();
}

test('Save keeps the logger and its title, waits for the Finish sheet to close natively, then makes one replace to the summary', async () => {
  const { store, session, view } = await saveFromLogger();
  expect(store.repo.get('sessions', session.id)?.data.finished_at).toEqual(expect.any(Number));
  expect(store.active()).toBeUndefined();
  // The sheet is closing; nothing moves the stack under it yet.
  expect(sheetHost().visible).toBe(false);
  expectLoggerKept();
  expect(router.replace).not.toHaveBeenCalled();
  // A redraw (a sync, a tick) while waiting changes nothing.
  await view.rerender(<ActiveWorkout />);
  expectLoggerKept();
  expect(router.replace).not.toHaveBeenCalled();
  // iOS reports the sheet's modal gone: now, and only now, the summary replaces the logger, once.
  await nativeDismiss();
  expectOnlySummaryReplace(session.id);
  expectLoggerKept();
  await nativeDismiss();
  expectOnlySummaryReplace(session.id);
});

test('if the sheet never reports its dismissal, the summary still opens once, after a short wait', async () => {
  jest.useFakeTimers();
  const { session } = await saveFromLogger();
  await act(() => jest.advanceTimersByTime(SUMMARY_AFTER_SHEET_MS - 1));
  expect(router.replace).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expectOnlySummaryReplace(session.id);
  // A late dismissal report does not navigate a second time.
  await nativeDismiss();
  await act(() => jest.advanceTimersByTime(SUMMARY_AFTER_SHEET_MS));
  expectOnlySummaryReplace(session.id);
  expectLoggerKept();
});
