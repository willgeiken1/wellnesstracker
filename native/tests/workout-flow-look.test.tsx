import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { useAuth } from '../src/auth/provider';
import { localDay } from '../src/core/workout/rules';
import { FinishSheet } from '../src/features/workout/finish';
import { Summary, WorkoutSummary, sessionMuscles } from '../src/features/workout/summary';
import { DaySummary, PastDayChoice, WorkoutDay } from '../src/features/workout/days';
import { TemplateEditor, Workouts } from '../src/features/workout/templates';
import { EquipmentChoices, MuscleChoices } from '../src/features/workout/exercise-choices';
import { SupersetControls } from '../src/features/workout/superset-controls';
import { minutesLabel } from '../src/features/workout/parts';
import { Cardio } from '../src/features/cardio/screen';
jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => false), canGoBack: jest.fn(() => false) } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('../src/features/workout/haptics', () => ({ tick: jest.fn(), signatureBuzz: jest.fn() }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const DAY = 86400000;
const dayAgo = (n: number) => localDay(new Date(Date.now() - n * DAY));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(router.canGoBack).mockReturnValue(false); jest.mocked(router.canDismiss).mockReturnValue(false);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
function open() {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  return { repo, store };
}
/** One finished sample workout a number of days ago: bench press 100 × 8 twice, plus a row with no sets logged. */
function workout(store: WorkoutStore, daysAgo = 1, name = 'Sample push') {
  const start = Date.now() - daysAgo * DAY, session = store.start(undefined, start);
  const bench = store.addExercise(session.id, 'Bench Press', 2);
  for (const index of [0, 1]) { store.editDraft(bench.id, index, { weight: '100', reps: '8' }); store.toggleDone(bench.id, index); }
  store.finish(session.id, { startedAt: start, finishedAt: start + 45 * 60000, notes: '', name });
  return session;
}

test('summary route with no such workout explains itself and leads to Workouts instead of a lone Done', async () => {
  open();
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'missing' });
  await render(<Summary />, { wrapper });
  expect(screen.getByRole('header')).toHaveTextContent('Workout summary');
  expect(screen.getByText('This workout is not on this phone.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Go to Workouts' }));
  expect(router.replace).toHaveBeenCalledWith('/workouts');
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.replace).toHaveBeenCalledTimes(2);
  jest.mocked(router.canGoBack).mockReturnValue(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('summary shows the facts of the workout: stats, print, muscles worked and exercises, with ways on', async () => {
  const { store } = open(), session = workout(store);
  await render(<WorkoutSummary store={store} id={session.id} />, { wrapper });
  expect(screen.getAllByRole('header')[0]).toHaveTextContent('Sample push');
  const stats = screen.getByTestId('summary-stats');
  expect(within(stats).getByLabelText('Time: 45:00')).toBeTruthy();
  expect(within(stats).getByLabelText('Sets: 2')).toBeTruthy();
  expect(within(stats).getByLabelText(/^Volume, lb: 1,600$/)).toBeTruthy();
  // No record was set, so there is no record count and no records section: a zero is not shown as a result.
  expect(within(stats).queryByText('PR')).toBeNull();
  expect(screen.queryByText('Personal records')).toBeNull();
  expect(screen.queryByTestId('summary-shelf')).toBeNull();
  expect(screen.getByTestId('summary-print')).toBeTruthy();
  const muscles = screen.getByTestId('summary-muscles');
  expect(within(muscles).getByLabelText('Chest: 2 sets')).toBeTruthy();
  expect(within(muscles).getByText(/^Also worked: /)).toBeTruthy();
  expect(within(muscles).getByTestId('summary-muscle-pecUpper')).toBeTruthy();
  const exercises = screen.getByTestId('summary-exercises');
  expect(within(exercises).getByText('Bench Press')).toBeTruthy();
  expect(within(exercises).getByText('2 sets · lb')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'View this day' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/day', params: { day: String(store.repo.get('sessions', session.id)!.data.day) } });
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(router.replace).toHaveBeenCalledWith('/');
  jest.mocked(router.canDismiss).mockReturnValue(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(router.dismissAll).toHaveBeenCalledTimes(1);
});

test('muscles worked counts full sets for the main muscle and only names the helpers', () => {
  const { store } = open(), session = workout(store);
  const muscles = sessionMuscles(store, session.id);
  expect(muscles.main).toEqual([{ group: 'chest', sets: 2 }]);
  expect(muscles.helpers.length).toBeGreaterThan(0);
  expect(muscles.helpers).not.toContain('chest');
  expect(sessionMuscles(store, 'missing')).toEqual({ main: [], helpers: [] });
});

test('a workout with nothing logged says so in the summary instead of drawing empty charts', async () => {
  const { store } = open(), start = Date.now() - DAY, session = store.start(undefined, start);
  store.finish(session.id, { startedAt: start, finishedAt: start + 60000, notes: '' });
  await render(<WorkoutSummary store={store} id={session.id} />, { wrapper });
  expect(screen.getByText('No exercises were logged in this workout.')).toBeTruthy();
  expect(screen.queryByTestId('summary-print')).toBeNull();
  expect(screen.queryByTestId('summary-muscles')).toBeNull();
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
});

test('day route with a date that cannot be read opens today, says so quietly, and offers a way back', async () => {
  const { store } = open(); workout(store, 1);
  jest.mocked(useLocalSearchParams).mockReturnValue({ day: 'not-a-date' });
  await render(<WorkoutDay />, { wrapper });
  expect(screen.queryByText('Choose a valid past date.')).toBeNull();
  expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
  expect(within(screen.getByTestId('day-note')).getByRole('alert')).toHaveTextContent('That date could not be opened, so this is today.');
  expect(screen.getByText('No workouts on this day.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Log workout for this day' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
  expect(screen.getByRole('header', { name: 'Yesterday' })).toBeTruthy();
  expect(screen.queryByTestId('day-note')).toBeNull();
  expect(screen.getByText('Bench Press')).toBeTruthy();
  expect(screen.getByText('100 × 8, 100 × 8 · lb')).toBeTruthy();
  expect(screen.getByText('45 min · 2 sets · 1,600 lb')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next day' })).not.toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Open summary for Sample push' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/summary', params: { id: store.history()[0].id } });
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.replace).toHaveBeenCalledWith('/workouts');
});

test('day route with no date opens today without a note; a future date is treated as unreadable', async () => {
  open();
  const view = await render(<WorkoutDay />, { wrapper });
  expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
  expect(screen.queryByTestId('day-note')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Go to Workouts' }));
  expect(router.replace).toHaveBeenCalledWith('/workouts');
  await view.unmount();
  jest.mocked(useLocalSearchParams).mockReturnValue({ day: localDay(new Date(Date.now() + 3 * DAY)) });
  await render(<WorkoutDay />, { wrapper });
  expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
  expect(screen.getByTestId('day-note')).toBeTruthy();
});

test('day screen marks the chosen day and days with a workout, and jumps to other workout days', async () => {
  const { store } = open(); workout(store, 2); workout(store, 9, 'Sample pull');
  const picked: string[] = [];
  await render(<DaySummary store={store} day={dayAgo(2)} onDay={day => picked.push(day)} />, { wrapper });
  const chosen = screen.getByRole('button', { name: `View workouts for ${dayAgo(2)}` });
  expect(chosen.props.accessibilityState).toEqual({ selected: true });
  expect(chosen.props.accessibilityValue).toEqual({ text: 'Workout logged' });
  expect(screen.getByTestId(`week-dot-${dayAgo(2)}`)).toBeTruthy();
  // The strip never offers a day after today.
  expect(screen.queryByRole('button', { name: `View workouts for ${localDay(new Date(Date.now() + DAY))}` })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: `View workouts for ${dayAgo(3)}` }));
  await fireEvent.press(within(screen.getByTestId('day-others')).getByRole('button'));
  expect(picked).toEqual([dayAgo(3), dayAgo(9)]);
});

test('past-day picker on History steps by day, rejects a bad date quietly and opens a good one', async () => {
  open();
  await render(<PastDayChoice />, { wrapper });
  expect(screen.getByText('Yesterday')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
  expect(screen.getByLabelText('Date (year-month-day)')).toHaveProp('value', dayAgo(2));
  await fireEvent.press(screen.getByRole('button', { name: 'Open day' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/day', params: { day: dayAgo(2) } });
  await fireEvent.changeText(screen.getByLabelText('Date (year-month-day)'), '2026-13-40');
  await fireEvent.press(screen.getByRole('button', { name: 'Open day' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid past date.');
  expect(router.push).toHaveBeenCalledTimes(1);
});

test('History lists finished workouts as rows that open their summary, and says so when there are none', async () => {
  const { store } = open();
  const view = await render(<Workouts />, { wrapper });
  await fireEvent.press(screen.getByRole('tab', { name: 'History' }));
  expect(within(screen.getByTestId('history-empty')).getByText('No finished workouts yet')).toBeTruthy();
  const session = workout(store, 1);
  await view.rerender(<Workouts />);
  expect(screen.queryByTestId('history-empty')).toBeNull();
  await fireEvent.press(within(screen.getByTestId('history-list')).getByRole('button', { name: /^Sample push, .* · 45 min$/ }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/summary', params: { id: session.id } });
});

test('routine editor: honest empty state, labelled targets, and reorder controls that know their limits', async () => {
  const { store } = open();
  const view = await render(<TemplateEditor />, { wrapper });
  expect(screen.getAllByRole('header')[0]).toHaveTextContent('New routine');
  expect(screen.getByText('No exercises yet')).toBeTruthy();
  await view.unmount();
  const routine = store.saveTemplate('Sample routine', ['Bench Press', 'Dumbbell Row'].map(exercise => ({ exercise, target_sets: 3, target_reps: 8 })));
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: routine.id });
  await render(<TemplateEditor />, { wrapper });
  expect(screen.queryByText('No exercises yet')).toBeNull();
  expect(screen.getByLabelText('Bench Press Target sets')).toHaveProp('value', '3');
  expect(screen.getByRole('button', { name: 'Move up, Bench Press' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Move down, Dumbbell Row' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Move down, Bench Press' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove, Dumbbell Row' }));
  await fireEvent.changeText(screen.getByLabelText('Routine name'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Save routine' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/^Give the routine a name/);
  await fireEvent.changeText(screen.getByLabelText('Routine name'), 'Sample routine');
  await fireEvent.press(screen.getByRole('button', { name: 'Save routine' }));
  expect(store.templateExercises(routine.id).map(row => row.data.exercise)).toEqual(['Bench Press']);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('finish sheet shows what will be saved and its switch still saves the workout as a template', async () => {
  const { store } = open(), start = Date.now() - 30 * 60000, session = store.start(undefined, start);
  const bench = store.addExercise(session.id, 'Bench Press', 1);
  store.editDraft(bench.id, 0, { weight: '100', reps: '8' }); store.toggleDone(bench.id, 0);
  await render(<FinishSheet store={store} session={store.repo.get('sessions', session.id)!} onClose={() => {}} />, { wrapper });
  const facts = screen.getByTestId('finish-facts');
  expect(within(facts).getByLabelText('Sets: 1')).toBeTruthy();
  expect(within(facts).getByLabelText('Exercises: 1')).toBeTruthy();
  expect(screen.queryByText(/No sets are logged yet/)).toBeNull();
  const toggle = screen.getByRole('switch', { name: 'Save as routine' });
  expect(toggle).toHaveProp('value', false);
  await fireEvent(toggle, 'valueChange', true);
  await fireEvent.changeText(screen.getByLabelText('Workout'), 'Sample session');
  await fireEvent.changeText(screen.getByLabelText('Start date and time'), 'tomorrow');
  await fireEvent.press(screen.getByTestId('save-workout'));
  expect(screen.getByRole('alert')).toHaveTextContent(/^Use a start time in the past/);
  expect(store.templates()).toHaveLength(0);
});

test('finish sheet with the switch on saves the template and opens the summary', async () => {
  const { store } = open(), session = store.start(undefined, Date.now() - 30 * 60000);
  store.addExercise(session.id, 'Bench Press', 1);
  await render(<FinishSheet store={store} session={store.repo.get('sessions', session.id)!} onClose={() => {}} />, { wrapper });
  expect(screen.getByText(/No sets are logged yet/)).toBeTruthy();
  await fireEvent(screen.getByRole('switch', { name: 'Save as routine' }), 'valueChange', true);
  await fireEvent.changeText(screen.getByLabelText('Workout'), 'Sample session');
  await fireEvent.press(screen.getByTestId('save-workout'));
  expect(store.templates().map(row => row.data.name)).toEqual(['Sample session']);
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/workout/summary', params: { id: session.id, just: '1' } });
});

test('muscle and equipment choices show the short name, say the full one, and mark the selection', async () => {
  const muscle = jest.fn(), equipment = jest.fn();
  await render(<><MuscleChoices all filter value={['chest']} onChange={muscle} /><EquipmentChoices all value="" onChange={equipment} /></>, { wrapper });
  const chest = screen.getByRole('button', { name: 'Muscle: Chest' });
  expect(within(chest).getByText('Chest')).toBeTruthy();
  expect(chest.props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('button', { name: 'All muscles' }).props.accessibilityState).toMatchObject({ selected: false });
  expect(screen.getByRole('button', { name: 'All equipment' }).props.accessibilityState).toMatchObject({ selected: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Muscle: Quads' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment: Machine' }));
  expect(muscle).toHaveBeenCalledWith('quads');
  expect(equipment).toHaveBeenCalledWith('machine');
});

test('superset chooser explains itself when there is nobody to pair with, and Cancel closes it', async () => {
  const link = jest.fn();
  await render(<SupersetControls items={[{ id: 'a', name: 'Bench Press', group: null }]} currentId="a" onLink={link} onUnlink={() => {}} />, { wrapper });
  expect(screen.queryByRole('button', { name: 'Unlink superset for Bench Press' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Link superset for Bench Press' }));
  expect(screen.getByText('Add another exercise first. A superset needs at least two.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save superset' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByTestId('superset-chooser')).toBeNull();
  expect(link).not.toHaveBeenCalled();
});

test('cardio with nothing saved says so, and a saved session reads as a day rather than a raw date', async () => {
  const repository = memoryRepository();
  const view = await render(<Cardio repository={repository} />, { wrapper });
  expect(within(screen.getByTestId('cardio-empty')).getByText('No cardio saved yet')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Incline treadmill' }).props.accessibilityState).toEqual({ selected: true });
  await act(() => { repository.save('cardio_sessions', { day: dayAgo(1), kind: 'bike', duration_ms: 1800000, distance_m: null, notes: '' }); });
  await view.rerender(<Cardio repository={repository} />);
  expect(screen.queryByTestId('cardio-empty')).toBeNull();
  const date = new Date(`${dayAgo(1)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(new Date(`${dayAgo(1)}T12:00:00`).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  expect(screen.getByText(`${date} · 30 min`)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start Bike again' })).toBeTruthy();
});

test('durations read as minutes, never as a made-up zero', () => {
  expect(minutesLabel(20000)).toBe('under 1 min');
  expect(minutesLabel(45 * 60000)).toBe('45 min');
  expect(minutesLabel(72 * 60000)).toBe('1 h 12 min');
  expect(minutesLabel(NaN)).toBe('');
});
