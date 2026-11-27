import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { useAuth } from '../src/auth/provider';
import { today } from '../src/features/onboarding/model';
import { emptyProgress, type ProgressData } from '../src/features/progress/model';
import { MeasurementsSheet } from '../src/features/progress/screens/measurements';
import { readBodyFat, saveBodyFat } from '../src/features/progress/local';
import { useProgress } from '../src/features/progress/use-progress';
import { memoryRepository } from './workout-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('../src/features/progress/use-progress', () => ({ useProgress: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./progress-mocks').gestureMock());
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));

// Made-up readings only. The latest body fat is a smart scale's, read from Apple Health.
function setup(typed: boolean) {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
  if (typed) saveBodyFat(repo, '2026-01-01', 22);
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
  const d: ProgressData = { ...emptyProgress(today(), 'kg'), bodyFat: [...(typed ? [{ day: '2026-01-01', pct: 22 }] : []), { day: today(), pct: 18.4, health: true }] };
  jest.mocked(useProgress).mockReturnValue(d);
  return repo;
}
const step = async (dir: 'more' | 'less') => { await fireEvent.press(screen.getByTestId(`measure-bf-${dir}`)); };

describe('body fat in Measurements, with the latest reading from Apple Health', () => {
  test('moving the stepper away and back never saves the Health reading as a typed one', async () => {
    const repo = setup(true);
    await render(<ThemeProvider><MeasurementsSheet /></ThemeProvider>);
    await step('more'); await step('less');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(readBodyFat(repo).map(x => x.pct)).not.toContain(18.4);
  });
  test('starts from the last typed reading, not the Health one', async () => {
    const repo = setup(true);
    await render(<ThemeProvider><MeasurementsSheet /></ThemeProvider>);
    await step('more');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(readBodyFat(repo).at(-1)).toEqual({ day: today(), pct: 22.1 });
  });
  test('with only Health readings, starts at the usual 20 percent', async () => {
    const repo = setup(false);
    await render(<ThemeProvider><MeasurementsSheet /></ThemeProvider>);
    await step('more');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(readBodyFat(repo)).toEqual([{ day: today(), pct: 20.1 }]);
  });
});
