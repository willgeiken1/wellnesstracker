import type { Repository } from '../src/data/repository';
import { scoreDays } from '../src/features/score/days';
import { SplitStore, presetFor, weeklyTarget } from '../src/features/splits/store';
import { TrainingData } from '../src/features/workout/training-data';
import { readScore } from '../src/features/score/read';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';

// Made-up split and cardio only.
const MON = new Date(2026, 10, 16, 9);
const DAYS = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const store = (repo: Repository) => ({ repo, trainingHistory: () => [], active: () => null }) as never;

describe('the score and Progress use the chosen split’s weekly target', () => {
  test('a six-day split makes one training day a sixth of the week, not a third', () => {
    const repo = memoryRepository(), split = new SplitStore(repo), ul = presetFor(split, 'ul')!;
    expect(weeklyTarget(repo)).toBe(3);
    split.choose({ key: 'ul', name: ul.preset.name, mode: 'rotate', perWeek: 6, days: ul.drafts, start: 0 }, MON);
    expect(weeklyTarget(repo)).toBe(6);
    repo.save('cardio_sessions', { day: '2026-11-17', kind: 'run', duration_ms: 30 * 60000, distance_m: 5000, notes: '' });
    expect(scoreDays({ store: store(repo as unknown as Repository), days: DAYS }).map(p => p.training)[4]).toBe(17);
  });
  test('a Set weekdays split counts the weekdays it sets', () => {
    const repo = memoryRepository(), split = new SplitStore(repo), ul = presetFor(split, 'ul')!;
    split.choose({ key: 'ul', name: ul.preset.name, mode: 'weekdays', perWeek: 2, week: [0, 1, -1, 0, 1, -1, -1], days: ul.drafts.slice(0, 2), start: 0 }, MON);
    expect(weeklyTarget(repo)).toBe(4);
  });
  test('Training’s This week target and the workout summary follow a six-day split, not the plan’s three', () => {
    const repo = memoryRepository(), split = new SplitStore(repo), ul = presetFor(split, 'ul')!;
    expect(new TrainingData(repo as never, MON.getTime()).plan().perWeek).toBe(3);
    split.choose({ key: 'ul', name: ul.preset.name, mode: 'rotate', perWeek: 6, days: ul.drafts, start: 0 }, MON);
    expect(new TrainingData(repo as never, MON.getTime()).plan().perWeek).toBe(6);
  });
  test('the score detail screen measures workouts against the six-day split too', () => {
    const repo = memoryRepository(), split = new SplitStore(repo), ul = presetFor(split, 'ul')!;
    const goal = () => readScore(new WorkoutStore(repo as never), MON, null).parts.workoutGoal;
    expect(goal()).toBe(3);
    split.choose({ key: 'ul', name: ul.preset.name, mode: 'rotate', perWeek: 6, days: ul.drafts, start: 0 }, MON);
    expect(goal()).toBe(6);
  });
});
