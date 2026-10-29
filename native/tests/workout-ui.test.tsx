import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { memoryRepository } from './workout-repository';
import { createLoggerFixture } from '../src/features/workout/devFixture';
import { useWorkout } from '../src/features/workout/use-workout';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react-native';
import { AppState, AccessibilityInfo, Text, DeviceEventEmitter, Alert, FlatList } from 'react-native';
import { restBuzz, signatureBuzz } from '../src/features/workout/haptics';
import { useState, useMemo } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { SyncBadge } from '../src/features/workout/badge';
import { Keypad } from '../src/features/workout/keypad';
import { SetRow } from '../src/features/workout/set-row';
import { RestContours, RestTimer } from '../src/features/workout/timer';
import { WorkoutSummary } from '../src/features/workout/summary';
import { WorkoutStore } from '../src/data/workout/store';
import { parseLocalDateTime } from '../src/features/workout/finish';
import type { Repository } from '../src/data/repository';
import { ActiveWorkout } from '../src/features/workout/active';
import { useAuth } from '../src/auth/provider';
import { clock, Eyebrow } from '../src/features/workout/primitives';
import { tokens } from '../src/design/tokens';
import { displayWeight, rounded, nextField } from '../src/core/workout/rules';
import { t } from '../src/i18n/en';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useIsFocused: () => true, router: { canDismiss: () => false, replace: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/workout/haptics', () => ({
  tick: jest.fn(),
  restBuzz: jest.fn(),
  signatureBuzz: jest.fn(() => jest.fn())
}));
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn()
}));
function wrapper({
  children
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
beforeEach(() => { jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false); });
afterEach(() => jest.useRealTimers());
test('badge pending/offline → Synced → hidden at 1.5 s, guest saved locally', async () => {
  jest.useFakeTimers();
  const view = await render(<SyncBadge local={false} pending={1} status="offline" />, {
    wrapper
  });
  expect(screen.getByText('Offline · saved on phone')).toBeTruthy();
  await view.rerender(<SyncBadge local={false} pending={0} status="idle" />);
  expect(screen.getByText('Synced')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(1499));
  expect(screen.getByText('Synced')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(1));
  expect(screen.queryByText('Synced')).toBeNull();
  await view.rerender(<SyncBadge local pending={0} status="idle" />);
  expect(screen.getByText('Saved on phone')).toBeTruthy();
});
test('keypad Next moves weight → reps → next set; opening a blank keeps it blank', async () => {
  function Flow() {
    const [cursor, setCursor] = useState({
        field: 'weight' as 'weight' | 'reps',
        index: 0
      }),
      [value, setValue] = useState('');
    return <><Text testID="cursor">{`${cursor.index}:${cursor.field}`}</Text><Keypad label="Synthetic bench" equipment="barbell" unit="lb" field={cursor.field} value={value} previous="185 × 8" onChange={setValue} onClose={() => {}} onNext={() => {
        setCursor(nextField(cursor.field, cursor.index, 2)!);
        setValue('');
      }} /></>;
  }
  await render(<Flow />, {
    wrapper
  });
  expect(screen.queryByText('0 lb')).toBeNull();
  await fireEvent.press(screen.getByRole('button', {
    name: '1'
  }));
  await fireEvent.press(screen.getByRole('button', {
    name: 'Next: Reps'
  }));
  expect(screen.getByTestId('cursor')).toHaveTextContent('0:reps');
  await fireEvent.press(screen.getByRole('button', {
    name: '8'
  }));
  await fireEvent.press(screen.getByRole('button', {
    name: 'Next: Set'
  }));
  expect(screen.getByTestId('cursor')).toHaveTextContent('1:weight');
});
test('plate line only for barbell and correct equipment steps', async () => {
  const change = jest.fn();
  const view = await render(<Keypad label="Synthetic" equipment="barbell" unit="lb" field="weight" value="190" previous="" onChange={change} onClose={() => {}} onNext={() => {}} />, {
    wrapper
  });
  expect(screen.getByTestId('plate-line')).toHaveTextContent(/45 \+ 25 \+ 2.5/);
  await fireEvent.press(screen.getByRole('button', {
    name: '+5'
  }));
  expect(change).toHaveBeenCalledWith('195');
  await view.rerender(<Keypad label="Synthetic" equipment="machine" unit="kg" field="weight" value="50" previous="" onChange={change} onClose={() => {}} onNext={() => {}} />);
  expect(screen.queryByText(/Plates per side/)).toBeNull();
});
test('set check saves and starts timer sheet, minimize and expand', async () => {
  const store = new WorkoutStore(memoryRepository()),
    s = store.start(),
    e = store.addExercise(s.id, 'Bench Press');
  store.editDraft(e.id, 0, {
    weight: '100',
    reps: '8'
  });
  function Flow() {
    const [, update] = useState(0);
    return <><SetRow exercise="Bench Press" index={0} draft={store.drafts(e.id)[0]} previous="" hint="" onEdit={() => {}} onRemove={() => {}} onDone={() => {
        store.toggleDone(e.id, 0);
        update(n => n + 1);
      }} /><RestTimer store={store} /></>;
  }
  const view = await render(<Flow />, {
    wrapper
  });
  await fireEvent.press(screen.getByRole('checkbox', {
    name: 'Bench Press, Set 1, Done'
  }));
  expect(store.sets(e.id)).toHaveLength(1);
  expect(screen.getByText('1:30')).toBeTruthy();
  await act(() => screen.getByTestId('rest-sheet-handle').props.onAccessibilityAction({nativeEvent:{actionName:'minimize'}}));
  await view.rerender(<Flow />);
  expect(store.timer()?.minimized).toBe(true);
  await fireEvent.press(screen.getByRole('button', {
    name: 'Expand rest timer'
  }));
  await view.rerender(<Flow />);
  expect(screen.getByText('1:30')).toBeTruthy();
});
test('summary PR badge, estimate, quiet token; no AI card', async () => {
  const store = new WorkoutStore(memoryRepository());
  for (const weight of ['100', '105']) {
    const s = store.start(undefined, Date.now() - 60000),
      e = store.addExercise(s.id, 'Bench Press', 1);
    store.editDraft(e.id, 0, {
      weight,
      reps: '8'
    });
    store.toggleDone(e.id, 0);
    store.finish(s.id, {
      startedAt: Date.now() - 60000 + (weight === '105' ? 1000 : 0),
      finishedAt: Date.now(),
      notes: ''
    });
  }
  const id = store.history()[0].id;
  await render(<WorkoutSummary store={store} id={id} />, {
    wrapper
  });
  expect(screen.getByText('New PR')).toBeTruthy();
  expect(screen.getByText(/Est. 1RM ≈/)).toBeTruthy();
  expect(screen.getByLabelText('Bench Press, Summit token')).toBeTruthy();
  expect(screen.queryByText('AI summary')).toBeNull();
});
test('finish parser rejects invalid calendar dates, accepts local past time', () => {
  expect(Number.isNaN(parseLocalDateTime('2026-02-30 10:00'))).toBe(true);
  expect(parseLocalDateTime('2026-10-17 18:00')).toBe(new Date(2026, 9, 17, 18).getTime());
});
test('absolute timer expiry buzzes once, persists ended state and shows the next-set cue after restart', async () => {
  jest.useFakeTimers();
  const previousState = AppState.currentState;
  AppState.currentState = 'active';
  jest.mocked(restBuzz).mockClear();
  const repo = memoryRepository(),
    store = new WorkoutStore(repo),
    s = store.start(),
    e = store.addExercise(s.id, 'Squat', 1);
  store.editDraft(e.id, 0, {
    weight: '100',
    reps: '8'
  });
  store.toggleDone(e.id, 0);
  const view = await render(<RestTimer store={store} />, {
    wrapper
  });
  await act(() => jest.advanceTimersByTime(90000));
  expect(store.timer()?.ended).toBe(true);
  expect(restBuzz).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Rest complete · next set ready')).toBeTruthy();
  await view.unmount();
  await render(<RestTimer store={new WorkoutStore(repo)} />, {
    wrapper
  });
  await act(() => jest.advanceTimersByTime(1000));
  expect(restBuzz).toHaveBeenCalledTimes(1);
  AppState.currentState = previousState;
});
test.each([false, true])('PR signature runs once across remount with Reduce Motion %s', async reduceMotion => {
  const preference = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  jest.mocked(signatureBuzz).mockClear();
  const store = new WorkoutStore(memoryRepository());
  for (const weight of ['100', '105']) {
    const start = Date.now() - (weight === '100' ? 120000 : 60000),
      s = store.start(undefined, start),
      e = store.addExercise(s.id, 'Bench Press', 1);
    store.editDraft(e.id, 0, {
      weight,
      reps: '8'
    });
    store.toggleDone(e.id, 0);
    store.finish(s.id, {
      startedAt: start,
      finishedAt: Date.now(),
      notes: ''
    });
  }
  const id = store.history()[0].id;
  const view = await render(<WorkoutSummary store={store} id={id} />, {
    wrapper
  });
  expect(signatureBuzz).toHaveBeenCalledTimes(1);
  await view.unmount();
  await render(<WorkoutSummary store={store} id={id} />, {
    wrapper
  });
  expect(signatureBuzz).toHaveBeenCalledTimes(1);
  preference.mockRestore();
});

function activeRepository(repo: Repository) {
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
}
test('invalid pending set replaces a save failure with validation and no stale retry', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  store.addExercise(store.start().id, 'Bench Press');
  activeRepository(repo);
  const add = jest.spyOn(WorkoutStore.prototype, 'addSet').mockImplementationOnce(() => { throw Error('Synthetic save failure'); });
  try {
    await render(<ActiveWorkout />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: `Bench Press, ${t('exerciseOptions')}` }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add set' }));
    expect(screen.getByRole('button', { name: t('tryAgain') })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('set-0-0-done'));
    expect(screen.getByRole('alert')).toHaveTextContent(t('invalidSet'));
    expect(screen.queryByRole('button', { name: t('tryAgain') })).toBeNull();
    expect(add).toHaveBeenCalledTimes(1);
  } finally { add.mockRestore(); }
});
test('invalid saved-set edit shows validation without retry', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Bench Press');
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' });
  store.toggleDone(entry.id, 0);
  store.skipTimer();
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Bench Press, Set 1, Reps, 8' }));
  await fireEvent.press(screen.getByTestId('keypad-key-backspace'));
  await fireEvent.press(screen.getByTestId('keypad-next'));
  expect(screen.getByRole('alert')).toHaveTextContent(t('invalidSet'));
  expect(screen.queryByRole('button', { name: t('tryAgain') })).toBeNull();
});
test('save failure retries the failed action and clears the error on success', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Bench Press');
  activeRepository(repo);
  const add = jest.spyOn(WorkoutStore.prototype, 'addSet').mockImplementationOnce(() => { throw Error('Synthetic save failure'); });
  try {
    await render(<ActiveWorkout />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: `Bench Press, ${t('exerciseOptions')}` }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add set' }));
    expect(screen.getByRole('alert')).toHaveTextContent(t('workoutSaveError'));
    await fireEvent.press(screen.getByRole('button', { name: t('tryAgain') }));
    expect(store.drafts(entry.id)).toHaveLength(4);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: t('tryAgain') })).toBeNull();
  } finally { add.mockRestore(); }
});
test('compiled logger opens immediately after start', async () => {
  activeRepository(memoryRepository());
  await render(<ActiveWorkout />, { wrapper });
  expect(screen.getByText('Add exercise')).toBeTruthy();
});
test('compiled logger updates keypad values and rows live', async () => {
  const repo = memoryRepository();
  const store = new WorkoutStore(repo);
  const start = Date.now() - 120000, prior = store.start(undefined, start);
  const previous = store.addExercise(prior.id, 'Close-Grip Bench Press', 1);
  store.editDraft(previous.id, 0, { weight: '100', reps: '8' });
  store.toggleDone(previous.id, 0);
  store.finish(prior.id, { startedAt: start, finishedAt: Date.now() - 60000, notes: '' });
  store.addExercise(store.start().id, 'Close-Grip Bench Press');
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Close-Grip Bench Press, Set 1, Weight, blank' }));
  for (const digit of ['1', '3', '5']) await fireEvent.press(screen.getByRole('button', { name: digit }));
  expect(screen.getByText('135 lb')).toBeTruthy();
  expect(within(screen.getByTestId('keypad-sheet')).getByText('100 × 8')).toBeTruthy();
  await act(() => { store.editDraft(previous.id, 0, { weight: '105' }); });
  expect(within(screen.getByTestId('keypad-sheet')).getByText('105 × 8')).toBeTruthy();
  const numberKey = screen.getByTestId('keypad-key-8');
  await fireEvent.press(screen.getByRole('button', { name: 'Next: Reps' }));
  expect(screen.getByTestId('keypad-key-8')).toBe(numberKey);
  await fireEvent.press(screen.getByRole('button', { name: '8' }));
  expect(screen.getByText('8 Reps')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('button', { name: 'Close-Grip Bench Press, Set 1, Weight, 135' })).toBeTruthy();
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  expect(screen.getByTestId('rest-sheet')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByText(/Set 2 of 3/)).toBeTruthy();
});
test('compiled logger counts only live entries and sets after removals', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), session = store.start();
  const first = store.addExercise(session.id, 'Bench Press'), second = store.addExercise(session.id, 'Squat');
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  expect(screen.getByText(/Set 1 of 6/)).toBeTruthy();
  await act(() => { store.removeExercise(first.id); });
  expect(screen.getByText(/Set 1 of 3/)).toBeTruthy();
  await act(() => { store.removeSet(second.id, 0); });
  expect(screen.getByText(/Set 1 of 2/)).toBeTruthy();
});
test('empty logger and nonfinite display inputs never render NaN', async () => {
  activeRepository(memoryRepository());
  await render(<ActiveWorkout />, { wrapper });
  expect(screen.queryByText(/NaN/)).toBeNull();
  expect(clock(NaN)).toBe('0:00');
  expect(clock(Infinity)).toBe('0:00');
  expect(displayWeight(NaN, 'lb')).toBe(0);
  expect(rounded(Infinity)).toBe(0);
});

