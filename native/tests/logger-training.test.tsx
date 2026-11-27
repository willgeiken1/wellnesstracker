import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ActionSheetIOS, Alert } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { TrainingLogger } from '../src/features/workout/logger/screen';
import { barFor, checkSet, deleteSet, discardSession, exLabel, exMuscles, loggerView, plateText, removeExercise, rpeKey, stepWeight } from '../src/features/workout/logger/model';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useIsFocused: () => true, useLocalSearchParams: () => ({}) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

/** Made-up sample: last week's squat at 225 × 5 with RPE 8, then today's workout with squat and a lunge. */
function sample() {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  const past = store.start(undefined, Date.now() - 7 * 86_400_000);
  const old = store.addExercise(past.id, 'Squat', 2);
  for (const i of [0, 1]) { store.editDraft(old.id, i, { weight: '225', reps: '5' }); store.toggleDone(old.id, i); mockRepository.localSave(rpeKey(old.id, i), 8); }
  store.finish(past.id, { startedAt: Date.now() - 7 * 86_400_000, finishedAt: Date.now() - 7 * 86_400_000 + 3_600_000, notes: '' });
  const session = store.start();
  const squat = store.addExercise(session.id, 'Squat', 2), lunge = store.addExercise(session.id, 'Dumbbell Walking Lunge', 2);
  return { store, session, squat, lunge };
}

