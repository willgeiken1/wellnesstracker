import { WorkoutStore } from '../src/data/workout/store';
import { buildCsvs } from '../src/features/progress/export';
import { exportDays, readExportReadings } from '../src/features/progress/export-read';
import { HISTORY } from '../src/features/progress/model';
import { buildProgress } from '../src/features/progress/source';
import type { HealthAccess, HealthSource } from '../src/features/health/source';
import { memoryRepository } from './workout-repository';

jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
jest.mock('../src/features/health/oura-client', () => ({ oura: () => null }));

// Made-up values only: 5,000 steps every day.
const NOW = new Date(2026, 10, 11, 12);
const source = (access: HealthAccess, over: Partial<HealthSource> = {}): HealthSource => ({
  access: async () => access, request: async () => {}, weights: async () => [], steps: async () => 5000, sleep: async () => [], activeEnergy: async () => null, exerciseMinutes: async () => null, heart: async () => null, vo2Max: async () => null, water: async () => null, mindful: async () => [], bodyFat: async () => [], workouts: async () => [], ...over,
});

test('each export range reads its own run of days; All time reads the year Progress keeps', () => {
  expect(exportDays('30')).toBe(30);
  expect(exportDays('90')).toBe(90);
  expect(exportDays('all')).toBe(HISTORY);
});

test('a 90-day export holds readings from before the 30 days the charts keep', async () => {
  const read = await readExportReadings('90', NOW, { apple: source('asked'), ring: null });
  expect(read.health?.steps).toHaveLength(90);
  const repo = memoryRepository();
  repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
  const d = buildProgress({ store: new WorkoutStore(repo), now: NOW, demo: false, ...read });
  const steps = buildCsvs(repo, d, ['steps'], '90')[0].csv.trimEnd().split('\r\n');
  expect(steps).toHaveLength(91);
  expect(steps[1]).toBe('2026-08-14,5000');
});

test('nothing is read without Apple Health or Oura, or before the person has been asked', async () => {
  const steps = jest.fn(async () => 5000);
  expect(await readExportReadings('all', NOW, { apple: source('ask', { steps }), ring: null })).toEqual({ health: null, recovery: null, ring: null });
  expect(await readExportReadings('all', NOW)).toEqual({ health: null, recovery: null, ring: null });
  expect(steps).not.toHaveBeenCalled();
});