test('subscription exposes draft edits to memoized readers without a local state update', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Bench Press');
  activeRepository(repo);
  const { result } = await renderHook(() => {
    const { store: view } = useWorkout();
    return useMemo(() => view!.drafts(entry.id)[0], [view]);
  });
  for (const weight of ['1', '13', '135']) {
    await act(() => { store.editDraft(entry.id, 0, { weight }); });
    expect(result.current.weight).toBe(weight);
  }
  await act(() => { store.editDraft(entry.id, 0, { reps: '8' }); });
  expect(result.current.reps).toBe('8');
});

test('summary refreshes volume and notes after a repository edit without remounting', async () => {
  const store = new WorkoutStore(memoryRepository()), start = Date.now() - 60000;
  const session = store.start(undefined, start), entry = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' });
  store.toggleDone(entry.id, 0);
  store.finish(session.id, { startedAt: start, finishedAt: Date.now(), notes: 'Synthetic first note' });
  await render(<WorkoutSummary store={store} id={session.id} />, { wrapper });
  expect(screen.getByText('800')).toBeTruthy();
  await act(() => { store.editDraft(entry.id, 0, { weight: '105' }); });
  expect(screen.getByText('840')).toBeTruthy();
  await act(() => { store.finish(session.id, { startedAt: start, finishedAt: Date.now(), notes: 'Synthetic revised note' }); });
  expect(screen.getByText('Synthetic revised note')).toBeTruthy();
});