describe('logger model', () => {
  test('library names read in sentence case and muscles name the main groups', () => {
    expect(exLabel('Romanian Deadlift')).toBe('Romanian deadlift');
    expect(exLabel('My Odd Lift')).toBe('My Odd Lift');
    expect(exMuscles('Squat')).toMatch(/^Quads/);
  });
  test('plates and the focus steppers follow the mockup', () => {
    expect(plateText(225, 'lb')).toBe('2 × 45 each side, 45 lb bar');
    expect(plateText(45, 'lb')).toBe('Just the 45 lb bar');
  });
  test('plates use the bar chosen in Settings unless the exercise has its own', () => {
    const { store } = sample();
    expect(barFor(store, 'Squat', 'lb')).toBe(45);
    mockRepository.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'work.bar', '35'));
    expect(barFor(store, 'Squat', 'lb')).toBe(35);
    expect(plateText(135, 'lb', barFor(store, 'Squat', 'lb'))).toContain('35 lb bar');
    store.preferences().saveMachine('Squat', { text: '', bar_weight: 25 }, 'lb');
    expect(barFor(store, 'Squat', 'lb')).toBe(25);
    expect(stepWeight(100, 'lb', 1)).toBe(105);
    expect(stepWeight(50, 'lb', -1)).toBe(47.5);
    expect(stepWeight(40, 'kg', 1)).toBe(41.25);
  });
  test('checking a blank set logs the suggested numbers and last time’s RPE, and counts it', () => {
    const { store, session, squat } = sample();
    let view = loggerView(store, session);
    const e = view.exercises[0], s = e.sets[0];
    expect([s.weightHint, s.repsHint, s.lastRpe]).toEqual(['230', '5', 8]); // last time went well, so the hint moves up one step
    expect(view.current).toEqual({ entryId: squat.id, index: 0 });
    expect(checkSet(store, e, s)).toBe('done');
    expect(store.sets(squat.id)).toHaveLength(1);
    expect(store.repo.localGet(rpeKey(squat.id, 0))).toBe(8);
    view = loggerView(store, session);
    expect([view.done, view.total, view.volume]).toEqual([1, 4, 1150]);
    expect(view.exercises[0].best).toEqual({ w: 230, r: 5, rpe: 8 });
    expect(checkSet(store, view.exercises[0], view.exercises[0].sets[0])).toBe('undone');
    expect(store.sets(squat.id)).toHaveLength(0);
  });
  test('a heavier set than any before is the PR', () => {
    const { store, session, squat } = sample();
    store.editDraft(squat.id, 0, { weight: '235', reps: '5' });
    const e = loggerView(store, session).exercises[0];
    checkSet(store, e, e.sets[0]);
    expect(loggerView(store, session).exercises[0].sets[0].pr).toBe(true);
  });
  test("an earlier warm-up never hides a working set's record", () => {
    mockRepository = memoryRepository();
    const store = new WorkoutStore(mockRepository);
    const past = store.start(undefined, Date.now() - 7 * 86_400_000), old = store.addExercise(past.id, 'Squat', 2);
    store.editDraft(old.id, 0, { weight: '60', reps: '20', tag: 'warmup' }); store.toggleDone(old.id, 0);
    store.editDraft(old.id, 1, { weight: '75', reps: '5' }); store.toggleDone(old.id, 1);
    store.finish(past.id, { startedAt: Date.now() - 7 * 86_400_000, finishedAt: Date.now() - 7 * 86_400_000 + 3_600_000, notes: '' });
    const now = store.start(), sq = store.addExercise(now.id, 'Squat', 1);
    store.editDraft(sq.id, 0, { weight: '80', reps: '5' });
    const e = loggerView(store, now).exercises[0];
    checkSet(store, e, e.sets[0]);
    expect(loggerView(store, now).exercises[0].sets[0].pr).toBe(true);
  });
  test('a one-side set is a record only when its weaker side beats the best before', () => {
    mockRepository = memoryRepository();
    const store = new WorkoutStore(mockRepository);
    const log = (start: number | undefined, left: string, right: string) => {
      const s = store.start(undefined, start), e = store.addExercise(s.id, 'Bulgarian Split Squat', 1);
      store.setUnilateral(e.id, true);
      store.editDraft(e.id, 0, { weight: left, reps: '10', rightWeight: right, rightReps: '10' });
      return { s, e };
    };
    const past = log(Date.now() - 7 * 86_400_000, '55', '45');
    store.toggleDone(past.e.id, 0);
    store.finish(past.s.id, { startedAt: Date.now() - 7 * 86_400_000, finishedAt: Date.now() - 7 * 86_400_000 + 3_600_000, notes: '' });
    const now = log(undefined, '55', '45');
    const e = loggerView(store, now.s).exercises[0];
    checkSet(store, e, e.sets[0]);
    const view = loggerView(store, now.s).exercises[0];
    expect(view.sets[0].pr).toBe(false);
    expect(view.best).toMatchObject({ w: 45, r: 10 });
    store.editDraft(now.e.id, 0, { rightWeight: '50' });
    expect(loggerView(store, now.s).exercises[0].sets[0].pr).toBe(true);
  });
  test('a set without numbers or history is not checked off', () => {
    const { store, session } = sample();
    const e = loggerView(store, session).exercises[1];
    expect(checkSet(store, e, e.sets[0])).toBe('invalid');
    expect(store.sets(e.entry.id)).toHaveLength(0);
  });
  test('Undo puts back a deleted set and a removed exercise', () => {
    const { store, session, squat } = sample();
    const e = loggerView(store, session).exercises[0];
    checkSet(store, e, e.sets[0]);
    const undoSet = deleteSet(store, squat.id, 0);
    expect(store.sets(squat.id)).toHaveLength(0);
    undoSet();
    expect(store.sets(squat.id)).toHaveLength(1);
    expect(store.repo.localGet(rpeKey(squat.id, 0))).toBe(8);
    const undoExercise = removeExercise(store, squat.id);
    expect(store.entries(session.id)).toHaveLength(1);
    undoExercise();
    expect(store.entries(session.id)).toHaveLength(2);
    expect(store.sets(squat.id)).toHaveLength(1);
  });
  test('Undo after removing one of a superset of two puts the superset back', () => {
    const { store, session, squat, lunge } = sample();
    store.linkSuperset([squat.id, lunge.id]);
    const group = store.supersetGroup(store.repo.get('entries', squat.id)!);
    const undo = removeExercise(store, lunge.id);
    expect(store.supersetGroup(store.repo.get('entries', squat.id)!)).toBeNull();
    undo();
    expect(store.entries(session.id).map(e => store.supersetGroup(e))).toEqual([group, group]);
  });
  test('discarding removes the session, its exercises and sets', () => {
    const { store, session, squat } = sample();
    const e = loggerView(store, session).exercises[0];
    checkSet(store, e, e.sets[0]);
    discardSession(store, session.id);
    expect(store.active()).toBeUndefined();
    expect(store.sets(squat.id)).toHaveLength(0);
    expect(store.history()).toHaveLength(1);
  });
});

