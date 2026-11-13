import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { FoodScreen } from '../src/features/food/screen';
import { FoodLogScreen } from '../src/features/food/log-screen';
import { meals, saveFood } from '../src/features/food/model';
import { memoryRepository } from './workout-repository';

// C-13: a press on the Food screens never throws. A failed confirm shows the quiet error row, a failed manual save
// shows the form's own error line (FoodEntry catches its onSave), and a press on an AI job that has gone does nothing.
const mockAi = { throwConfirm: false, pending: null as string | null, fallback: false };
jest.mock('../src/features/food/ai/service', () => {
  const actual = jest.requireActual('../src/features/food/ai/service');
  return {
    ...actual,
    aiState: (repo: unknown) => {
      const s = actual.aiState(repo);
      return {
        ...s,
        entries: mockAi.pending ? { ...s.entries, [mockAi.pending]: { confirmed: false } } : s.entries,
        // A made-up job, so the results card shows on the log screen; the stub below presses a different id.
        fallback: mockAi.fallback ? [{ id: 1, day: '2026-10-27', meal: 'meal' }] : s.fallback,
      };
    },
    confirmEstimate: (...args: unknown[]) => {
      if (mockAi.throwConfirm) throw new Error('estimate already gone');
      return actual.confirmEstimate(...args);
    },
  };
});
jest.mock('../src/features/food/ai/review', () => {
  const actual = jest.requireActual('../src/features/food/ai/review');
  const { Pressable } = require('react-native');
  return {
    ...actual,
    FoodAiResults: ({ onDescribe, onManual }: { onDescribe: (id: number) => void; onManual: (id: number) => void }) => <>
      <Pressable accessibilityRole="button" accessibilityLabel="Describe a job that has gone" onPress={() => onDescribe(999)} />
      <Pressable accessibilityRole="button" accessibilityLabel="Enter a job that has gone" onPress={() => onManual(999)} />
    </>,
  };
});
jest.mock('expo-camera', () => ({ useCameraPermissions: () => [{ granted: false }, jest.fn()], CameraView: () => null }));
jest.mock('@react-native-picker/picker', () => { const React = require('react'); const { View } = require('react-native'); const Picker = (props: object) => React.createElement(View, props); Picker.Item = () => null; return { Picker }; });

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const FAILURE = 'Could not save this change. Your input is kept; try again.';
/** Made-up sample food only. */
const toast = { name: 'Synthetic toast', energy_kj: 120 * 4.184, protein_g: 4, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 27, 12, 0)); Object.assign(mockAi, { throwConfirm: false, pending: null, fallback: false }); });
afterEach(() => jest.useRealTimers());
const failWrites = (repo: ReturnType<typeof memoryRepository>) => { repo.atomic = () => { throw new Error('disk full'); }; };

describe('Food screen', () => {
  test('confirming an estimate that fails shows the error row instead of crashing', async () => {
    const repo = memoryRepository();
    const row = saveFood(repo, '2026-10-27', meals(repo)[0].id, toast);
    mockAi.pending = row.id; mockAi.throwConfirm = true;
    await render(<FoodScreen repository={repo} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: /^Synthetic toast, / }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm Synthetic toast' }));
    expect(screen.getByText(FAILURE)).toBeTruthy();
  });

  test('a manual save that fails keeps the form open and says so', async () => {
    const repo = memoryRepository();
    await render(<FoodScreen repository={repo} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Manual' }));
    await fireEvent.changeText(screen.getByLabelText('Food name'), 'Synthetic toast');
    failWrites(repo);
    await fireEvent.press(screen.getByRole('button', { name: 'Save to today' }));
    expect(screen.getByText(FAILURE)).toBeTruthy();
    expect(screen.getByLabelText('Food name')).toHaveDisplayValue('Synthetic toast');
  });

  test('Describe or Manual on an AI job that has gone does nothing', async () => {
    await render(<FoodScreen repository={memoryRepository()} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Describe a job that has gone' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enter a job that has gone' }));
    expect(screen.queryByLabelText('Food name')).toBeNull();
    expect(screen.queryByText(FAILURE)).toBeNull();
  });
});

describe('log screen', () => {
  test('a manual save that fails keeps the form open and says so', async () => {
    const repo = memoryRepository();
    await render(<FoodLogScreen repository={repo} />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Search your foods'), 'Synthetic soup');
    await fireEvent.press(screen.getByRole('button', { name: 'Enter “Synthetic soup” manually' }));
    failWrites(repo);
    await fireEvent.press(screen.getByRole('button', { name: 'Save to today' }));
    expect(screen.getByText(FAILURE)).toBeTruthy();
    expect(screen.getByLabelText('Food name')).toHaveDisplayValue('Synthetic soup');
  });

  test('Describe or Manual on an AI job that has gone does nothing', async () => {
    mockAi.fallback = true;
    await render(<FoodLogScreen repository={memoryRepository()} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Describe a job that has gone' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enter a job that has gone' }));
    expect(screen.queryByLabelText('Food name')).toBeNull();
    expect(screen.queryByText(FAILURE)).toBeNull();
  });
});