function ExistingValueKeypad({ field = 'weight', unit = 'lb', initial = '135', label = 'Synthetic set' }: {
  field?: 'weight' | 'reps'; unit?: 'lb' | 'kg'; initial?: string; label?: string;
}) {
  const [value, setValue] = useState(initial);
  return <Keypad label={label} equipment="barbell" unit={unit} field={field} value={value} previous="" onChange={setValue} onClose={() => {}} onNext={() => {}} />;
}
test('first digit replaces existing weight; later digits append; reopening selects again', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  store.editDraft(entry.id, 0, { weight: '135', reps: '8' });
  store.editDraft(entry.id, 1, { weight: '185', reps: '10' });
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  const open = () => fireEvent.press(screen.getByRole('button', { name: 'Close-Grip Bench Press, Set 1, Weight, 135' }));
  await open();
  for (const digit of ['1', '3', '5']) await fireEvent.press(screen.getByTestId(`keypad-key-${digit}`));
  expect(store.drafts(entry.id)[0].weight).toBe('135');
  await fireEvent.press(screen.getByTestId('keypad-next'));
  await fireEvent.press(screen.getByTestId('keypad-key-6'));
  expect(store.drafts(entry.id)[0].reps).toBe('6');
  await fireEvent.press(screen.getByTestId('keypad-next'));
  await fireEvent.press(screen.getByTestId('keypad-key-9'));
  expect(store.drafts(entry.id)[1].weight).toBe('9');
  await fireEvent.press(screen.getByTestId('keypad-close'));
  await open();
  await fireEvent.press(screen.getByTestId('keypad-key-2'));
  expect(store.drafts(entry.id)[0].weight).toBe('2');
});
test('untouched backspace and steps operate on the existing value', async () => {
  await render(<ExistingValueKeypad />, { wrapper });
  await fireEvent.press(screen.getByTestId('keypad-key-backspace'));
  expect(screen.getByText('13 lb')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('keypad-key-5'));
  expect(screen.getByText('135 lb')).toBeTruthy();
});
test.each([
  ['weight', 'kg', '1000', '0'], ['weight', 'lb', '2204.6', '3'],
  ['reps', 'lb', '100', '0'], ['weight', 'lb', '1.2', '3'], ['weight', 'kg', '1.25', '3'],
] as const)('keypad rejects excess input with a muted cue: %s %s %s', async (field, unit, initial, digit) => {
  // Backspace then restore the final character to consume initial replacement.
  await render(<ExistingValueKeypad field={field} unit={unit} initial={initial} />, { wrapper });
  await fireEvent.press(screen.getByTestId('keypad-key-backspace'));
  await fireEvent.press(screen.getByTestId(`keypad-key-${initial.at(-1)}`));
  await fireEvent.press(screen.getByTestId(`keypad-key-${digit}`));
  expect(screen.getByText(`${initial} ${field === 'weight' ? unit : 'Reps'}`)).toBeTruthy();
  expect(screen.getByTestId('keypad-limit-hint')).toBeTruthy();
});
test('plate line groups duplicates on one line and hides oversized drafts', async () => {
  const props = { label: 'Synthetic', equipment: 'barbell' as const, unit: 'lb' as const, field: 'weight' as const, previous: '', onChange: jest.fn(), onClose: () => {}, onNext: () => {} };
  const view = await render(<Keypad {...props} value="340" />, { wrapper });
  expect(screen.getByTestId('plate-line')).toHaveTextContent(/45 × 3 \+ 10 \+ 2.5/);
  expect(screen.getByTestId('plate-line')).toHaveProp('numberOfLines', 1);
  await view.rerender(<Keypad {...props} value="135135" />);
  expect(screen.queryByText(/Plates per side/)).toBeNull();
});
test.each([false, true])('workout header only shows an eyebrow for templates: %s', async template => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const routine = template ? store.saveTemplate('Synthetic Push', []) : undefined;
  store.start(routine?.id);
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  if (template) expect(screen.getByText('Template')).toBeTruthy();
  else expect(screen.getAllByText('Workout')).toHaveLength(1);
});

