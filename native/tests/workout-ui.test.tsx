import { useWorkout } from '../src/features/workout/use-workout';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react-native';
import { AppState, AccessibilityInfo, Text, DeviceEventEmitter, Alert } from 'react-native';
import { restBuzz, signatureBuzz } from '../src/features/workout/haptics';
import { useState, useMemo } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { SyncBadge } from '../src/features/workout/badge';
import { Keypad } from '../src/features/workout/keypad';
import { SetRow } from '../src/features/workout/set-row';
import { RestTimer } from '../src/features/workout/timer';
import { WorkoutSummary } from '../src/features/workout/summary';
import { WorkoutStore } from '../src/data/workout/store';
import { parseLocalDateTime } from '../src/features/workout/finish';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { ActiveWorkout } from '../src/features/workout/active';
import { useAuth } from '../src/auth/provider';
import { clock } from '../src/features/workout/primitives';
import { displayWeight, rounded, nextField } from '../src/core/workout/rules';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { canDismiss: () => false, replace: jest.fn() } }));
jest.mock('../src/features/workout/haptics', () => ({
  tick: jest.fn(),
  restBuzz: jest.fn(),
  signatureBuzz: jest.fn(() => jest.fn())
}));
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn()
}));
function memoryRepository() {
  const rows: Row[] = [],
    local = new Map<string, unknown>();
  let sequence = 0, revision = 0;
  const listeners = new Set<() => void>();
  const notify = () => { revision++; listeners.forEach(f => f()); };
  return {
    owner: 'demo',
    getRevision: () => revision,
    subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
    list: (table: string) => rows.filter(r => r.table === table && r.deleted_at === null),
    get: (table: string, id: string) => rows.find(r => r.table === table && r.id === id),
    atomic: (f: () => unknown) => f(),
    localGet: (key: string) => local.get(key),
    localSave: (key: string, value: unknown) => { local.set(key, value); notify(); },
    save: (table: Row['table'], data: Row['data'], id = String(++sequence)) => {
      let row = rows.find(r => r.table === table && r.id === id);
      if (row) {
        row.data = data;
        row.deleted_at = null;
      } else {
        row = {
          id,
          table,
          data,
          deleted_at: null,
          updated_at: Date.now(),
          owner_id: 'demo',
          device_id: 'synthetic'
        };
        rows.push(row);
      }
      notify();
      return row;
    },
    remove: (table: string, id: string) => {
      const row = rows.find(r => r.table === table && r.id === id);
      if (row) row.deleted_at = Date.now();
      notify();
    }
  } as unknown as Repository;
}
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
  expect(screen.getByText(/Plates per side/)).toHaveTextContent(/45 \+ 25 \+ 2.5/);
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
  await fireEvent.press(screen.getByRole('button', {
    name: 'Minimize rest timer'
  }));
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
test('summary waits for motion preference and runs the PR signature only once across remount', async () => {
  const preference = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
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
  expect(screen.getByText(/Plates per side/)).toHaveTextContent(/45 × 3 \+ 10 \+ 2.5/);
  expect(screen.getByText(/Plates per side/)).toHaveProp('numberOfLines', 1);
  await view.rerender(<Keypad {...props} value="135135" />);
  expect(screen.queryByText(/Plates per side/)).toBeNull();
});
test.each([false, true])('workout header only shows an eyebrow for templates: %s', async template => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const routine = template ? store.saveTemplate('Synthetic Push', []) : undefined;
  store.start(routine?.id);
  activeRepository(repo);
  await render(<ActiveWorkout />, { wrapper });
  if (template) expect(screen.getByText('TEMPLATE')).toBeTruthy();
  else expect(screen.getAllByText('Workout')).toHaveLength(1);
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


test('exercise options can cancel and reopen, then add a set', async () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const entry = store.addExercise(store.start().id, 'Close-Grip Bench Press');
  activeRepository(repo);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ActiveWorkout />, { wrapper });
  const open = () => fireEvent.press(screen.getByRole('button', { name: 'Close-Grip Bench Press, Exercise options' }));
  await open();
  await act(() => { alert.mock.calls.at(-1)![2]!.find(b => b.style === 'cancel')?.onPress?.(); });
  await open();
  await act(() => { alert.mock.calls.at(-1)![2]!.find(b => b.text === 'Add set')!.onPress!(); });
  expect(store.drafts(entry.id)).toHaveLength(4);
  alert.mockRestore();
});
