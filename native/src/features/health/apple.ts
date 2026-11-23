import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { trialStubOn } from '../../trial/flag';
import type { HealthSource, SleepStage, WorkoutKind } from './source';

// Only the types Insight has a screen for. A type joins this list in the same change that shows it.
const READ = ['HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierStepCount', 'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierHeartRate', 'HKQuantityTypeIdentifierRestingHeartRate', 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierBodyFatPercentage', 'HKQuantityTypeIdentifierDietaryWater', 'HKCategoryTypeIdentifierMindfulSession',
  'HKWorkoutTypeIdentifier'] as const;
const HEART = {
  heartRate: ['HKQuantityTypeIdentifierHeartRate', 'count/min'],
  restingHeartRate: ['HKQuantityTypeIdentifierRestingHeartRate', 'count/min'],
  hrv: ['HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms'],
} as const;
// Apple's sleep values: 0 in bed, 2 awake; 1 is plain asleep, and 3, 4 and 5 are core, deep and REM.
const ASLEEP = new Set([1, 3, 4, 5]), AWAKE = 2;
const STAGE: Record<number, SleepStage> = { 3: 'core', 4: 'deep', 5: 'rem' };
// Apple's workout activity numbers (HKWorkoutActivityType), grouped. Anything not listed is 'other'.
const KIND: Record<number, WorkoutKind> = {
  37: 'run', 52: 'walk', 24: 'hike', 13: 'cycle', 35: 'row', 16: 'elliptical', 44: 'stairs', 68: 'stairs', 69: 'stairs',
  46: 'swim', 63: 'hiit', 73: 'mixed', 50: 'strength', 20: 'strength', 59: 'strength', 57: 'yoga',
};
type Kit = typeof import('@kingstinct/react-native-healthkit');

/** Apple Health, read-only. Null where it cannot work: off iPhone, in the phone-only build (which carries
 * no Health entitlement), or when the native module is missing. Values read here stay on the phone. */
export function appleHealth(): HealthSource | null {
  if (trialStubOn() || Platform.OS !== 'ios' || Constants.expoConfig?.extra?.phoneOnly === true) return null;
  let kit: Kit;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where Apple Health can exist
    kit = require('@kingstinct/react-native-healthkit') as Kit;
    if (!kit.isHealthDataAvailable()) return null;
  } catch { return null; }
  return {
    async access() {
      try {
        // 1 = should request, 2 = unnecessary (already asked). Anything else is treated as not asked.
        const status = Number(await kit.getRequestStatusForAuthorization({ toRead: READ }));
        if (status === 2) return 'asked';
        // An update that adds a type makes the whole list read as not asked. Someone who has already seen
        // Apple's sheet for any of Insight's types keeps reading what they allowed; Connect again asks for the rest.
        const each = await Promise.all(READ.map(type => kit.getRequestStatusForAuthorization({ toRead: [type] })));
        return each.some(one => Number(one) === 2) ? 'asked' : 'ask';
      } catch { return 'unavailable'; }
    },
    async request() { await kit.requestAuthorization({ toRead: READ }); },
    async weights(since) {
      const samples = await kit.queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { unit: 'kg', limit: 0, ascending: true, filter: { date: { startDate: since } } });
      return samples.map(sample => ({ id: sample.uuid, at: new Date(sample.startDate), kg: sample.quantity }));
    },
    async steps(from, to) {
      const total = await kit.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], { unit: 'count', filter: { date: { startDate: from, endDate: to } } });
      return total.sumQuantity?.quantity ?? null;
    },
    async activeEnergy(from, to) {
      const total = await kit.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], { unit: 'kcal', filter: { date: { startDate: from, endDate: to } } });
      return total.sumQuantity?.quantity ?? null;
    },
    async exerciseMinutes(from, to) {
      const total = await kit.queryStatisticsForQuantity('HKQuantityTypeIdentifierAppleExerciseTime', ['cumulativeSum'], { unit: 'min', filter: { date: { startDate: from, endDate: to } } });
      return total.sumQuantity?.quantity ?? null;
    },
    async sleep(from, to) {
      const samples = await kit.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, ascending: true, filter: { date: { startDate: from, endDate: to } } });
      // Awake stretches are kept so one device's awake time can be taken out of another device's broad asleep block.
      return samples.filter(sample => ASLEEP.has(Number(sample.value)) || Number(sample.value) === AWAKE)
        .map(sample => {
          const value = Number(sample.value), stage = STAGE[value];
          return { start: new Date(sample.startDate), end: new Date(sample.endDate), awake: value === AWAKE, ...(stage ? { stage } : {}) };
        });
    },
    async heart(metric, from, to) {
      const [type, unit] = HEART[metric];
      const read = await kit.queryStatisticsForQuantity(type, ['discreteAverage', 'discreteMin', 'discreteMax'], { unit, filter: { date: { startDate: from, endDate: to } } });
      const average = read.averageQuantity?.quantity, min = read.minimumQuantity?.quantity, max = read.maximumQuantity?.quantity;
      return average === undefined || min === undefined || max === undefined ? null : { average, min, max };
    },
    async water(from, to) {
      const total = await kit.queryStatisticsForQuantity('HKQuantityTypeIdentifierDietaryWater', ['cumulativeSum'], { unit: 'mL', filter: { date: { startDate: from, endDate: to } } });
      return total.sumQuantity?.quantity ?? null;
    },
    async mindful(from, to) {
      const samples = await kit.queryCategorySamples('HKCategoryTypeIdentifierMindfulSession', { limit: 0, ascending: true, filter: { date: { startDate: from, endDate: to } } });
      return samples.map(sample => ({ start: new Date(sample.startDate), end: new Date(sample.endDate) }));
    },
    async bodyFat(since) {
      // Apple keeps percentages as fractions of 1.
      const samples = await kit.queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', { unit: '%', limit: 0, ascending: true, filter: { date: { startDate: since } } });
      return samples.map(sample => ({ at: new Date(sample.startDate), percent: sample.quantity * 100 }));
    },
    async vo2Max() {
      const [latest] = await kit.queryQuantitySamples('HKQuantityTypeIdentifierVO2Max', { unit: 'ml/(kg*min)', limit: 1, ascending: false });
      return latest ? { value: latest.quantity, at: new Date(latest.startDate) } : null;
    },
    async workouts(from, to) {
      const samples = await kit.queryWorkoutSamples({ limit: 0, ascending: true, filter: { date: { startDate: from, endDate: to } } });
      return samples.filter(sample => new Date(sample.startDate) >= from && new Date(sample.startDate) < to).map(sample => {
        const start = new Date(sample.startDate), end = new Date(sample.endDate);
        // Duration comes in seconds and leaves out paused time; fall back to the clock time if it is missing.
        const seconds = sample.duration?.unit === 's' && Number.isFinite(sample.duration.quantity) ? sample.duration.quantity : (end.getTime() - start.getTime()) / 1000;
        const energy = sample.totalEnergyBurned;
        return {
          id: sample.uuid, kind: KIND[Number(sample.workoutActivityType)] ?? 'other', start, end, minutes: Math.max(0, seconds / 60),
          kcal: energy && energy.unit === 'kcal' && Number.isFinite(energy.quantity) && energy.quantity > 0 ? energy.quantity : null,
          app: sample.sourceRevision?.source?.name ?? '',
        };
      });
    },
  };
}
