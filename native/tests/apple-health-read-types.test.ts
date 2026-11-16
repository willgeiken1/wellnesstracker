import { Platform } from 'react-native';
import config from '../app.json';
import { appleHealth } from '../src/features/health/apple';

// Apple asks that an app request only the Health types it uses. This pins the request to the types Insight
// shows today, so a new type can only join together with its screen, and checks Apple's sheet text names each.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { phoneOnly: false } } } }));
const mockKit = { isHealthDataAvailable: jest.fn(() => true), requestAuthorization: jest.fn(async () => true), getRequestStatusForAuthorization: jest.fn(async () => 2) };
jest.mock('@kingstinct/react-native-healthkit', () => mockKit);

const SHOWN = {
  HKQuantityTypeIdentifierBodyMass: 'body weight',
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKCategoryTypeIdentifierSleepAnalysis: 'sleep',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'active calories',
  HKQuantityTypeIdentifierAppleExerciseTime: 'exercise minutes',
  HKQuantityTypeIdentifierHeartRate: 'heart rate',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting heart rate',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'heart rate variability',
  HKQuantityTypeIdentifierVO2Max: 'VO2 max',
} as const;

test('Apple Health is asked to read only the types Insight shows, and never to write', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const source = appleHealth();
  expect(source).not.toBeNull();
  await source!.request();
  await source!.access();
  expect(mockKit.requestAuthorization).toHaveBeenCalledTimes(1);
  expect(mockKit.getRequestStatusForAuthorization).toHaveBeenCalledTimes(1);
  for (const call of [...mockKit.requestAuthorization.mock.calls, ...mockKit.getRequestStatusForAuthorization.mock.calls] as unknown as [{ toRead: string[]; toShare?: string[] }][]) {
    expect([...call[0].toRead].sort()).toEqual(Object.keys(SHOWN).sort());
    expect(call[0].toShare ?? []).toEqual([]);
  }
});

test('the text on Apple\'s permission sheet names every type that is read', () => {
  const plugin = config.expo.plugins.find(entry => Array.isArray(entry) && entry[0] === '@kingstinct/react-native-healthkit') as [string, { NSHealthShareUsageDescription: string; NSHealthUpdateUsageDescription: unknown }];
  for (const name of Object.values(SHOWN)) expect(plugin[1].NSHealthShareUsageDescription).toContain(name);
  expect(plugin[1].NSHealthUpdateUsageDescription).toBe(false);
});