test('Eyebrow component renders sentence-case semibold caption text', async () => {
  const { rerender } = await render(<Eyebrow>Template</Eyebrow>, { wrapper });
  const text = screen.getByText('Template');
  expect(text).toBeTruthy();
  expect(text).toHaveStyle({
    fontSize: tokens.type.caption,
    fontWeight: '600',
  });

  await rerender(<Eyebrow center>Rest</Eyebrow>);
  const centered = screen.getByText('Rest');
  expect(centered).toBeTruthy();
  expect(centered).toHaveStyle({
    textAlign: 'center',
    fontSize: tokens.type.caption,
    fontWeight: '600',
  });
});

test('active-workout header row renders Eyebrow with semibold style for templates', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const routine = store.saveTemplate('Synthetic Push', []);
  store.start(routine.id);
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  const eyebrow = screen.getByText('Template');
  expect(eyebrow).toBeTruthy();
  expect(eyebrow).toHaveStyle({
    fontSize: tokens.type.caption,
    fontWeight: '600',
  });
  expect(screen.getByText('Synthetic Push')).toHaveStyle({
    fontWeight: '600',
  });
});

test('active-workout exercise column header row renders sentence-case semibold labels', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const session = store.start();
  store.addExercise(session.id, 'Bench Press');
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  const setHeader = screen.getByText('Set');
  const prevHeader = screen.getByText('Previous');
  const repsHeader = screen.getByText('Reps');
  const unitHeader = screen.getByText('lb');

  for (const el of [setHeader, prevHeader, repsHeader, unitHeader]) {
    expect(el).toBeTruthy();
    expect(el).toHaveStyle({
      fontSize: tokens.type.caption,
      fontWeight: '600',
    });
  }
});


test.each([['plus', '140 lb'], ['minus', '130 lb']] as const)('untouched %s steps the existing weight', async (key, expected) => {
  await render(<ExistingValueKeypad />, { wrapper });
  await fireEvent.press(screen.getByTestId(`keypad-key-${key}`));
  expect(screen.getByText(expected)).toBeTruthy();
});
test('Next keeps untouched weight and reps; first digit after moving still replaces', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  store.editDraft(entry.id, 0, { weight: '135', reps: '8' });
  store.editDraft(entry.id, 1, { weight: '185', reps: '10' });
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Close-Grip Bench Press, Set 1, Weight, 135' }));
  await fireEvent.press(screen.getByTestId('keypad-next'));
  expect(screen.getByText('8 Reps')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('keypad-next'));
  expect(store.drafts(entry.id)[0]).toMatchObject({ weight: '135', reps: '8' });
  await fireEvent.press(screen.getByTestId('keypad-key-1'));
  expect(store.drafts(entry.id)[1].weight).toBe('1');
});
test('step and wheel cannot exceed the weight limit', async () => {
  await render(<ExistingValueKeypad unit="kg" initial="1000" />, { wrapper });
  await fireEvent.press(screen.getByTestId('keypad-key-plus'));
  expect(screen.getByText('1000 kg')).toBeTruthy();
  expect(screen.getByTestId('keypad-limit-hint')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('keypad-key-wheel'));
  await fireEvent.press(screen.getByRole('button', { name: '1002.5' }));
  expect(screen.getByText('1000 kg')).toBeTruthy();
});

test('empty workout exposes a finite zero percent progress range', async () => {
  activeRepository(memoryRepository());
  await render(<ActiveWorkout />, { wrapper });
  expect(screen.getByRole('progressbar')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 0 });
});

test('session weight hints stay uncommitted, carry forward, and Done accepts them without copying reps', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  store.editDraft(entry.id, 0, { weight: '135', reps: '8' });
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByTestId('set-0-1-weight')).toHaveTextContent('135');
  expect(store.drafts(entry.id)[1]).toMatchObject({ weight: '', reps: '' });
  await fireEvent.press(screen.getByTestId('set-0-1-reps'));
  await fireEvent.press(screen.getByTestId('keypad-key-8'));
  await fireEvent.press(screen.getByTestId('keypad-next'));
  expect(screen.getByText('135 lb')).toBeTruthy();
  expect(store.drafts(entry.id)[2]).toMatchObject({ weight: '', reps: '' });
  await fireEvent.press(screen.getByTestId('keypad-close'));
  await fireEvent.press(screen.getByTestId('set-0-1-done'));
  expect(store.drafts(entry.id)[1]).toMatchObject({ weight: '135', reps: '8', setId: expect.any(String) });
  await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  await fireEvent.press(screen.getByTestId('set-0-2-weight'));
  await fireEvent.press(screen.getByTestId('keypad-next'));
  expect(screen.getByText('— Reps')).toBeTruthy();
  expect(store.drafts(entry.id)[2].weight).toBe('');
  await fireEvent.press(screen.getByTestId('keypad-key-6'));
  await fireEvent.press(screen.getByTestId('keypad-close'));
  await fireEvent.press(screen.getByTestId('set-0-2-done'));
  expect(store.drafts(entry.id)[2]).toMatchObject({ weight: '135', reps: '6', setId: expect.any(String) });
});

test('picker keeps search and tappable results in a keyboard avoiding container', async () => {
  activeRepository(memoryRepository());
  await render(<ActiveWorkout />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  const search = screen.getByTestId('exercise-picker-search');
  await fireEvent.changeText(search, 'Close-Grip Bench');
  const container = screen.getByTestId('sheet-keyboard-container');
  await fireEvent(container, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } }, persist: () => {} });
  await act(() => DeviceEventEmitter.emit('keyboardWillShow', { endCoordinates: { screenY: 500, height: 300 }, duration: 0 }));
  expect(container).toHaveStyle({ paddingBottom: 300 });
  expect(screen.getByTestId('exercise-picker-results')).toHaveProp('keyboardShouldPersistTaps', 'handled');
  await fireEvent.press(screen.getByTestId('exercise-picker-result-0'));
  expect(screen.getByText('Close-Grip Bench Press')).toBeTruthy();
});

