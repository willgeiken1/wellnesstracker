import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { PrivacySwitches } from '../src/features/settings/privacy-switches';
import { readDevicePreferences } from '../src/features/onboarding/device-preferences';

// Codex review, Nov 17: a switch turned on that fails to save keeps analytics running, so leaving and reopening
// Privacy must show that choice, not the older saved Off. A made-up phone store; no real data.
let mockStored: unknown = { crashReports: false, analytics: false };
let mockSaveFails = false;
const mockLocalSave = jest.fn((_key: string, value: unknown) => { if (mockSaveFails) throw new Error('made-up disk failure'); mockStored = value; });
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn(async () => ({ forOwner: () => ({ localGet: () => mockStored, localSave: mockLocalSave }) })) }));
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const draw = () => render(<ThemeProvider><PrivacySwitches /></ThemeProvider>);

test('a switch turned on that fails to save still shows on, with the warning, when Privacy is reopened', async () => {
  mockStored = { crashReports: false, analytics: false };
  const first = await draw();
  await waitFor(() => expect(screen.getByLabelText('Share usage analytics')).not.toBeDisabled());
  mockSaveFails = true;
  await act(async () => { fireEvent(screen.getByLabelText('Share usage analytics'), 'valueChange', true); });
  await settle();
  expect(mockStored).toEqual({ crashReports: false, analytics: false });
  first.unmount();
  await draw();
  await waitFor(() => expect(screen.getByLabelText('Share usage analytics')).not.toBeDisabled());
  // Analytics is running with the unsaved choice, so the reopened screen shows that choice and says it wasn't saved.
  expect(screen.getByLabelText('Share usage analytics').props.value).toBe(true);
  expect(screen.getByTestId('privacy-save-failed')).toBeTruthy();
  await expect(readDevicePreferences()).resolves.toEqual({ crashReports: false, analytics: true });
});
