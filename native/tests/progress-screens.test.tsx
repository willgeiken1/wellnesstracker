import { render, screen } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { ThemeProvider } from '../src/design/theme-provider';
import { useAuth } from '../src/auth/provider';
import { DayScoreScreen } from '../src/features/progress/screens/score';
import { TrendScreen } from '../src/features/progress/screens/trend';
import { WeeklyScreen } from '../src/features/progress/screens/weekly';
import { SleepScreen } from '../src/features/progress/screens/sleep';
import { BodyScreen } from '../src/features/progress/screens/body';
import { PhotosScreen } from '../src/features/progress/screens/photos';
import { LogWeightSheet } from '../src/features/progress/screens/log-weight';
import { PhotoCaptureSheet } from '../src/features/progress/screens/photo-capture';
import { MeasurementsSheet } from '../src/features/progress/screens/measurements';
import { ExportSheet } from '../src/features/progress/screens/export';
import { saveFood, setTargets, meals } from '../src/features/food/model';
import { today } from '../src/features/onboarding/model';
import { memoryRepository } from './workout-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./progress-mocks').gestureMock());
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
jest.mock('../src/features/health/oura-client', () => ({ oura: () => null }));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false, canAskAgain: false }, jest.fn()] }));
jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
// The build-without-notifications cases: requiring expo-notifications fails, as it would in a build without it.
jest.mock('expo-notifications', () => { throw new Error('expo-notifications is not in this build'); });

const SCREENS: [string, () => React.ReactElement][] = [
  ['day score', () => <DayScoreScreen />], ['trend', () => <TrendScreen metric="weight" range="month" />], ['training trend', () => <TrendScreen metric="training" />],
  ['weekly report', () => <WeeklyScreen />], ['sleep', () => <SleepScreen />], ['body', () => <BodyScreen />], ['photos', () => <PhotosScreen />],
  ['log weight', () => <LogWeightSheet />], ['photo', () => <PhotoCaptureSheet />], ['measurements', () => <MeasurementsSheet />], ['export', () => <ExportSheet />],
];
/** Every string and spoken label on screen. */
function words(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => words(n, out)); return out; }
  for (const key of ['accessibilityLabel', 'aria-label']) if (typeof node.props?.[key] === 'string') out.push(node.props[key]);
  const value = node.props?.accessibilityValue?.text; if (typeof value === 'string') out.push(value);
  (node.children ?? []).forEach(c => words(c as ReactTestRendererJSON | string, out));
  return out;
}

describe.each([['the sample data', true], ['nothing logged yet', false]])('with %s', (_name, demo) => {
  beforeEach(() => {
    const repo = memoryRepository();
    repo.save('profile', { name: 'Sample', weight_unit: 'lb' });
    jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo } as ReturnType<typeof useAuth>);
  });
  test.each(SCREENS)('%s draws with no broken values', async (_s, make) => {
    await render(<ThemeProvider>{make()}</ThemeProvider>);
    const all = words(screen.toJSON() as ReactTestRendererJSON);
    expect(all.length).toBeGreaterThan(3);
    for (const w of all) expect(w).not.toMatch(/NaN|undefined|Infinity|\bnull\b|\[object/);
  });
});

test('with nothing logged, the day score says No data instead of adding up zeros', async () => {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  await render(<ThemeProvider><DayScoreScreen /></ThemeProvider>);
  expect(screen.getByLabelText('Training adds No data, Food No data, Sleep No data, total No data')).toBeTruthy();
});

test('with nothing logged, the weekly report gives the step goal and says no food days are logged, not zeros', async () => {
  jest.mocked(useAuth).mockReturnValue({ repository: memoryRepository(), pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  await render(<ThemeProvider><WeeklyScreen /></ThemeProvider>);
  expect(screen.getByText('Goal 8,000 a day')).toBeTruthy();
  expect(screen.getByText('No full days logged yet')).toBeTruthy();
  expect(screen.queryByText('0 days under goal')).toBeNull();
});

test('a pillar with no data leaves the score to the others, so what each adds sums to the score', async () => {
  const repo = memoryRepository();
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
  const day = today(), kj = (kcal: number) => kcal * 4.184;
  setTargets(repo, day, { energy_kj: kj(2000), protein_g: 150, carbs_g: 200, fat_g: 60 }, day);
  saveFood(repo, day, meals(repo)[0].id, { name: 'Sample meal', energy_kj: kj(2000), protein_g: 150, carbs_g: 200, fat_g: 60, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null }, 1, undefined, day);
  await render(<ThemeProvider><DayScoreScreen /></ThemeProvider>);
  // Only food has data, so the score is food's alone, not a third of it.
  expect(screen.getByLabelText('Training adds No data, Food 100.0, Sleep No data, total 100')).toBeTruthy();
  expect(screen.getByText('+100.0')).toBeTruthy();
});

describe('the photo reminder in a build without notifications', () => {
  test('shows as coming in a later version, switched off, not a live switch', async () => {
    const repo = memoryRepository();
    repo.localSave('progressPhotoReminder', true);
    jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo: false } as ReturnType<typeof useAuth>);
    await render(<ThemeProvider><PhotosScreen /></ThemeProvider>);
    expect(screen.getByText('Comes in a later version')).toBeTruthy();
    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: false, disabled: true });
  });
});
