import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ActionSheetIOS } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { TrainingData } from '../src/features/workout/training-data';
import { axisLabel, chartScale, exerciseHistory } from '../src/features/workout/screens/model';
import { ExerciseDetail } from '../src/features/workout/screens/exercise';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
let mockParams: Record<string, string> = {};
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useIsFocused: () => true, useLocalSearchParams: () => mockParams }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const DAY = 86_400_000;

/** Made-up sample: three squat days, 225 × 5, 235 × 5 and 245 × 3. */
function sample() {
  mockRepository = memoryRepository();
  const store = new WorkoutStore(mockRepository);
  [[225, 5], [235, 5], [245, 3]].forEach(([w, r], i) => {
    const start = Date.now() - (3 - i) * 7 * DAY, s = store.start(undefined, start), e = store.addExercise(s.id, 'Squat', 2);
    for (const j of [0, 1]) { store.editDraft(e.id, j, { weight: String(w - j * 10), reps: String(r) }); store.toggleDone(e.id, j); }
    store.finish(s.id, { startedAt: start, finishedAt: start + 3_000_000, notes: '' });
  });
  return store;
}
beforeEach(() => { mockParams = {}; });

test('history gives each session its heaviest set, best estimate and volume, oldest first', () => {
  sample();
  const h = exerciseHistory(new TrainingData(mockRepository), 'Squat');
  expect(h.map(x => x.top)).toEqual([{ w: 225, r: 5 }, { w: 235, r: 5 }, { w: 245, r: 3 }]);
  expect(h[1].est).toBeCloseTo(235 * (1 + 5 / 30));
  expect(h[0].volume).toBe(225 * 5 + 215 * 5);
  expect(exerciseHistory(new TrainingData(mockRepository), 'Back squat')).toHaveLength(3); // older logs call it Squat
});

test('the chart scale pads the range and puts gridlines on round steps', () => {
  const s = chartScale([225, 245, 262, 286], false);
  expect(s.step).toBe(25);
  expect(s.lines.every(g => g % 25 === 0 && g >= s.lo && g <= s.hi)).toBe(true);
  expect(chartScale([0, 3675], true).lo).toBe(0);
  expect([axisLabel(250), axisLabel(2500)]).toEqual(['250', '2.5k']);
});

test('the screen shows the estimate, best sets and every session, and Edit sets the rest', async () => {
  const store = sample();
  mockParams = { name: 'Squat' };
  await render(<ExerciseDetail />, { wrapper });
  expect(screen.getByLabelText(/^Est\. 1RM, 27\d lb$/)).toBeTruthy();
  expect(screen.getByText('Heaviest set')).toBeTruthy();
  expect(screen.getByText('3 sessions')).toBeTruthy();
  expect(screen.getByText(/^From 235 lb × 5 on /)).toBeTruthy();
  await fireEvent.press(screen.getByText('Volume'));
  expect(screen.getByText('One block per set, weight × reps')).toBeTruthy();
  jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_o, cb) => cb(4));
  await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  expect(store.rest('Squat').seconds).toBe(180);
});

test('an exercise with no finished sets says so', async () => {
  sample();
  mockParams = { name: 'Leg press' };
  await render(<ExerciseDetail />, { wrapper });
  expect(screen.getByText('No sets of Leg press yet')).toBeTruthy();
});