describe('logger screen', () => {
  test('a one-side-at-a-time exercise has its own right-side weight and reps, saved as typed', async () => {
    const { store, squat } = sample();
    store.setUnilateral(squat.id, true);
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    expect(screen.getByLabelText('Squat, set 1, Left, weight in pounds')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Squat, set 1, Left, weight in pounds'), '50');
    await fireEvent.changeText(screen.getByLabelText('Squat, set 1, Left, reps'), '10');
    await fireEvent.changeText(screen.getByLabelText('Squat, set 1, Right, weight in pounds'), '45');
    await fireEvent.changeText(screen.getByLabelText('Squat, set 1, Right, reps'), '8');
    await fireEvent.press(screen.getByTestId('set-0-0-check'));
    const set = store.sets(squat.id)[0].data;
    expect(set.left_reps).toBe(10);
    expect(set.right_reps).toBe(8);
    expect(Number(set.right_weight_kg)).toBeLessThan(Number(set.left_weight_kg));
  });
  test('focus mode logs a one-side exercise a side at a time, each with its own numbers', async () => {
    const { store, squat } = sample();
    store.setUnilateral(squat.id, true);
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    await fireEvent.press(screen.getByRole('button', { name: 'Focus mode: large text for the current set' }));
    expect(screen.getByRole('tab', { name: 'Left', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'More reps' }));
    expect(screen.queryByRole('button', { name: 'Log set' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Right side next' }));
    expect(screen.getByRole('tab', { name: 'Right', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Fewer reps' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Fewer reps' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Log set' }));
    const set = store.sets(squat.id)[0].data;
    expect(set.left_reps).toBe(6);
    expect(set.right_reps).toBe(4);
    expect(screen.getByRole('tab', { name: 'Left', selected: true })).toBeTruthy();
  });
  test('an exercise can be set to log each side on its own before any set is saved, and back', async () => {
    const { store, squat } = sample();
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
    const pick = (label: string) => sheet.mockImplementationOnce((o, cb) => cb(o.options.indexOf(label)));
    try {
      await render(<TrainingLogger />, { wrapper });
      await act(async () => {});
      pick('Log left and right separately');
      await fireEvent.press(screen.getByRole('button', { name: 'Exercise options for Squat' }));
      expect(store.isUnilateral(squat.id)).toBe(true);
      expect(screen.getByLabelText('Squat, set 1, Right, weight in pounds')).toBeTruthy();
      pick('Log both sides together');
      await fireEvent.press(screen.getByRole('button', { name: 'Exercise options for Squat' }));
      expect(store.isUnilateral(squat.id)).toBe(false);
      // Once a set is saved the choice is fixed, so the sheet no longer offers it.
      store.editDraft(squat.id, 0, { weight: '200', reps: '5' }); store.toggleDone(squat.id, 0);
      sheet.mockImplementationOnce(() => {});
      await fireEvent.press(screen.getByRole('button', { name: 'Exercise options for Squat' }));
      expect(sheet.mock.calls.at(-1)![0].options).not.toContain('Log left and right separately');
    } finally { sheet.mockRestore(); }
  });
  test('two exercises can be made a superset from the exercise options, shown on the open card, and unlinked', async () => {
    const { store, squat, lunge } = sample();
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
    const pick = (label: string) => sheet.mockImplementationOnce((o, cb) => cb(o.options.indexOf(label)));
    try {
      await render(<TrainingLogger />, { wrapper });
      await act(async () => {});
      pick('Superset with another exercise');
      pick('Dumbbell walking lunge');
      await fireEvent.press(screen.getByRole('button', { name: 'Exercise options for Squat' }));
      const group = store.supersetGroup(store.repo.get('entries', squat.id)!);
      expect(group).not.toBeNull();
      expect(store.supersetGroup(store.repo.get('entries', lunge.id)!)).toBe(group);
      expect(screen.getByText(/^Superset with Dumbbell walking lunge · rest/)).toBeTruthy();
      pick('Unlink superset');
      await fireEvent.press(screen.getByRole('button', { name: 'Exercise options for Squat' }));
      expect(store.supersetGroup(store.repo.get('entries', squat.id)!)).toBeNull();
      expect(store.supersetGroup(store.repo.get('entries', lunge.id)!)).toBeNull();
    } finally { sheet.mockRestore(); }
  });
  test('a change to a checked-off set is saved when the field is left', async () => {
    const { store, squat } = sample();
    store.editDraft(squat.id, 0, { weight: '200', reps: '5' }); store.toggleDone(squat.id, 0);
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    const reps = screen.getByLabelText('Squat, set 1, reps');
    await fireEvent.changeText(reps, '7');
    await fireEvent(reps, 'blur');
    await act(async () => {});
    expect(store.sets(squat.id)[0].data.reps).toBe(7);
    expect(screen.getByLabelText('Squat, set 1, reps').props.value).toBe('7');
  });
  test('shows the top bar, jump strip, progress and the open exercise with its set cards', async () => {
    sample();
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Minimize workout, back to Training' })).toBeTruthy();
    expect(screen.getByTestId('finish-button')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Squat, up now' })).toBeTruthy();
    expect(screen.getByText('of 4 sets')).toBeTruthy();
    expect(screen.getByLabelText('Squat, set 1, weight in pounds').props.placeholder).toBe('230');
    expect(screen.getAllByRole('radio', { name: '8, last time' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/AI/)).toBeNull();
  });
  test('the screen stays awake only while Keep screen awake is on, and follows the switch', async () => {
    sample();
    jest.mocked(useKeepAwake).mockClear();
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    expect(useKeepAwake).toHaveBeenCalledWith('workout');
    jest.mocked(useKeepAwake).mockClear();
    await act(async () => { mockRepository.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'work.awake', false)); });
    await fireEvent.press(screen.getByRole('button', { name: 'Squat, up now' }));
    expect(useKeepAwake).not.toHaveBeenCalled();
  });
  test('with Keep screen awake off, the logger never keeps the screen on', async () => {
    sample();
    mockRepository.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'work.awake', false));
    jest.mocked(useKeepAwake).mockClear();
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    expect(useKeepAwake).not.toHaveBeenCalled();
  });
  test('checking a set off saves it and starts the rest bar', async () => {
    const { store, squat } = sample();
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('set-0-0-check'));
    expect(store.sets(squat.id)).toHaveLength(1);
    expect(screen.getByTestId('rest-bar')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByTestId('rest-bar')).toBeNull();
  });
  test('Finish with unchecked sets asks first, then saves and opens the summary', async () => {
    const { store, session } = sample();
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_o, cb) => cb(0));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[0]?.onPress?.());
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('set-0-0-check'));
    await fireEvent.press(screen.getByTestId('finish-button'));
    expect(sheet.mock.calls.length + alert.mock.calls.length).toBe(1);
    expect(store.repo.get('sessions', session.id)?.data.finished_at).not.toBeNull();
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/workout/summary', params: { id: session.id, just: '1' } });
    sheet.mockRestore(); alert.mockRestore();
  });
  test('Add exercise opens the picker for the workout on screen', async () => {
    const { session } = sample();
    await render(<TrainingLogger />, { wrapper });
    await act(async () => {});
    await fireEvent.press(screen.getAllByRole('button', { name: 'Add exercise' }).at(-1)!);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/training/picker', params: { mode: 'add', session: session.id } });
  });
});
