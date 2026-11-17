import { Platform } from 'react-native';
import { appleHealth } from '../src/features/health/apple';

// Codex review of #181 and #191, Nov 17: an update that adds a Health type made everyone who had already
// connected read as never asked, so Home tiles, weights, Recovery and Cardio stopped until they reconnected.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { phoneOnly: false } } } }));
let mockAsked: string[] = [];
const mockKit = { isHealthDataAvailable: jest.fn(() => true), requestAuthorization: jest.fn(async () => true),
  getRequestStatusForAuthorization: jest.fn(async ({ toRead }: { toRead: string[] }) => toRead.every(type => mockAsked.includes(type)) ? 2 : 1) };
jest.mock('@kingstinct/react-native-healthkit', () => mockKit);
beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'ios'); });

test('someone who connected before an update added Health types still reads as asked', async () => {
  mockAsked = ['HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierStepCount', 'HKCategoryTypeIdentifierSleepAnalysis'];
  expect(await appleHealth()!.access()).toBe('asked');
});

test('someone who has never seen Apple\'s sheet for any Insight type still reads as not asked', async () => {
  mockAsked = [];
  expect(await appleHealth()!.access()).toBe('ask');
});
