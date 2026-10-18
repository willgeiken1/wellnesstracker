import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, AccessibilityInfo, Text } from 'react-native';
import { restBuzz, signatureBuzz } from '../src/features/workout/haptics';
import { useState } from 'react';
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
import { nextField } from '../src/core/workout/rules';
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
  let sequence = 0;
  return {
    owner: 'demo',
    list: (table: string) => rows.filter(r => r.table === table && r.deleted_at === null),
    get: (table: string, id: string) => rows.find(r => r.table === table && r.id === id),
    atomic: (f: () => unknown) => f(),
    localGet: (key: string) => local.get(key),
    localSave: (key: string, value: unknown) => local.set(key, value),
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
      return row;
    },
    remove: (table: string, id: string) => {
      const row = rows.find(r => r.table === table && r.id === id);
      if (row) row.deleted_at = Date.now();
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
