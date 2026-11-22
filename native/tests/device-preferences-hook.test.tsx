import { act, renderHook } from '@testing-library/react-native';
import { onDevicePreferencesSaved, resetDevicePreferencesSession, useDevicePreferences } from '../src/features/onboarding/device-preferences';

// The sign-in and onboarding forms save the switches on submit. A made-up store whose reads can fail.
let mockStored: unknown = { crashReports: false, analytics: false };
let mockReadFails = false;
const mockLocalSave = jest.fn((_key: string, value: unknown) => { mockStored = value; });
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn(async () => ({ forOwner: () => ({ localGet: () => { if (mockReadFails) throw new Error('made-up read failure'); return mockStored; }, localSave: mockLocalSave }) })) }));
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });

beforeEach(() => { resetDevicePreferencesSession(); mockStored = { crashReports: false, analytics: false }; mockReadFails = false; mockLocalSave.mockClear(); });

test('after a failed read, a change on a form is ignored, so submitting can\'t turn crash reports back on', async () => {
  mockReadFails = true;
  const heard: unknown[] = [];
  const stop = onDevicePreferencesSaved(value => heard.push(value));
  const { result } = await renderHook(() => useDevicePreferences());
  await settle();
  expect(result.current.loaded).toBe(false);
  await act(async () => { result.current.onChange({ crashReports: true, analytics: true }); });
  await act(async () => { await result.current.save().catch(() => {}); });
  expect(mockLocalSave).not.toHaveBeenCalled();
  expect(heard).toEqual([]);
  expect(mockStored).toEqual({ crashReports: false, analytics: false });
  stop();
});

test('after a successful read, a change on a form is saved on submit', async () => {
  const { result } = await renderHook(() => useDevicePreferences());
  await settle();
  expect(result.current.loaded).toBe(true);
  await act(async () => { result.current.onChange({ crashReports: false, analytics: true }); });
  await act(async () => { await result.current.save(); });
  expect(mockStored).toEqual({ crashReports: false, analytics: true });
});
