import { useWorkout } from '../src/features/workout/use-workout';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react-native';
import { AppState, AccessibilityInfo, Text } from 'react-native';
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
