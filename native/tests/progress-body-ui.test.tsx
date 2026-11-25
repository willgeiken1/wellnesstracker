import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import Progress from '../src/app/(tabs)/progress';
import { BodyScreen } from '../src/features/progress/screens/body';
import { pageHandlers } from '../src/features/shell/registry';
import { memoryRepository } from './workout-repository';
const mockRepository = memoryRepository();
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./progress-mocks').gestureMock());
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;
beforeEach(() => jest.mocked(router.push).mockClear());

test('Progress opens Body from the weight and body fat tiles, and photos from the photos tile', async () => {
  await render(wrap(<Progress />));
  await fireEvent.press(screen.getByLabelText('Weight. Open body'));
  expect(router.push).toHaveBeenLastCalledWith('/progress/body');
  await fireEvent.press(screen.getByLabelText('Body fat. Open body'));
  expect(router.push).toHaveBeenLastCalledWith('/progress/body');
  await fireEvent.press(screen.getByLabelText('Photos. Open progress photos'));
  expect(router.push).toHaveBeenLastCalledWith('/progress/photos');
});

test('the + menu on Progress logs a weight, takes a photo, adds measurements and exports', async () => {
  await render(wrap(<Progress />));
  const own = pageHandlers('progress');
  for (const [id, to] of [['weigh', '/progress/log-weight'], ['photo', '/progress/photo-capture'], ['measure', '/progress/measurements'], ['export', '/progress/export']] as const) {
    expect(own[id]?.label).toBeTruthy();
    own[id]!.run!();
    expect(router.push).toHaveBeenLastCalledWith(to);
  }
});

test('Body logs a weigh-in from its Log button, and with nothing logged it shows no made-up numbers', async () => {
  await render(wrap(<BodyScreen />));
  await fireEvent.press(screen.getByRole('button', { name: 'Log' }));
  expect(router.push).toHaveBeenLastCalledWith('/progress/log-weight');
  expect(screen.queryByText(/^0(\.0)? (lb|kg)$/)).toBeNull();
});
