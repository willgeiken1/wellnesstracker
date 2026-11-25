import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { useAuth } from '../src/auth/provider';
import { saveWeighIn } from '../src/features/body/model';
import { today } from '../src/features/onboarding/model';
import { LogWeightSheet } from '../src/features/progress/screens/log-weight';
import { MeasurementsSheet } from '../src/features/progress/screens/measurements';
import { readBodyFat, readMeasures, saveBodyFat } from '../src/features/progress/local';
import { showToast } from '../src/features/shell/toast';
import { memoryRepository } from './workout-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./progress-mocks').gestureMock());
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
jest.mock('../src/features/health/oura-client', () => ({ oura: () => null }));
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));

type Repo = ReturnType<typeof memoryRepository>;
const use = (repo: Repo) => jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle' } as ReturnType<typeof useAuth>);
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;
const app = (repo: Repo) => repo.list('weigh_ins').filter(r => r.data.source === 'app');
function kgRepo() { const repo = memoryRepository(); repo.save('profile', { name: 'Sample', weight_unit: 'kg' }); return repo; }
beforeEach(() => { jest.mocked(showToast).mockClear(); jest.mocked(router.back).mockClear(); });

describe('Log weight', () => {
  test('starts from the last weight typed here and never from an Apple Health reading', async () => {
    const repo = kgRepo();
    repo.save('weigh_ins', { day: today(), weight_kg: 90, entered_value: 90, entered_unit: 'kg', source: 'healthkit' });
    use(repo);
    await render(wrap(<LogWeightSheet />));
    expect(screen.getByRole('button', { name: '72.0 kilograms' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '90.0 kilograms' })).toBeNull();
  });
  test('saves the value as a typed weigh-in, closes, and Undo takes it back', async () => {
    const repo = kgRepo();
    saveWeighIn(repo, 80, 'kg', '2026-01-01');
    use(repo);
    await render(wrap(<LogWeightSheet />));
    expect(screen.getByRole('button', { name: '80.0 kilograms' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Increase by 0.1 kg' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    const mine = app(repo).find(r => r.data.day === today())!;
    expect(mine.data.weight_kg).toBeCloseTo(80.1, 5);
    expect(router.back).toHaveBeenCalled();
    const [text, options] = jest.mocked(showToast).mock.calls[0];
    expect(text).toBe('Weight saved: 80.1 kg');
    await act(() => options!.action!.onAction());
    expect(app(repo).some(r => r.data.day === today())).toBe(false);
  });
  test('a weight far from the last one asks before it saves', async () => {
    const repo = kgRepo();
    saveWeighIn(repo, 80, 'kg', '2026-01-01');
    use(repo);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(wrap(<LogWeightSheet />));
    await fireEvent.press(screen.getByRole('button', { name: '80.0 kilograms' }));
    await fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '95');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(app(repo)).toHaveLength(1);
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Save anyway']);
    await act(() => buttons[1].onPress!());
    expect(app(repo).find(r => r.data.day === today())!.data.weight_kg).toBeCloseTo(95, 5);
    alert.mockRestore();
  });
});

describe('Measurements', () => {
  test('saves the measure that moved, leaves measures never taken alone, and keeps body fat unless it changed', async () => {
    const repo = kgRepo();
    saveBodyFat(repo, '2026-01-01', 22);
    use(repo);
    await render(wrap(<MeasurementsSheet />));
    await fireEvent.press(screen.getByTestId('measure-waist-less'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(readMeasures(repo).at(-1)).toEqual({ day: today(), cm: { waist: 84.5 } });
    expect(readBodyFat(repo)).toEqual([{ day: '2026-01-01', pct: 22 }]);
    expect(router.back).toHaveBeenCalled();
  });
  test('body fat is saved once its stepper moves', async () => {
    const repo = kgRepo();
    use(repo);
    await render(wrap(<MeasurementsSheet />));
    await fireEvent.press(screen.getByTestId('measure-bf-more'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(readBodyFat(repo)).toEqual([{ day: today(), pct: 20.1 }]);
    expect(readMeasures(repo)).toEqual([]);
  });
});
