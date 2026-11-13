import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { useAuth } from '../src/auth/provider';
import { ActiveWorkout } from '../src/features/workout/active';
import { memoryRepository } from './workout-repository';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn(), dismissTo: jest.fn(),
    canDismiss: jest.fn(() => false), canGoBack: jest.fn(() => false) } }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../src/features/workout/haptics', () => ({ tick: jest.fn(), restBuzz: jest.fn(), signatureBuzz: jest.fn(() => jest.fn()) }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

test('Save workout goes straight from the logger to the summary, with no closed-workout frame or Home step between', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), session = store.start();
  const bench = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(bench.id, 0, { weight: '100', reps: '8' });
  store.toggleDone(bench.id, 0);
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  const view = await render(<ActiveWorkout />, { wrapper });
  await fireEvent.press(screen.getByTestId('finish-button'));
  await fireEvent.press(screen.getByTestId('save-workout'));
  await act(async () => {});
  // The workout is saved.
  expect(store.repo.get('sessions', session.id)?.data.finished_at).toEqual(expect.any(Number));
  expect(store.active()).toBeUndefined();
  // One replace to the summary of this workout, and nothing else: no back, dismiss or replace to Home or the tabs.
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/workout/summary', params: { id: session.id, just: '1' } });
  for (const call of [router.push, router.back, router.navigate, router.dismiss, router.dismissAll, router.dismissTo]) expect(call).not.toHaveBeenCalled();
  // Until the summary lands, the logger keeps showing this workout, with the Finish sheet closed. It does not fall back
  // to the no-workout screen, whose only way on is a Close workout button (a replace to Home).
  expect(screen.queryByText('Close workout')).toBeNull();
  expect(screen.getByTestId('finish-button')).toBeTruthy();
  expect(screen.queryByTestId('save-workout')).toBeNull();
  // A later redraw (a sync, a tick) still does not drop the logger.
  await view.rerender(<ActiveWorkout />);
  expect(screen.queryByText('Close workout')).toBeNull();
  expect(router.replace).toHaveBeenCalledTimes(1);
});
