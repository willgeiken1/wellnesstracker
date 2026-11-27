import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ActionSheetIOS } from 'react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { TrainingData } from '../src/features/workout/training-data';
import { exerciseHistory, sessionResult, fullDate } from '../src/features/workout/screens/model';
import { WorkoutSummary } from '../src/features/workout/screens/summary';
import { WorkoutDetail, templateFrom } from '../src/features/workout/screens/detail';
import { showToast } from '../src/features/shell/toast';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
let mockParams: Record<string, string> = {};
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useIsFocused: () => true, useLocalSearchParams: () => mockParams }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const DAY = 86_400_000;

/** Made-up sample: squat 225 × 5 a week ago, then today squat 235 × 5 twice (a record), a warm-up, and lunges. */
function sample() {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  const log = (start: number, rows: [string, [string, string, boolean?][]][]) => {
    const s = store.start(undefined, start);
    for (const [name, sets] of rows) {
      const e = store.addExercise(s.id, name, sets.length);
      sets.forEach(([weight, reps, warm], i) => { store.editDraft(e.id, i, { weight, reps, ...(warm ? { tag: 'warmup' as const } : {}) }); store.toggleDone(e.id, i); });
    }
    store.finish(s.id, { startedAt: start, finishedAt: start + 45 * 60_000, notes: '' });
    return s;
  };
  log(Date.now() - 7 * DAY, [['Squat', [['225', '5'], ['225', '5']]]]);
  const today = log(Date.now() - 2 * 3_600_000, [['Squat', [['135', '5', true], ['235', '5'], ['235', '5']]], ['Dumbbell Walking Lunge', [['40', '10'], ['40', '10']]]]);
  return { store, today };
}
beforeEach(() => { jest.clearAllMocks(); mockParams = {}; });

describe('session result', () => {
  test('counts working sets and volume, finds the record against the best before, and sums muscles', () => {
    const { today } = sample();
    const res = sessionResult(new TrainingData(mockRepository), today.id)!;
    expect([res.min, res.sets, res.volume]).toEqual([45, 4, 235 * 5 * 2 + 40 * 10 * 2]);
    expect(res.prs).toEqual([{ name: 'Squat', w: 235, r: 5, was: { w: 225, r: 5 } }]);
    expect(res.exercises[0]).toMatchObject({ warm: 1, top: { w: 235, r: 5 } });
    expect(res.exercises[0].sets.map(s => s.pr)).toEqual([true, false]);
    expect(res.muscles[0]).toEqual({ m: 'Quads', sets: 4 });
    expect(res.after - res.before).toBe(45);
    expect(fullDate('2026-11-22')).toBe('Sunday, November 22');
  });
  test('a one-side-at-a-time lift counts both sides in the volume, and keeps the weaker side for its sets', () => {
    mockRepository = memoryRepository();
    const repo = mockRepository;
    const s = repo.save('sessions', { day: '2026-11-20', name: 'Synthetic legs', started_at: Date.now() - 3_600_000, finished_at: Date.now() });
    const e = repo.save('entries', { session_id: s.id, exercise: 'Bulgarian Split Squat', position: 0 });
    repo.save('sets', { entry_id: e.id, position: 0, weight_kg: 20, reps: 10, left_weight_kg: 20, left_reps: 10, right_weight_kg: 20, right_reps: 10 });
    const data = new TrainingData(mockRepository), res = sessionResult(data, s.id)!;
    const side = data.kg(20) * 10;
    expect(res.exercises[0].sets).toEqual([{ w: data.kg(20), r: 10, pr: false }]);
    expect(res.exercises[0].volume).toBe(side * 2);
    expect(res.volume).toBe(side * 2);
    expect(exerciseHistory(data, 'Bulgarian Split Squat').at(-1)!.volume).toBe(side * 2);
  });
  test('a first time doing a lift is not a record, and an unfinished workout has no result', () => {
    const { store } = sample();
    const data = new TrainingData(mockRepository);
    const first = data.history().at(-1)!;
    expect(sessionResult(data, first.id)!.prs).toEqual([]);
    const live = store.start();
    expect(sessionResult(new TrainingData(mockRepository), live.id)).toBeNull();
  });
});

describe('workout summary screen', () => {
  test('shows the numbers, the record and the goal, with no written recap, and saves the note on Done', async () => {
    const { today } = sample();
    mockParams = { id: today.id, just: '1' };
    await render(<WorkoutSummary />, { wrapper });
    expect(screen.getByText('Workout complete')).toBeTruthy();
    expect(screen.getByText('Personal records')).toBeTruthy();
    expect(screen.getByText('235 lb × 5')).toBeTruthy();
    expect(screen.getByText('Previous best 225 lb × 5')).toBeTruthy();
    expect(screen.getByText('Muscles worked')).toBeTruthy();
    expect(screen.queryByText(/\bAI\b/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Workout notes'), '  Felt strong  ');
    await fireEvent.press(screen.getByTestId('summary-done'));
    expect(mockRepository.get('sessions', today.id)?.data.notes).toBe('Felt strong');
    expect(router.back).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Saved to History', expect.anything());
  });
  test('a workout that is gone says so', async () => {
    sample();
    mockParams = { id: 'nope' };
    await render(<WorkoutSummary />, { wrapper });
    expect(screen.getByText('Workout not found')).toBeTruthy();
  });
});

describe('past workout screen', () => {
  test('lists each exercise with its sets and the PR mark, and Edit opens it in the logger', async () => {
    const { today } = sample();
    mockParams = { id: today.id };
    await render(<WorkoutDetail />, { wrapper });
    expect(screen.getByText('New personal record')).toBeTruthy();
    expect(screen.getByText('2 exercises')).toBeTruthy();
    expect(screen.getByLabelText('Set 1, 235 lb × 5, personal record')).toBeTruthy();
    expect(screen.getByLabelText('Set 2, 235 lb × 5')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout', params: { id: today.id } });
  });
  test('save as a template keeps the exercises and set counts; delete asks first and removes it', async () => {
    const { store, today } = sample();
    expect(templateFrom(store, today.id)).toEqual([
      { id: undefined, exercise: 'Squat', target_sets: 2, target_reps: 5, rep_min: undefined, rep_max: undefined },
      { id: undefined, exercise: 'Dumbbell Walking Lunge', target_sets: 2, target_reps: 10, rep_min: undefined, rep_max: undefined }]);
    mockParams = { id: today.id };
    await render(<WorkoutDetail />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Save as template' }));
    expect(showToast).toHaveBeenLastCalledWith('Saved as a template', expect.anything());
    expect(store.templates()).toHaveLength(1);
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_o, cb) => cb(0));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(sheet).toHaveBeenCalled();
    expect(mockRepository.get('sessions', today.id)?.deleted_at).not.toBeNull();
    expect(showToast).toHaveBeenCalledWith('Workout deleted');
  });
});