test('logger reuses one native modal across picker, keypad, rest and finish; dismissals can reopen', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  store.editDraft(entry.id, 0, { weight: '135', reps: '8' });
  activeRepository(repo);
  const view = await render(<ActiveWorkout />, { wrapper });
  const modal = () => screen.getByTestId('workout-sheet-host');
  const dismiss = async () => { await fireEvent(modal(), 'requestClose'); };
  for (let i = 0; i < 2; i++) {
    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
    await fireEvent.changeText(screen.getByTestId('exercise-picker-search'), 'Bench');
    await dismiss();
    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
    expect(screen.getByTestId('exercise-picker-search')).toHaveProp('value', '');
    await act(() => DeviceEventEmitter.emit('keyboardWillHide', { duration: 0 }));
    expect(screen.getByTestId('exercise-picker-search')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
  }
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  const host = modal();
  // Changing from rest to picker retains the same native presenter.
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  expect(modal()).toBe(host);
  await dismiss();
  await fireEvent.press(screen.getByRole('button', { name: 'Expand rest timer' }));
  expect(screen.getByTestId('rest-sheet')).toBeTruthy();
  await dismiss();
  for (let i = 0; i < 2; i++) {
    await fireEvent.press(screen.getByTestId('set-0-1-weight'));
    await dismiss();
    await fireEvent.press(screen.getByTestId('finish-button'));
    await dismiss();
  }
  // A fresh session must not inherit an open picker or its search query.
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  await fireEvent.changeText(screen.getByTestId('exercise-picker-search'), 'Synthetic old query');
  await act(() => {
    store.finish(store.active()!.id, { startedAt: Date.now() - 60000, finishedAt: Date.now(), notes: '' });
    store.start();
  });
  await view.rerender(<ActiveWorkout />);
  expect(screen.queryByTestId('exercise-picker-search')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  expect(screen.getByTestId('exercise-picker-search')).toHaveProp('value', '');
});

test('suggestion card exposes a stable automation target', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), start = Date.now() - 120000;
  const prior = store.start(undefined, start), entry = store.addExercise(prior.id, 'Close-Grip Bench Press', 1);
  store.editDraft(entry.id, 0, { weight: '135', reps: '8' });
  store.toggleDone(entry.id, 0);
  store.finish(prior.id, { startedAt: start, finishedAt: Date.now() - 60000, notes: '' });
  store.addExercise(store.start().id, 'Close-Grip Bench Press');
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  expect(screen.getByTestId('suggestion-card')).toHaveTextContent(/140 lb/);
});


test('bodyweight has no Try weight suggestion even with a saved Step', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), start = Date.now() - 120000;
  const prior = store.start(undefined, start), entry = store.addExercise(prior.id, 'Pull-Up', 1);
  store.editDraft(entry.id, 0, { weight: '0', reps: '8' });
  store.toggleDone(entry.id, 0);
  store.finish(prior.id, { startedAt: start, finishedAt: Date.now() - 60000, notes: '' });
  store.preferences().saveMachine('Pull-Up', { text: '', step: 10 });
  const current = store.addExercise(store.start().id, 'Pull-Up');
  expect(store.suggestion(current)).toMatchObject({ weight: 0, jump: false });
  expect(store.showCard(current)).toBe(false);
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  expect(screen.queryByTestId('suggestion-card')).toBeNull();
  expect(screen.queryByText(/Try \d.*(?:lb|kg)/)).toBeNull();
});


test('exercise options can cancel and reopen, then add a set', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  activeRepository(repo);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ActiveWorkout />, { wrapper });
  const open = () => fireEvent.press(screen.getByRole('button', { name: 'Close-Grip Bench Press, Exercise options' }));
  await open();
  await fireEvent.press(screen.getByRole('button', {name:'Cancel'}));
  await open();
  await fireEvent.press(screen.getByRole('button', {name:'Add set'}));
  expect(store.drafts(entry.id)).toHaveLength(4);
  alert.mockRestore();
});

test('offline badge is a themed chip even in a forced-offline demo', async () => {
  await render(<SyncBadge local pending={0} status="offline" />, { wrapper });
  expect(screen.getByText('Offline · saved on phone')).toBeTruthy();
  expect(screen.getByTestId('sync-chip')).toHaveStyle({ borderRadius: 99 });
});
test('completed rows fill the card width and pending inputs remain borderless', async () => {
  const props = { exercise: 'Bench Press', index: 0, previous: '185 × 8', hint: '190', onEdit: jest.fn(), onDone: jest.fn(), onRemove: jest.fn() };
  const view = await render(<SetRow {...props} draft={{weight:'185',reps:'8',setId:'synthetic'}} />, {wrapper});
  expect(screen.getByTestId('set-row-0-0')).toHaveStyle({marginHorizontal:-14,borderRadius:0});
  await view.rerender(<SetRow {...props} draft={{weight:'',reps:''}} />);
  expect(screen.getByTestId('set-0-0-weight')).toHaveStyle({borderWidth:0});
});
test('completed exercises collapse with volume and expand on tap', async () => {
  const repo=memoryRepository(), store=new WorkoutStore(repo), s=store.start();
  const e=store.addExercise(s.id,'Overhead Press',1);
  store.editDraft(e.id,0,{weight:'105',reps:'10'}); store.toggleDone(e.id,0); store.skipTimer();
  activeRepository(repo); await render(<ActiveWorkout/>,{wrapper});
  expect(screen.getByText('1 set · 1,050 lb')).toBeTruthy();
  expect(screen.queryByTestId('set-0-0-weight')).toBeNull();
  await fireEvent.press(screen.getByRole('button',{name:'Expand exercise'}));
  expect(screen.getByTestId('set-0-0-weight')).toBeTruthy();
});

