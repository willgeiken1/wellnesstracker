import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { SetRow } from '../src/features/workout/set-row';
import { MachineSetup } from '../src/features/workout/machine-setup';
import { t } from '../src/i18n/en';
function wrapper({ children }: { children: React.ReactNode }) { return <ThemeProvider>{children}</ThemeProvider>; }
const draft = { weight: '', reps: '', setId: null, tag: null } as never;
const row = (props: Partial<React.ComponentProps<typeof SetRow>> = {}) => <SetRow exercise="Sample lift" index={1} draft={draft} previous="" hint="" onEdit={() => {}} onDone={() => {}} onRemove={() => {}} {...props} />;

test('an empty set with a faded hint is announced as a suggestion, not as blank', async () => {
  await render(row({ hint: '135', repsHint: '8' }), { wrapper });
  expect(screen.getByRole('button', { name: 'Sample lift, Set 2, Weight, suggested 135' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sample lift, Set 2, Reps, suggested 8' })).toBeTruthy();
});
test('an empty set with no hint is still announced as blank', async () => {
  await render(row(), { wrapper });
  expect(screen.getByRole('button', { name: 'Sample lift, Set 2, Weight, blank' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sample lift, Set 2, Reps, blank' })).toBeTruthy();
});
test('a typed value is announced as typed, even when a hint exists', async () => {
  await render(row({ hint: '135', draft: { weight: '140', reps: '', setId: null, tag: null } as never }), { wrapper });
  expect(screen.getByRole('button', { name: 'Sample lift, Set 2, Weight, 140' })).toBeTruthy();
});
test('setup button is named for the equipment: machine wording only on machines and cables', async () => {
  const store = new WorkoutStore(memoryRepository());
  const view = await render(<MachineSetup store={store} name="Sample lift" equipment="barbell" />, { wrapper });
  expect(screen.getByRole('button', { name: 'Bar and step setup' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Machine setup' })).toBeNull();
  await view.rerender(<MachineSetup store={store} name="Sample lift" equipment="machine" />);
  expect(screen.getByRole('button', { name: 'Machine setup' })).toBeTruthy();
  await view.rerender(<MachineSetup store={store} name="Sample lift" equipment="cable" />);
  expect(screen.getByRole('button', { name: 'Machine setup' })).toBeTruthy();
  await view.rerender(<MachineSetup store={store} name="Sample lift" />);
  expect(screen.getByRole('button', { name: 'Machine setup' })).toBeTruthy();
});
test('keypad wheel key uses plain wording', () => {
  expect(t('holdWheel')).toBe('Hold to scroll');
});
