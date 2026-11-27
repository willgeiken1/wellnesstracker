import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { useAuth } from '../src/auth/provider';
import { PhotoCaptureSheet } from '../src/features/progress/screens/photo-capture';
import { takeInPhoto } from '../src/features/progress/local';
import { showToast } from '../src/features/shell/toast';
import { memoryRepository } from './workout-repository';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-reanimated', () => require('./progress-mocks').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./progress-mocks').gestureMock());
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
jest.mock('../src/features/health/oura-client', () => ({ oura: () => null }));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()] }));
jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/features/progress/local', () => ({ ...jest.requireActual('../src/features/progress/local'), takeInPhoto: jest.fn() }));

function as(demo: boolean) {
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sample', weight_unit: 'lb' });
  jest.mocked(useAuth).mockReturnValue({ repository: repo, pending: 0, syncStatus: 'idle', demo } as ReturnType<typeof useAuth>);
}
beforeEach(() => { jest.mocked(showToast).mockClear(); jest.mocked(takeInPhoto).mockClear(); });

describe('a progress photo while looking around with example data', () => {
  test('is not taken or kept, and the camera says so, so no file is left behind for an account to lose', async () => {
    as(true);
    await render(<ThemeProvider><PhotoCaptureSheet /></ThemeProvider>);
    expect(screen.getByText('Not kept with example data')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Take photo'));
    await Promise.resolve();
    expect(showToast).toHaveBeenCalledWith('Photos are not kept with example data. Leave the example data to take one.', { color: 'warning' });
    expect(takeInPhoto).not.toHaveBeenCalled();
  });
  test('outside example data the camera opens as before', async () => {
    as(false);
    await render(<ThemeProvider><PhotoCaptureSheet /></ThemeProvider>);
    expect(screen.queryByText('Not kept with example data')).toBeNull();
  });
});
