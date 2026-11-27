import { memoryRepository } from './workout-repository';
import type { Repository } from '../src/data/repository';
import { presetFor, SplitStore } from '../src/features/splits/store';
import { PlanStore } from '../src/features/plans/store';
import { WorkoutStore } from '../src/data/workout/store';
import { TrainingData } from '../src/features/workout/training-data';
import { readAppData } from '../src/features/home/tiles/read';

// Home's "up next" names the day the chosen split has next, the same day the Split screen and Training tiles show. Made-up days only.
const MON = new Date(2026, 10, 23, 9);
function split(start?: number) {
  const repo = memoryRepository() as unknown as Repository;
  Object.defineProperty(repo, 'syncFlags', { value: { syncedV1Columns: true } });
  const s = new SplitStore(repo), ul = presetFor(s, 'ul')!;
  s.choose({ key: 'ul', name: ul.preset.name, mode: 'weekdays', perWeek: 4, days: ul.drafts, ...(start === undefined ? {} : { start }) }, MON);
  return { repo, s };
}
const name = (repo: Repository, id: string) => String(repo.get('routines', id)?.data.name ?? '');
const cursorDay = (repo: Repository) => { const p = new PlanStore(repo); return name(repo, p.read().days[p.nextIndex()].routineId); };
const same = (repo: Repository, now: Date) => {
  const next = new TrainingData(repo, now.getTime()).plan().next;
  expect(next).not.toBeNull();
  expect(readAppData(new WorkoutStore(repo), now, null).upNext).toBe(`${next!.name} · ${new WorkoutStore(repo).templateExercises(next!.routineId).length} exercises`);
  return next!.name;
};

describe("Home's up next", () => {
  test('a picked starting day is the day Home names, as the Training tiles do', () => {
    const { repo } = split(2);
    const day = same(repo, MON);
    expect(day).not.toBe(cursorDay(repo));
  });
  test('a swapped day is the day Home names, as the Training tiles do', () => {
    const { repo, s } = split();
    s.swap(3, MON);
    const day = same(repo, MON);
    expect(day).not.toBe(cursorDay(repo));
  });
});