test('fixture is inert outside development demo mode', () => {
  const store=new WorkoutStore(memoryRepository());
  for (const context of [{isDev:false,demo:true,signedIn:false},{isDev:true,demo:false,signedIn:false},{isDev:true,demo:true,signedIn:true}]) {
    expect(createLoggerFixture(store,context,'logger')).toBeNull();
    expect(store.repo.list('sessions')).toHaveLength(0);
  }
});
test('fixture seeds repository data and repeatable logger/keypad/rest/summary states', () => {
  const store=new WorkoutStore(memoryRepository()),context={isDev:true,demo:true,signedIn:false};
  const fixture=createLoggerFixture(store,context,'logger')!;
  expect(store.active()?.data.name).toBe('Push Day A');
  expect(store.entries(fixture.sessionId).map(e=>store.drafts(e.id).length)).toEqual([3,3,4,3]);
  expect(store.drafts(fixture.benchId).filter(d=>d.setId)).toHaveLength(2);
  expect(store.previous(store.repo.get('entries',fixture.benchId)!)[2].data.reps).toBe(7);
  expect(store.repo.localGet('loggerFixtureOffline')).toBe(true);
  const rest=createLoggerFixture(store,context,'rest')!;
  expect(store.timer()).toMatchObject({entryId:rest.benchId,duration:90,minimized:false});
  expect(store.timer()!.endAt-Date.now()).toBeLessThanOrEqual(65000);
  expect(store.drafts(rest.benchId)[2].setId).toBeTruthy();
  const summary=createLoggerFixture(store,context,'summary')!;
  expect(store.summary(summary.sessionId).prs).toHaveLength(1);
  expect(store.milestones()).toHaveLength(7);
  expect(store.summary(summary.sessionId).count).toBe(13);
});

test('rest keeps two visible controls and supports VoiceOver timer actions', async () => {
  const store=new WorkoutStore(memoryRepository());
  createLoggerFixture(store,{isDev:true,demo:true,signedIn:false},'rest');
  await render(<RestTimer store={store}/>,{wrapper});
  expect(screen.getByRole('button',{name:'+15 s'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Skip'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'−15 s'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Minimize rest timer'})).toBeNull();
  const handle=screen.getByTestId('rest-sheet-handle');
  expect(handle.props.accessibilityActions.map((a:{name:string})=>a.name)).toEqual(['escape','decrement','skip','minimize']);
  const before=store.timer()!.duration;
  await act(()=>handle.props.onAccessibilityAction({nativeEvent:{actionName:'decrement'}}));
  expect(store.timer()!.duration).toBe(before-15);
  await act(()=>screen.getByTestId('rest-sheet-handle').props.onAccessibilityAction({nativeEvent:{actionName:'escape'}}));
  expect(store.timer()!.minimized).toBe(true);
});
test('picker close removes descendants and immediately reopens with fresh results',async()=>{
 activeRepository(memoryRepository());await render(<ActiveWorkout/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Add exercise'}));
 expect(screen.getByTestId('workout-sheet-host')).toHaveProp('animationType','none');
 await fireEvent.changeText(screen.getByTestId('exercise-picker-search'),'Synthetic custom');
 await fireEvent.scroll(screen.getByTestId('exercise-picker-results'),{nativeEvent:{contentOffset:{x:0,y:300}}});
 await fireEvent.press(screen.getByRole('button',{name:'Close'}));
 expect(screen.queryByRole('button',{name:'Close',includeHiddenElements:true})).toBeNull();
 expect(screen.queryByTestId('exercise-picker-results',{includeHiddenElements:true})).toBeNull();
 await fireEvent.press(screen.getByRole('button',{name:'Add exercise'}));
 expect(screen.getByTestId('exercise-picker-search')).toHaveProp('value','');
 expect(screen.getByTestId('exercise-picker-result-0')).toBeTruthy();
});

test('release fixture is inert even if called with a forged development context',()=>{
 const store=new WorkoutStore(memoryRepository());
 const original=__DEV__;
 try {
  Object.defineProperty(globalThis,'__DEV__',{value:false,configurable:true,writable:true});
  expect(createLoggerFixture(store,{isDev:true,demo:true,signedIn:false},'summary')).toBeNull();
  expect(store.repo.list('sessions')).toHaveLength(0);
 } finally {Object.defineProperty(globalThis,'__DEV__',{value:original,configurable:true,writable:true});}
});

test('seven-token shelf includes and highlights this session rather than dropping the newest token',async()=>{
 const store=new WorkoutStore(memoryRepository());
 const fixture=createLoggerFixture(store,{isDev:true,demo:true,signedIn:false},'summary')!;
 await render(<WorkoutSummary store={store} id={fixture.sessionId}/>,{wrapper});
 expect(screen.getByText('7 tokens ›')).toBeTruthy();
 expect(screen.getByTestId('summit-token-new')).toBeTruthy();
});

test('keypad uses the singular rep unit for one rep',async()=>{
 await render(<ExistingValueKeypad field="reps" initial="1"/>,{wrapper});
 expect(screen.getByText('1 Rep')).toBeTruthy();
});


test('logger pins its chrome below the safe area while only exercises scroll', async () => {
 const repo=memoryRepository();
 createLoggerFixture(new WorkoutStore(repo),{isDev:true,demo:true,signedIn:false},'logger');
 activeRepository(repo);
 await render(<SafeAreaInsetsContext.Provider value={{top:62,bottom:34,left:0,right:0}}><ActiveWorkout/></SafeAreaInsetsContext.Provider>,{wrapper});
 expect(screen.getByTestId('logger-safe-area')).toHaveStyle({paddingTop:62});
 const header=screen.getByTestId('logger-header');
 expect(header).toHaveStyle({flexShrink:0});
 expect(within(header).getByText('Push Day A')).toBeTruthy();
 expect(within(header).getByRole('progressbar')).toBeTruthy();
 const list=screen.getByTestId('logger-exercises');
 expect(list).toHaveStyle({flex:1});
 expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
 expect(within(list).queryByText('Push Day A')).toBeNull();
 await fireEvent.scroll(list,{nativeEvent:{contentOffset:{x:0,y:200}}});
 expect(header).toHaveStyle({flexShrink:0});
});

test.each([65,60,15,5,0])('unwind at %s seconds closes full rings and winds only the outer track',async(seconds)=>{
 await render(<RestContours seconds={seconds} duration={90} style="unwind"/>,{wrapper});
 const rings=screen.getByTestId('rest-contours').queryAll(n=>n.type==='RNSVGPath');
 const full=rings.slice(1).filter(n=>!n.props.strokeDasharray);
 expect(full).toHaveLength(Math.floor(seconds/15));
 for(const ring of full) expect(ring.props.d).toMatch(/Z$/);
 const outer=rings.find(n=>n.props.strokeWidth===2.6);
 if(seconds%15){
  expect(outer).toBeTruthy();
  const dash=outer!.props.strokeDasharray.map(Number);
  expect(dash[0]/dash[1]).toBeCloseTo((seconds%15)/15,4);
  expect(outer!.props.d).toBe(rings[0].props.d);
 } else expect(outer).toBeUndefined();
});


test('picker scrolls results to the top without animation when search changes', async () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  try {
    activeRepository(memoryRepository());
    await render(<ActiveWorkout />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
    await fireEvent.scroll(screen.getByTestId('exercise-picker-results'), { nativeEvent: { contentOffset: { x: 0, y: 300 } } });
    scroll.mockClear();
    await fireEvent.changeText(screen.getByTestId('exercise-picker-search'), 'Bench');
    expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: false });
    expect(screen.getByTestId('exercise-picker-result-0')).toBeTruthy();
  } finally { scroll.mockRestore(); }
});

