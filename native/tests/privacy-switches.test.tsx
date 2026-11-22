import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { PrivacySwitches } from '../src/features/settings/privacy-switches';
import { onDevicePreferencesSaved, resetDevicePreferencesSession, saveDevicePreferences } from '../src/features/onboarding/device-preferences';

// A made-up phone store whose first read and saves the test controls.
let mockStored: unknown = { crashReports: false, analytics: true };
let mockSaveFails = false;
let mockReadFails = false;
let releaseRead: () => void = () => {};
let mockReadGate: Promise<void> = Promise.resolve();
const mockLocalSave = jest.fn((_key: string, value: unknown) => { if (mockSaveFails) throw new Error('made-up disk failure'); mockStored = value; });
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn(async () => { await mockReadGate; return { forOwner: () => ({ localGet: () => { if (mockReadFails) throw new Error('made-up read failure'); return mockStored; }, localSave: mockLocalSave }) }; }) }));
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const draw = () => render(<ThemeProvider><PrivacySwitches /></ThemeProvider>);

beforeEach(() => { resetDevicePreferencesSession(); mockStored = { crashReports: false, analytics: true }; mockSaveFails = false; mockReadFails = false; mockReadGate = Promise.resolve(); mockLocalSave.mockClear(); });

test('switching analytics off stops it at once, even when saving fails, and says it was not saved', async () => {
  const heard: unknown[] = [];
  const stop = onDevicePreferencesSaved(value => heard.push(value));
  await draw(); await settle();
  mockSaveFails = true;
  await act(async () => { fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', false); });
  await settle();
  expect(heard).toEqual([{ crashReports: false, analytics: false }]);
  expect(screen.getByTestId('privacy-save-failed')).toBeTruthy();
  mockSaveFails = false;
  await act(async () => { fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', true); });
  await settle();
  expect(screen.queryByTestId('privacy-save-failed')).toBeNull();
  expect(mockStored).toEqual({ crashReports: false, analytics: true });
  stop();
});

test('a failed read keeps the switches locked and saves nothing, so an earlier crash-report opt-out survives', async () => {
  mockReadFails = true;
  const heard: unknown[] = [];
  const stop = onDevicePreferencesSaved(value => heard.push(value));
  await draw(); await settle();
  expect(screen.getByLabelText('Send crash reports')).toBeDisabled();
  expect(screen.getByLabelText('Share usage analytics')).toBeDisabled();
  await act(async () => { fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', false); });
  await settle();
  expect(mockLocalSave).not.toHaveBeenCalled();
  expect(heard).toEqual([]);
  expect(mockStored).toEqual({ crashReports: false, analytics: true });
  stop();
});

test('a successful read unlocks the switches with the saved choice', async () => {
  await draw();
  await waitFor(() => expect(screen.getByLabelText('Send crash reports')).not.toBeDisabled());
  expect(screen.getByLabelText('Send crash reports').props.value).toBe(false);
  expect(screen.getByLabelText('Share usage analytics').props.value).toBe(true);
});

test('when the read fails, this launch\'s switches still show and can be changed', async () => {
  await saveDevicePreferences({ crashReports: false, analytics: false });
  mockLocalSave.mockClear();
  mockReadFails = true;
  await draw();
  await waitFor(() => expect(screen.getByLabelText('Send crash reports')).not.toBeDisabled());
  expect(screen.getByLabelText('Send crash reports').props.value).toBe(false);
  expect(screen.getByLabelText('Share usage analytics').props.value).toBe(false);
  await act(async () => { fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', true); });
  await settle();
  expect(mockLocalSave).toHaveBeenCalledWith('devicePreferences', { crashReports: false, analytics: true });
});

// Kept last: it ends with overlapping act() calls (as on main), which break any test drawn after it.
test('the switches stay locked until the saved choice is read, so the defaults never overwrite it', async () => {
  mockReadGate = new Promise(resolve => { releaseRead = resolve; });
  await draw();
  const crash = screen.getByLabelText('Send crash reports');
  expect(crash).toBeDisabled();
  fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', false);
  await settle();
  expect(mockLocalSave).not.toHaveBeenCalled();
  await act(async () => { releaseRead(); });
  await waitFor(() => expect(screen.getByLabelText('Send crash reports')).not.toBeDisabled());
  expect(screen.getByLabelText('Send crash reports').props.value).toBe(false);
  expect(screen.getByLabelText('Share usage analytics').props.value).toBe(true);
});
