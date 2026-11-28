import { memoryRepository } from './workout-repository';
import type { Repository } from '../src/data/repository';
import { presetFor, SplitStore } from '../src/features/splits/store';
import { WorkoutStore } from '../src/data/workout/store';
import { TrainingData } from '../src/features/workout/training-data';

// While a workout runs, the plan still names the day after it as up next (the mockup's Plan days and Up next). Made-up days only.
const MON = new Date(2026, 10, 23, 9);
function setup() {
  const repo = memoryRepository() as unknown as Repository;
  Object.defineProperty(repo, 'syncFlags', { value: { syncedV1Columns: true } });
  const s = new SplitStore(repo), ul = presetFor(s, 'ul')!;
  s.choose({ key: 'ul', name: ul.preset.name, mode: 'weekdays', perWeek: 4, days: ul.drafts }, MON);
  return repo;
}

describe('plan during a live workout', () => {
  test("starting the next day moves up next to the day after it", () => {
    const repo = setup(), before = new TrainingData(repo, MON.getTime()).plan();
    expect(before.next).not.toBeNull();
    new WorkoutStore(repo).start(before.next!.routineId, MON.getTime());
    const p = new TrainingData(repo, MON.getTime() + 60_000).plan();
    const live = p.days.find(d => d.kind === 'live');
    expect(live?.routineId).toBe(before.next!.routineId);
    expect(p.next).not.toBeNull();
    expect(p.next!.kind).toBe('next');
    expect(p.next!.index).toBe((live!.index + 1) % p.days.length);
    expect(p.days.filter(d => d.kind === 'next')).toHaveLength(1);
  });
  test('starting another day still shows a next day', () => {
    const repo = setup(), before = new TrainingData(repo, MON.getTime()).plan();
    const other = before.days.find(d => d.index !== before.next!.index)!;
    new WorkoutStore(repo).start(other.routineId, MON.getTime());
    const p = new TrainingData(repo, MON.getTime() + 60_000).plan();
    expect(p.next).not.toBeNull();
    expect(p.next!.kind).toBe('next');
    expect(p.next!.routineId).not.toBe(other.routineId);
  });
});