test.each([false, true])('PR buzz respects haptics disabled with Reduce Motion %s', async reduceMotion => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  jest.mocked(signatureBuzz).mockClear();
  const store = new WorkoutStore(memoryRepository());
  const fixture = createLoggerFixture(store, { isDev: true, demo: true, signedIn: false }, 'summary')!;
  store.repo.localSave('haptics', false);
  await render(<WorkoutSummary store={store} id={fixture.sessionId} />, { wrapper });
  expect(signatureBuzz).not.toHaveBeenCalled();
});

test('M2-06 clearable tag picker updates a draft set accessibly', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), s = store.start(), e = store.addExercise(s.id, 'Bench Press');
  activeRepository(repo); await render(<ActiveWorkout />, {wrapper});
  await fireEvent.press(screen.getByRole('button', {name: 'Bench Press, Set 1, Set tag'}));
  await fireEvent.press(screen.getByRole('button', {name: 'Warm-up'}));
  expect(store.drafts(e.id)[0].tag).toBe('warmup');
  await fireEvent.press(screen.getByRole('button', {name: 'Bench Press, Set 1, Set tag, Warm-up'}));
  await fireEvent.press(screen.getByRole('button', {name: 'Clear tag'}));
  expect(store.drafts(e.id)[0].tag).toBeNull();
});
test('M2-06 unilateral entry, per-exercise rest, skip and replace controls', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), s = store.start(), e = store.addExercise(s.id, 'Bench Press');
  activeRepository(repo); await render(<ActiveWorkout />, {wrapper});
  await fireEvent.press(screen.getByRole('button', {name: 'Bench Press, Exercise options'}));
  await fireEvent.press(screen.getByRole('button', {name: 'Log left and right separately'}));
  expect(screen.getByRole('button', {name: 'Bench Press, Set 1, Right, Weight, blank'})).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', {name: '120 seconds'}));
  await fireEvent.press(screen.getByRole('button', {name: 'Converge'}));
  expect(store.rest('Bench Press')).toEqual({seconds:120,style:'converge'});
  await fireEvent.press(screen.getByRole('button', {name: 'Skip exercise'}));
  expect(store.skipped(e.id)).toBe(true);
  expect(screen.queryByTestId('set-0-0-done')).toBeNull();
  await fireEvent.press(screen.getByRole('button', {name: 'Replace exercise'}));
  await fireEvent.changeText(screen.getByTestId('exercise-picker-search'), 'Dumbbell Row');
  await fireEvent.press(screen.getByTestId('exercise-picker-result-0'));
  expect(store.entries(s.id).some(e => e.data.exercise === 'Dumbbell Row')).toBe(true);
});
test('M2-06 right-side keypad logs independently and requires both sides', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), e = store.addExercise(store.start().id,'Bench Press');
  store.setUnilateral(e.id,true); store.editDraft(e.id,0,{weight:'100',reps:'8'});
  activeRepository(repo); await render(<ActiveWorkout/>,{wrapper});
  await fireEvent.press(screen.getByRole('button',{name:'Bench Press, Set 1, Right, Weight, blank'}));
  await fireEvent.press(screen.getByRole('button',{name:'8'}));
  await fireEvent.press(screen.getByRole('button',{name:'0'}));
  await fireEvent.press(screen.getByRole('button',{name:'Next: Reps'}));
  await fireEvent.press(screen.getByRole('button',{name:'6'}));
  await fireEvent.press(screen.getByRole('button',{name:'Next: Set'}));
  await fireEvent(screen.getByTestId('workout-sheet-host'),'requestClose');
  await fireEvent.press(screen.getByTestId('set-0-0-right-done'));
  expect(store.drafts(e.id)[0]).toMatchObject({weight:'100',reps:'8',rightWeight:'80',rightReps:'6'});
  expect(store.working(e)[0].reps).toBe(6);
});
test.each([false,true])('M2-06 haptics switch writes only phone-local state, flag %s', async enabled => {
  const { WorkoutSettings } = require('../src/features/workout/settings') as typeof import('../src/features/workout/settings');
  const repo = memoryRepository(); Object.defineProperty(repo,'syncFlags',{value:{syncedV1Columns:enabled}});
  activeRepository(repo); const save = jest.spyOn(repo,'save');
  await render(<WorkoutSettings/>,{wrapper});
  await fireEvent.press(screen.getByRole('button',{name:'Disable workout haptics'}));
  expect(repo.localGet('haptics')).toBe(false);
  await fireEvent.press(screen.getByRole('button',{name:'Enable workout haptics'}));
  expect(repo.localGet('haptics')).toBe(true); expect(save).not.toHaveBeenCalled();
});

test('completed entries disable Skip exercise', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), e = store.addExercise(store.start().id, 'Bench Press');
  store.editDraft(e.id, 0, {weight: '100', reps: '8'}); store.toggleDone(e.id, 0); store.skipTimer();
  activeRepository(repo); await render(<ActiveWorkout />, {wrapper});
  await fireEvent.press(screen.getByRole('button', {name: 'Bench Press, Exercise options'}));
  expect(screen.getByRole('button', {name: 'Skip exercise'})).toBeDisabled();
});
test('keypad auto-advance skips skipped entries and closes when only skipped entries remain', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), session = store.start();
  const first = store.addExercise(session.id, 'Bench Press', 1);
  const skipped = store.addExercise(session.id, 'Squat', 1);
  const next = store.addExercise(session.id, 'Dumbbell Row', 1);
  const last = store.addExercise(session.id, 'Deadlift', 1);
  store.skipExercise(skipped.id); store.skipExercise(last.id);
  store.editDraft(first.id, 0, {weight: '100', reps: '8'});
  activeRepository(repo); await render(<ActiveWorkout />, {wrapper});
  await fireEvent.press(screen.getByRole('button', {name: 'Bench Press, Set 1, Reps, 8'}));
  await fireEvent.press(screen.getByTestId('keypad-next'));
  await fireEvent.press(screen.getByTestId('keypad-key-7'));
  expect(store.drafts(next.id)[0].weight).toBe('7');
  expect(store.drafts(skipped.id)[0].weight).toBe('');
  await fireEvent.press(screen.getByTestId('keypad-next'));
  await fireEvent.press(screen.getByTestId('keypad-next'));
  expect(screen.queryByTestId('keypad-sheet')).toBeNull();
});

