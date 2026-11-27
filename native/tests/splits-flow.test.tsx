// Workout splits on Training (Insight Mockup v21): the first-time picker, a preset set up and used, the tracker at each
// size, the Change menu (swap, skip, freestyle, train today), and a split day loading its exercises into the logger.
// Made-up sample data only.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { ThemeProvider, useTheme } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { FRAMES } from '../src/features/tiles/geometry';
import type { TileRenderProps, TileSize } from '../src/features/tiles/types';
import { SplitStore } from '../src/features/splits/store';
import { SplitTile } from '../src/features/splits/tile';
import { SplitLibrarySheet, SplitNewSheet, SplitSetupSheet } from '../src/features/splits/sheets';
import { SplitScreen } from '../src/features/splits/screen';
import { SplitEditExtra } from '../src/features/splits/edit-extra';
import { splitMenu, startSplitDay, swapSheet } from '../src/features/splits/menu';
import { ExercisePickerSheet } from '../src/features/workout/sheets/picker';
import { actionSheet } from '../src/features/workout/action-sheet';
import { showToast } from '../src/features/shell/toast';
import { tilePage } from '../src/features/tiles/registry';
import { defaultLayout } from '../src/features/tiles/model';
import { PlanStore } from '../src/features/plans/store';
import { TrainingData } from '../src/features/workout/training-data';
import '../src/features/workout/tiles';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissAll: jest.fn(), canDismiss: () => true, canGoBack: () => true },
  useIsFocused: () => true, useLocalSearchParams: () => ({}), useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }),
}));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));
jest.mock('../src/features/workout/action-sheet', () => ({ actionSheet: jest.fn() }));
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const sheet = actionSheet as jest.Mock, toast = showToast as jest.Mock, push = router.push as jest.Mock;
/** The labels and actions of the last action sheet. */
const lastSheet = () => sheet.mock.calls.at(-1)![0] as { title: string; message?: string; actions: { label: string; run: () => void }[] };
const run = (label: string) => { const a = lastSheet().actions.find(x => x.label === label); if (!a) throw Error(`No ${label} in ${lastSheet().actions.map(x => x.label)}`); a.run(); };

function Tile({ size, preview = false }: { size: TileSize; preview?: boolean }) {
  const { colors, mode } = useTheme(), f = FRAMES[size];
  const p: TileRenderProps = { page: 'training', id: 'split', size, style: 'A', options: {}, frame: f, body: { w: f.w - 32, h: f.h - 32 },
    colors, tint: colors.training, mode, reduceMotion: true, editing: false, preview };
  return <SplitTile {...p} />;
}
const fresh = () => { mockRepository = memoryRepository(); return new SplitStore(mockRepository as never); };
/** Upper Lower, chosen through its setup sheet. */
async function chooseUpperLower() {
  const store = fresh();
  const view = await render(<SplitSetupSheet presetKey="ul" />, { wrapper });
  await fireEvent.press(screen.getByTestId('split-use'));
  await view.unmount();
  return store;
}
beforeEach(() => { jest.clearAllMocks(); jest.useRealTimers(); });

