import { plannedWorkoutDays } from '../src/features/reminders/plan';
import { SplitStore, presetFor } from '../src/features/splits/store';
import { memoryRepository } from './workout-repository';

// Made-up splits only. Weekdays are Monday 0.
const MON = new Date(2026, 10, 23, 9);

describe('workout reminders follow the chosen split', () => {
  test('a Set weekdays split on Tuesday and Thursday reminds on Tuesday and Thursday', () => {
    const repo = memoryRepository(), split = new SplitStore(repo), ul = presetFor(split, 'ul')!;
    split.choose({ key: 'ul', name: ul.preset.name, mode: 'weekdays', perWeek: 2, week: [-1, 0, -1, 1, -1, -1, -1], days: ul.drafts.slice(0, 2), start: 0 }, MON);
    expect(plannedWorkoutDays(repo)).toEqual([1, 3]);
  });
  test('a Rotate in order split spreads its weekly target over the week', () => {
    const repo = memoryRepository(), split = new SplitStore(repo), ul = presetFor(split, 'ul')!;
    split.choose({ key: 'ul', name: ul.preset.name, mode: 'rotate', perWeek: 4, days: ul.drafts, start: 0 }, MON);
    expect(plannedWorkoutDays(repo)).toEqual([0, 1, 3, 5]);
  });
});
