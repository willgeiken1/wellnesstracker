import { Platform } from 'react-native';
import config from '../app.json';
import { appleHealth } from '../src/features/health/apple';

// Apple asks that an app request only the Health types it uses. This pins the request to the types Insight
// shows today, so a new type can only join together with its screen, and checks Apple's sheet text names each.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { phoneOnly: false } } } }));
const mockKit = { isHealthDataAvailable: jest.fn(() => true), requestAuthorization: jest.fn(async () => true), getRequestStatusForAuthorization: jest.fn(async () => 2), queryWorkoutSamples: jest.fn() };
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
  HKQuantityTypeIdentifierBodyFatPercentage: 'body fat',
  HKQuantityTypeIdentifierDietaryWater: 'water',
  HKCategoryTypeIdentifierMindfulSession: 'mindful minutes',
  HKWorkoutTypeIdentifier: 'workouts',
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

test('the text on Apple\'s permission sheet names every type that is read, and says nothing is written', () => {
  const plugin = config.expo.plugins.find(entry => Array.isArray(entry) && entry[0] === '@kingstinct/react-native-healthkit') as [string, { NSHealthShareUsageDescription: string; NSHealthUpdateUsageDescription: unknown }];
  for (const name of Object.values(SHOWN)) expect(plugin[1].NSHealthShareUsageDescription).toContain(name);
  // Apple rejects a build whose HealthKit code has no write purpose string (ITMS-90683), even though the app never writes:
  // the string is there and says so, and no write access is ever asked for (see the toShare check above).
  expect(typeof plugin[1].NSHealthUpdateUsageDescription).toBe('string');
  expect(plugin[1].NSHealthUpdateUsageDescription).toMatch(/does not write anything to Apple Health/);
});

test('workouts come back grouped, in minutes without pauses, with measured calories and the recording app', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const from = new Date(2026, 10, 9), to = new Date(2026, 10, 14, 15);
  // Made-up samples. Apple numbers: 37 running, 50 strength, 3000 other.
  mockKit.queryWorkoutSamples.mockResolvedValueOnce([
    { uuid: 'a', workoutActivityType: 37, startDate: new Date(2026, 10, 10, 7), endDate: new Date(2026, 10, 10, 7, 40), duration: { unit: 's', quantity: 1896 }, totalEnergyBurned: { unit: 'kcal', quantity: 301.4 }, sourceRevision: { source: { name: 'Workout', bundleIdentifier: 'com.apple.health' } } },
    { uuid: 'b', workoutActivityType: 50, startDate: new Date(2026, 10, 11, 18), endDate: new Date(2026, 10, 11, 18, 45), totalEnergyBurned: { unit: 'kcal', quantity: 0 }, sourceRevision: { source: { name: 'Strong', bundleIdentifier: 'x' } } },
    { uuid: 'c', workoutActivityType: 3000, startDate: new Date(2026, 10, 12, 6), endDate: new Date(2026, 10, 12, 6, 10), duration: { unit: 's', quantity: 600 } },
    { uuid: 'early', workoutActivityType: 37, startDate: new Date(2026, 10, 8, 23, 30), endDate: new Date(2026, 10, 9, 0, 10), duration: { unit: 's', quantity: 2400 } },
  ]);
  const read = await appleHealth()!.workouts(from, to);
  expect(mockKit.queryWorkoutSamples).toHaveBeenCalledWith({ limit: 0, ascending: true, filter: { date: { startDate: from, endDate: to } } });
  expect(read).toEqual([
    { id: 'a', kind: 'run', start: new Date(2026, 10, 10, 7), end: new Date(2026, 10, 10, 7, 40), minutes: 31.6, kcal: 301.4, app: 'Workout' },
    { id: 'b', kind: 'strength', start: new Date(2026, 10, 11, 18), end: new Date(2026, 10, 11, 18, 45), minutes: 45, kcal: null, app: 'Strong' },
    { id: 'c', kind: 'other', start: new Date(2026, 10, 12, 6), end: new Date(2026, 10, 12, 6, 10), minutes: 10, kcal: null, app: '' },
  ]);
});