describe('the first-time picker', () => {
  test('the Split tile is first on Training and joins saved layouts once', () => {
    const cfg = tilePage('training');
    expect(defaultLayout(cfg)[0]).toMatchObject({ id: 'split', size: 'L' });
    expect(cfg.arrivals).toEqual([{ id: 'split', rev: 1, size: 'L' }]);
    expect(cfg.tiles.find(d => d.id === 'split')).toMatchObject({ head: false, sizes: ['S', 'M', 'L'], group: 'Today', icon: 'sp-split' });
  });
  test('at L it swipes through the six presets and Build your own; a card opens its setup', async () => {
    fresh();
    await render(<Tile size="L" />, { wrapper });
    expect(screen.getByText('Choose your split')).toBeTruthy();
    expect(screen.getByText('Swipe to find one that fits your week. You can change it anytime.')).toBeTruthy();
    // Full body is also its card's kind of day, so its name shows twice.
    for (const name of ['Push Pull Legs', 'Upper Lower', 'Full body', 'Arnold split', 'Bro split', 'PHUL', 'Build your own']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    // Each card: the kinds of day, its sessions a week as numbered pips (never weekdays), how often each muscle comes round.
    expect(screen.getByText('Push · Pull · Legs')).toBeTruthy();
    expect(screen.getAllByText('Each muscle 2× a week').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Monday|Mon\b/)).toBeNull();
    await fireEvent.press(screen.getByTestId('split-card-ul'));
    expect(push).toHaveBeenCalledWith({ pathname: '/training/split-setup', params: { key: 'ul' } });
    await fireEvent.press(screen.getByTestId('split-build-own'));
    expect(push).toHaveBeenLastCalledWith('/training/split-new');
  });
  test('at S and M it asks in a line and opens every split', async () => {
    fresh();
    for (const size of ['S', 'M'] as const) {
      const view = await render(<Tile size={size} />, { wrapper });
      await fireEvent.press(screen.getByRole('button', { name: 'Choose a split' }));
      expect(push).toHaveBeenLastCalledWith('/training/split-library');
      await view.unmount();
    }
  });
  test('the setup sheet: rotate by default, its days with their exercises, and Use makes it your split', async () => {
    fresh();
    await render(<SplitSetupSheet presetKey="ul" />, { wrapper });
    expect(screen.getByText('Upper body and lower body on alternating days, four a week.')).toBeTruthy();
    expect(screen.getByText('Train any day. Finishing a day moves the next one up. A skipped day waits for your next session.')).toBeTruthy();
    expect(screen.getByText(/^Bench Press, Barbell Row, Overhead Press/)).toBeTruthy();
    // Set weekdays shows the weekday buttons and each day's weekdays.
    await fireEvent.press(screen.getByText('Set weekdays'));
    expect(screen.getByText('4 days a week. Miss one and it waits for your next session.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('split-weekday-2'));
    expect(screen.getByText('5 days a week. Miss one and it waits for your next session.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Rotate in order'));
    await fireEvent.press(screen.getByTestId('split-use'));
    const v = new SplitStore(mockRepository as never).view()!;
    expect(v.def).toMatchObject({ key: 'ul', name: 'Upper Lower', mode: 'rotate', perWeek: 4 });
    expect(v.days.map(d => d.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(v.days[0].exercises.map(e => e.name).slice(0, 2)).toEqual(['Bench Press', 'Barbell Row']);
    expect(v.days[0].exercises[0]).toMatchObject({ sets: 4, repMin: 5, repMax: 8 });
    expect(router.dismissAll).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Upper Lower is your split. Upper A is up today.', expect.objectContaining({ color: 'training' }));
    // The plan store reads the same days, so Up next and This week name them too.
    expect(new PlanStore(mockRepository as never).read().days.map(d => d.routineId)).toEqual(v.days.map(d => d.routineId));
    expect(new TrainingData(mockRepository as never).plan().next?.name).toBe('Upper A');
  });
  test('Start with picks the first day', async () => {
    fresh();
    await render(<SplitSetupSheet presetKey="fb" />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Full body B' }));
    await fireEvent.press(screen.getByTestId('split-use'));
    const v = new SplitStore(mockRepository as never).view()!;
    expect(v.days[v.now.focus].name).toBe('Full body B');
  });
  test('Build your own: days, their muscles and suggested exercises', async () => {
    fresh();
    await render(<SplitNewSheet />, { wrapper });
    await fireEvent.changeText(screen.getByTestId('split-new-name'), 'My two days');
    await fireEvent.press(screen.getByTestId('split-new-days-less'));
    await fireEvent.changeText(screen.getByTestId('split-new-day-0'), 'Chest day');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Chest' })[0]);
    await fireEvent.press(screen.getByTestId('split-new-suggest'));
    expect(screen.getByText('Each day starts with suggestions you can change.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Create'));
    const v = new SplitStore(mockRepository as never).view()!;
    expect(v.def).toMatchObject({ key: 'custom', name: 'My two days', mode: 'rotate' });
    expect(v.days.map(d => [d.name, d.focus])).toEqual([['Chest day', ['Chest']], ['Day 2', []]]);
    expect(v.days[0].exercises.map(e => e.name)).toEqual(['Bench Press', 'Incline Dumbbell Press']);
    expect(v.days[1].exercises).toEqual([]);
  });
});

describe('the tracker', () => {
  test('L: the split, Up next front and centre with its muscles, Then, and this week as an ordered strip', async () => {
    await chooseUpperLower();
    await render(<Tile size="L" />, { wrapper });
    expect(screen.getByText('Upper Lower')).toBeTruthy();
    expect(screen.getByText('Rotate in order · 4 a week')).toBeTruthy();
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getAllByText('Upper A').length).toBeGreaterThan(0);
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getAllByText('Lower A').length).toBeGreaterThan(0);
    expect(screen.getByText(/^Then /)).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('0 of 4 sessions')).toBeTruthy();
    expect(screen.getByLabelText('0 of 4 this week')).toBeTruthy();
    // Rotate in order never names a weekday.
    expect(screen.queryByText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/)).toBeNull();
    // Start loads the day's exercises into the logger, and the tile follows the workout going now.
    await fireEvent.press(screen.getByRole('button', { name: 'Start Upper A' }));
    expect(push).toHaveBeenLastCalledWith('/workout');
    expect(screen.getByText('In progress')).toBeTruthy();
  });
  test('M and S: the day and numbered circles; S has the Change glyph alone', async () => {
    await chooseUpperLower();
    let view = await render(<Tile size="M" />, { wrapper });
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getByText('Chest · Back · Shoulders · Biceps · Triceps')).toBeTruthy();
    expect(screen.getByText('Change')).toBeTruthy();
    for (const n of ['1', '2', '3', '4']) expect(screen.getByText(n)).toBeTruthy();
    expect(screen.queryByText(/^Then /)).toBeNull();
    await view.unmount();
    view = await render(<Tile size="S" />, { wrapper });
    expect(screen.getByText('Upper A')).toBeTruthy();
    expect(screen.queryByText('Change')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change today or your split' })).toBeTruthy();
    await view.unmount();
  });
  test('Set weekdays: Monday to Sunday with today marked', async () => {
    const store = await chooseUpperLower();
    store.setMode('weekdays');
    await render(<Tile size="L" />, { wrapper });
    expect(screen.getByText(/^Set weekdays · 4 a week$/)).toBeTruthy();
    expect(screen.getByText('0 of 4 split days done')).toBeTruthy();
    for (const l of ['M', 'T', 'W', 'F', 'S']) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
  });
});

describe('the Change menu', () => {
  test('a planned day: swap, skip, freestyle, edit and change split', async () => {
    const store = await chooseUpperLower();
    splitMenu(mockRepository as never, true);
    expect(lastSheet()).toMatchObject({ title: 'Upper Lower', message: 'Upper A today · 6 exercises' });
    expect(lastSheet().actions.map(a => a.label)).toEqual(['Swap for another day', 'Skip Upper A, do it next time', 'Freestyle instead', 'Edit Upper Lower', 'Change split']);
    // Skip: the day waits and is the next session.
    run('Skip Upper A, do it next time');
    expect(toast).toHaveBeenLastCalledWith('Upper A waits for tomorrow', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
    let v = store.view()!;
    expect(v.now).toMatchObject({ kind: 'skipped', focus: 0 });
    // Skipped: Train today puts it back on, Change next day and Freestyle today stay offered.
    splitMenu(mockRepository as never, true);
    expect(lastSheet().actions.map(a => a.label)).toEqual(['Train today: Upper A', 'Change next day', 'Freestyle today', 'Edit Upper Lower', 'Change split']);
    run('Train today: Upper A');
    expect(toast).toHaveBeenLastCalledWith('Upper A is on for today', expect.anything());
    v = store.view()!;
    expect(v.now).toMatchObject({ kind: 'planned', focus: 0 });
  });
  test('Undo puts a skip back', async () => {
    const store = await chooseUpperLower();
    splitMenu(mockRepository as never, true);
    run('Skip Upper A, do it next time');
    const undo = toast.mock.calls.at(-1)![1].action.onAction as () => void;
    undo();
    expect(store.view()!.now).toMatchObject({ kind: 'planned', focus: 0 });
  });
  test('Swap: another day today, the day it replaces comes next', async () => {
    jest.useFakeTimers();
    const store = await chooseUpperLower();
    swapSheet(mockRepository as never, false, true);
    jest.runAllTimers();
    expect(lastSheet()).toMatchObject({ title: 'Today', message: 'Do this today instead of Upper A. Upper A waits and comes after it.' });
    expect(lastSheet().actions.map(a => a.label)).toEqual(['Lower A', 'Upper B', 'Lower B']);
    run('Upper B');
    expect(toast).toHaveBeenLastCalledWith('Upper B today. Upper A waits.', expect.anything());
    const v = store.view()!;
    expect(v.days[v.now.focus].name).toBe('Upper B');
    expect(v.days[v.now.then[0]].name).toBe('Upper A');
  });
  test('Freestyle starts an empty workout that never moves the split', async () => {
    const store = await chooseUpperLower();
    splitMenu(mockRepository as never, true);
    run('Freestyle instead');
    const w = new WorkoutStore(mockRepository as never), live = w.active()!;
    expect(live.data.routine_id ?? null).toBeNull();
    expect(w.entries(live.id)).toHaveLength(0);
    expect(store.view()!.now).toMatchObject({ kind: 'live', focus: -1 });
    mockRepository.save('sessions', { ...live.data, finished_at: Date.now() }, live.id);
    expect(store.view()!.now).toMatchObject({ kind: 'planned', focus: 0 });
  });
  test('a split day loads its exercises, and finishing it moves the split on', async () => {
    const store = await chooseUpperLower();
    const v = store.view()!, day = v.days[0];
    const session = startSplitDay(mockRepository as never, day.routineId)!;
    const w = new WorkoutStore(mockRepository as never);
    expect(w.entries(session.id).map(e => String(e.data.exercise))).toEqual(day.exercises.map(e => e.name));
    splitMenu(mockRepository as never, true);
    expect(lastSheet().actions.map(a => a.label)).toEqual(['Resume Upper A', 'Change next day (Lower A)', 'Edit Upper Lower', 'Change split']);
    mockRepository.save('sessions', { ...w.active()!.data, finished_at: Date.now() }, session.id);
    const after = store.view()!;
    expect(after.now).toMatchObject({ kind: 'done' });
    expect(after.days[after.now.focus].name).toBe('Lower A');
    expect(after.week.done).toBe(1);
  });
});

describe('the Split screen, the library and the customize sheet', () => {
  test('the screen: today, schedule, days and weekly sets per muscle', async () => {
    await chooseUpperLower();
    await render(<SplitScreen />, { wrapper });
    expect(screen.getByText('4 days · Rotate in order · 4 a week')).toBeTruthy();
    expect(screen.getByText('6 exercises · 18 sets · about 55 min')).toBeTruthy();
    expect(screen.getByText('Skip a day and it waits: it is your next session, tomorrow or whenever you train next.')).toBeTruthy();
    expect(screen.getByText('Weekly sets per muscle')).toBeTruthy();
    expect(screen.getByText('Aim for 10 to 20')).toBeTruthy();
    // Rotate in order names no weekday anywhere on the screen.
    expect(screen.queryByText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/)).toBeNull();
    await fireEvent.press(screen.getByTestId('split-skip'));
    expect(screen.getByText('Skipped · waits for your next session')).toBeTruthy();
    // Set weekdays lists Monday to Sunday with each one's day.
    await fireEvent.press(screen.getByText('Set weekdays'));
    expect(screen.getByText('Monday')).toBeTruthy();
    expect(screen.getByText('Each day has its weekday. Miss one and it waits for your next session, then the week carries on.')).toBeTruthy();
  });
  test('Undo of a removed exercise keeps every exercise of the day as it was, one side at a time included', async () => {
    const store = await chooseUpperLower();
    const routine = store.view()!.days[0].routineId, rows = () => store.workout.templateExercises(routine);
    const ids = rows().map(r => r.id), one = rows().find(r => r.data.exercise !== 'Bench Press')!;
    store.workout.repo.localSave(`routineUnilateral:${one.id}`, true);
    await render(<SplitScreen />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Bench press' }));
    await act(() => (toast.mock.calls.at(-1)![1].action.onAction as () => void)());
    expect(rows().map(r => r.id)).toEqual(ids);
    expect(store.workout.repo.localGet(`routineUnilateral:${one.id}`)).toBe(true);
  });
  test("editing a day's exercises: remove one, change its sets, add from the bank with muscle and equipment filters", async () => {
    const store = await chooseUpperLower();
    const routine = store.view()!.days[0].routineId;
    let view = await render(<SplitScreen />, { wrapper });
    // The first day is open: its exercises with sets and reps.
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Bench press' }));
    expect(store.view()!.days[0].exercises.map(e => e.name)).not.toContain('Bench Press');
    expect(toast).toHaveBeenLastCalledWith('Bench press removed', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
    await fireEvent.press(screen.getByTestId('split-add-exercise-0'));
    expect(push).toHaveBeenLastCalledWith({ pathname: '/training/picker', params: { mode: 'routine', routine } });
    await view.unmount();
    // The picker browses the whole bank: Chest and Cable together narrow it to cable chest work.
    view = await render(<ExercisePickerSheet mode="routine" routine={routine} />, { wrapper });
    expect(screen.getByText(/^All [\d,]+ exercises$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Chest' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cable' }));
    const rows = screen.getAllByRole('button', { name: /, Chest, Cable$/ });
    expect(rows.length).toBeGreaterThan(0);
    await fireEvent.press(rows[0]);
    await fireEvent.press(screen.getByText('Add (1)'));
    await view.unmount();
    const day = store.view()!.days[0];
    expect(day.exercises).toHaveLength(6);
    expect(day.exercises.at(-1)).toMatchObject({ sets: 3, repMin: 8, repMax: 12 });
    // The weekly sets follow the day's exercises.
    expect(store.view()!.coverage.find(c => c.m === 'Chest')!.sets).toBeGreaterThan(0);
  });
  test('weekly sets per muscle: main muscle a full set, helpers half, over the week', async () => {
    const store = await chooseUpperLower();
    const v = store.view()!, sets = (m: string) => v.coverage.find(c => c.m === m)!;
    // Upper Lower, 4 a week over 4 days: each day once a week. Chest is Bench Press 4 + Incline Dumbbell Press 4.
    expect(sets('Chest').sets).toBeGreaterThanOrEqual(8);
    expect(sets('Chest').times).toBe(2);
    await render(<SplitScreen />, { wrapper });
    expect(screen.getByLabelText(`Chest: ${sets('Chest').sets} sets a week, 2×`)).toBeTruthy();
    store.setPerWeek(2);
    expect(store.view()!.coverage.find(c => c.m === 'Chest')!.sets).toBeLessThan(sets('Chest').sets);
  });
  test('the screen before a split is chosen offers the library', async () => {
    fresh();
    await render(<SplitScreen />, { wrapper });
    expect(screen.getByText('No split yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a split' }));
    expect(push).toHaveBeenLastCalledWith('/training/split-library');
  });
  test('the library marks the current split; changing it keeps Undo', async () => {
    await chooseUpperLower();
    await render(<SplitLibrarySheet />, { wrapper });
    expect(screen.getByText('Change split')).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Changing split keeps every workout you have logged. Days you leave behind stay in your history.')).toBeTruthy();
  });
  test('choosing a second split offers Undo, which brings the first back', async () => {
    const store = await chooseUpperLower();
    const view = await render(<SplitSetupSheet presetKey="fb" />, { wrapper });
    await fireEvent.press(screen.getByTestId('split-use'));
    await view.unmount();
    expect(store.view()!.def.name).toBe('Full body');
    const undo = toast.mock.calls.at(-1)![1].action.onAction as () => void;
    undo();
    expect(store.view()!.def.name).toBe('Upper Lower');
    expect(new WorkoutStore(mockRepository as never).templates().map(r => String(r.data.name))).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  });
  test('the customize sheet holds Your split with Change split and Edit days', async () => {
    jest.useFakeTimers();
    await chooseUpperLower();
    const close = jest.fn();
    await render(<SplitEditExtra close={close} />, { wrapper });
    expect(screen.getByText('4 days · Rotate in order · 4 a week')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit days' }));
    expect(close).toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(push).toHaveBeenLastCalledWith('/training/plan');
  });
});