test('template editor saves name/target edits without rest overrides, and only saves changed rest rows', async () => {
  const { TemplateEditor } = require('../src/features/workout/templates') as typeof import('../src/features/workout/templates');
  const { useLocalSearchParams } = require('expo-router');
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  Object.defineProperty(repo, 'syncFlags', {value: {syncedV1Columns: true}});
  const routine = store.saveTemplate('Synthetic routine', ['Bench Press', 'Dumbbell Row'].map(exercise => ({exercise, target_sets: 3, target_reps: 8})));
  useLocalSearchParams.mockReturnValue({id: routine.id});
  const save = jest.spyOn(repo, 'save');
  try {
    activeRepository(repo); await render(<TemplateEditor />, {wrapper});
    await fireEvent.changeText(screen.getByLabelText('Template name'), 'Renamed routine');
    await fireEvent.changeText(screen.getByLabelText('Bench Press Target sets'), '4');
    await fireEvent.press(screen.getByRole('button', {name: 'Save template'}));
    expect(save.mock.calls.filter(([table]) => table === 'settings')).toHaveLength(0);
    expect(repo.localGet('rest:bench press')).toBeUndefined();
    await fireEvent.press(screen.getAllByRole('button', {name: '120 seconds'})[1]);
    await fireEvent.press(screen.getByRole('button', {name: 'Save template'}));
    expect(save.mock.calls.filter(([table]) => table === 'settings')).toHaveLength(1);
    expect(JSON.parse(String(repo.list('settings')[0].data.rest_per_exercise))).toEqual({'dumbbell row': {seconds:120,style:'unwind'}});
    expect(repo.localGet('rest:bench press')).toBeUndefined();
  } finally { useLocalSearchParams.mockReturnValue({}); }
});

test('M2-07 live superset links partners and advances to the next exercise in the round', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo), session = store.start();
  const a = store.addExercise(session.id,'Bench Press',2), b = store.addExercise(session.id,'Dumbbell Row',1);
  store.editDraft(a.id,0,{weight:'100',reps:'8'});
  activeRepository(repo); await render(<ActiveWorkout/>,{wrapper});
  await fireEvent.press(screen.getByRole('button',{name:'Bench Press, Exercise options'}));
  await fireEvent.press(screen.getByRole('button',{name:'Link superset for Bench Press'}));
  await fireEvent.press(screen.getByRole('button',{name:'Include Dumbbell Row in superset'}));
  await fireEvent.press(screen.getByRole('button',{name:'Save superset'}));
  expect(store.supersetGroup(a)).toBe(store.supersetGroup(b));
  await fireEvent.press(screen.getByRole('button',{name:'Cancel'}));
  await fireEvent.press(screen.getByTestId('set-0-0-done'));
  expect(store.timer()).toBeNull();
  await fireEvent.press(screen.getByTestId('keypad-key-7'));
  expect(store.drafts(b.id)[0].weight).toBe('7');
  expect(store.drafts(a.id)[1].weight).toBe('');
});

test('M2-07 template range and superset controls save and reload', async () => {
  const { TemplateEditor } = require('../src/features/workout/templates') as typeof import('../src/features/workout/templates');
  const { useLocalSearchParams } = require('expo-router');
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const routine = store.saveTemplate('Synthetic supersets',['Bench Press','Dumbbell Row'].map(exercise => ({exercise,target_sets:2,target_reps:8})));
  useLocalSearchParams.mockReturnValue({id:routine.id});
  try {
    activeRepository(repo); const view = await render(<TemplateEditor/>,{wrapper});
    await fireEvent.changeText(screen.getByLabelText('Bench Press, Minimum reps'),'8');
    await fireEvent.changeText(screen.getByLabelText('Bench Press, Maximum reps'),'10');
    await fireEvent.press(screen.getByRole('button',{name:'Link superset for Bench Press'}));
    await fireEvent.press(screen.getByRole('button',{name:'Include Dumbbell Row in superset'}));
    await fireEvent.press(screen.getByRole('button',{name:'Save superset'}));
    await fireEvent.press(screen.getByRole('button',{name:'Save template'}));
    const rows = store.templateExercises(routine.id);
    expect(rows[0].data).toMatchObject({rep_min:8,rep_max:10});
    expect(rows[0].data.superset_group).toBe(rows[1].data.superset_group);
    await view.unmount(); await render(<TemplateEditor/>,{wrapper});
    expect(screen.getByLabelText('Bench Press, Minimum reps').props.value).toBe('8');
    await fireEvent.press(screen.getByRole('button',{name:'Unlink superset for Bench Press'}));
    await fireEvent.press(screen.getByRole('button',{name:'Clear rep range for Bench Press'}));
    await fireEvent.press(screen.getByRole('button',{name:'Save template'}));
    expect(store.templateExercises(routine.id)[0].data).toMatchObject({rep_min:null,rep_max:null,superset_group:null});
  } finally {useLocalSearchParams.mockReturnValue({});}
});

test('summary PR load, estimate and milestone shelf use the exercise unit', async () => {
  const store = new WorkoutStore(memoryRepository()), start = Date.now()-10000;
  store.preferences().saveMachine('Bench Press',{text:'',unit_override:'kg'});
  for (const [index,weight] of ['100','105'].entries()) {
    const session = store.start(undefined,start+index*2000), entry = store.addExercise(session.id,'Bench Press',1);
    store.editDraft(entry.id,0,{weight,reps:'8'}); store.toggleDone(entry.id,0);
    store.finish(session.id,{startedAt:start+index*2000,finishedAt:start+index*2000+1000,notes:''});
  }
  await render(<WorkoutSummary store={store} id={store.history()[0].id} />, {wrapper});
  expect(screen.getByText('Bench Press 105 × 8')).toBeTruthy();
  expect(screen.getByText(/≈ 133 kg/)).toBeTruthy();
  expect(screen.getByText('Bench Press summit, 105 × 8')).toBeTruthy();
});
