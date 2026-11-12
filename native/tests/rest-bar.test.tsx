import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { memoryRepository } from './workout-repository';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { ActiveWorkout } from '../src/features/workout/active';
import { WorkoutSettings } from '../src/features/workout/settings';
import { restOpens } from '../src/features/workout/rest-pref';
import { useAuth } from '../src/auth/provider';
import type { Repository } from '../src/data/repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useIsFocused: () => true, router: { canDismiss: () => false, replace: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/workout/haptics', () => ({ tick: jest.fn(), restBuzz: jest.fn(), signatureBuzz: jest.fn(() => jest.fn()) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const signIn = (repo: Repository) => (useAuth as jest.Mock).mockReturnValue({ repository: repo, session: { user: { id: 'made-up-user' } } });
beforeEach(() => { jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());

/** A made-up workout: one exercise with the first set filled in, ready to mark done. */
async function logger(prepare?: (repo: Repository) => void) {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  store.editDraft(entry.id, 0, { weight: '135', reps: '8' });
  prepare?.(repo);
  signIn(repo);
  await render(<ActiveWorkout />, { wrapper });
  return { repo, store };
}
const progress = () => parseFloat(String(StyleSheet.flatten(screen.getByTestId('rest-bar-progress').props.style).width));

test('logging a set starts rest as a bar at the bottom, not a full-screen sheet', async () => {
  const { store } = await logger();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  expect(screen.getByTestId('rest-mini-bar')).toBeTruthy();
  expect(screen.queryByTestId('rest-sheet')).toBeNull();
  expect(screen.getByTestId('rest-bar-clock')).toHaveTextContent('1:30');
  expect(store.timer()).toMatchObject({ minimized: true, duration: 90, ended: false });
  for (const name of ['−15 s', '+15 s', 'Skip']) expect(screen.getByRole('button', { name })).toBeTruthy();
});

test('−15 and +15 change the time left and Skip ends the rest', async () => {
  const { store } = await logger();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  await fireEvent.press(screen.getByRole('button', { name: '−15 s' }));
  expect(store.timer()!.duration).toBe(75);
  expect(screen.getByTestId('rest-bar-clock')).toHaveTextContent('1:15');
  await fireEvent.press(screen.getByRole('button', { name: '+15 s' }));
  await fireEvent.press(screen.getByRole('button', { name: '+15 s' }));
  expect(store.timer()!.duration).toBe(105);
  expect(screen.getByTestId('rest-bar-clock')).toHaveTextContent('1:45');
  await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(store.timer()).toBeFalsy();
  expect(screen.queryByTestId('rest-mini-bar')).toBeNull();
});

test('−15 never takes the rest below 15 seconds', async () => {
  const { store } = await logger();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  for (let i = 0; i < 8; i++) await fireEvent.press(screen.getByRole('button', { name: '−15 s' }));
  expect(store.timer()!.duration).toBe(15);
});

test('the line under the bar starts full and is empty when rest is over, when the bar offers Done', async () => {
  const { store } = await logger();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  expect(progress()).toBeGreaterThan(98);
  await act(async () => { store.updateTimer({ ended: true, endAt: Date.now() - 1000 }); });
  expect(progress()).toBe(0);
  expect(screen.getByText('Rest complete · next set ready')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '−15 s' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByTestId('rest-mini-bar')).toBeNull();
});

test('tapping the time opens the full timer, and it goes back to the bar when closed', async () => {
  const { store } = await logger();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  await fireEvent.press(screen.getByRole('button', { name: 'Expand rest timer' }));
  expect(screen.getByTestId('rest-sheet')).toBeTruthy();
  await fireEvent(screen.getByTestId('workout-sheet-host'), 'requestClose');
  expect(store.timer()!.minimized).toBe(true);
  expect(screen.getByTestId('rest-mini-bar')).toBeTruthy();
});

test('with "Full screen" chosen, logging a set opens the full timer as before', async () => {
  await logger(repo => repo.localSave('restOpens', 'full'));
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  expect(screen.getByTestId('rest-sheet')).toBeTruthy();
});

test('the choice is made in workout settings, stays on this phone, and unknown values read as the bar', async () => {
  const repo = memoryRepository(), save = jest.spyOn(repo, 'save');
  signIn(repo);
  expect(restOpens(repo)).toBe('bar');
  repo.localSave('restOpens', 'sideways');
  expect(restOpens(repo)).toBe('bar');
  await render(<WorkoutSettings />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Full screen' }));
  expect(restOpens(repo)).toBe('full');
  await fireEvent.press(screen.getByRole('button', { name: 'Bar' }));
  expect(restOpens(repo)).toBe('bar');
  expect(save).not.toHaveBeenCalled();
});

test('at large text the bar wraps its buttons under the clock, and every button keeps the shared touch target', async () => {
  await logger();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  expect(StyleSheet.flatten(screen.getByTestId('rest-bar-row').props.style)).toMatchObject({ flexWrap: 'wrap' });
  const { touchTarget } = require('../src/components/button') as typeof import('../src/components/button');
  for (const name of ['−15 s', '+15 s', 'Skip']) expect(StyleSheet.flatten(screen.getByRole('button', { name }).props.style).minHeight).toBe(touchTarget);
});
