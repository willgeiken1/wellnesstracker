import { scoreDays } from '../src/features/score/days';
import type { Repository } from '../src/data/repository';
import { memoryRepository } from './workout-repository';

/** Made-up days and cardio only. */
const DAYS = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const store = (repo: Repository) => ({ repo, trainingHistory: () => [], active: () => null }) as never;

describe('the day score counts logged cardio as training', () => {
  test('a cardio-only day has a full training pillar and later days count it toward the week', () => {
    const repo = memoryRepository() as unknown as Repository;
    expect(scoreDays({ store: store(repo), days: DAYS }).map(p => p.training)).toEqual(DAYS.map(() => null));
    repo.save('cardio_sessions', { day: '2026-11-17', kind: 'run', duration_ms: 30 * 60000, distance_m: 5000, notes: '' });
    const training = scoreDays({ store: store(repo), days: DAYS }).map(p => p.training);
    expect(training.slice(0, 3)).toEqual([null, null, null]);
    expect(training[3]).toBe(100);
    // With 3 a week as the plan, one cardio day in the last 7 is a third of the week.
    expect(training[4]).toBe(33);
  });

  test('cardio logged after the last day shown is not counted', () => {
    const repo = memoryRepository() as unknown as Repository;
    repo.save('cardio_sessions', { day: '2026-11-25', kind: 'ride', duration_ms: 45 * 60000, distance_m: null, notes: '' });
    expect(scoreDays({ store: store(repo), days: DAYS }).every(p => p.training == null)).toBe(true);
  });
});
