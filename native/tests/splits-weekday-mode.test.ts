import { memoryRepository } from './workout-repository';
import type { Repository } from '../src/data/repository';
import { presetFor, SplitStore } from '../src/features/splits/store';
import { PlanStore } from '../src/features/plans/store';

// Set weekdays stays Set weekdays while a day has no weekday yet, once the synced plan row decides the mode. Made-up days only.
const MON = new Date(2026, 10, 23, 9);
function weekdaySplit() {
  const repo = memoryRepository() as unknown as Repository;
  Object.defineProperty(repo, 'syncFlags', { value: { syncedV1Columns: true } });
  const s = new SplitStore(repo), ul = presetFor(s, 'ul')!;
  s.choose({ key: 'ul', name: ul.preset.name, mode: 'weekdays', perWeek: 4, days: ul.drafts }, MON);
  return s;
}

describe('a weekday split with a day that has no weekday', () => {
  test('adding a day keeps Set weekdays', () => {
    const s = weekdaySplit();
    expect(s.def()!.mode).toBe('weekdays');
    s.addDay('Synthetic Arms');
    expect(s.def()!.mode).toBe('weekdays');
    expect(s.def()!.days).toHaveLength(5);
    expect(new PlanStore(s.repo).read().mode).toBe('fixed');
  });
  test("taking a day's last weekday away keeps Set weekdays", () => {
    const s = weekdaySplit();
    const week = s.def()!.week, wd = week.findIndex(w => w === 0);
    for (let i = 0; i < 7; i++) if (week[i] === 0) s.setWeekday(i, -1);
    expect(wd).toBeGreaterThanOrEqual(0);
    expect(s.def()!.mode).toBe('weekdays');
    // The other days still run on their weekdays.
    expect(new PlanStore(s.repo).read().days.length).toBeGreaterThan(0);
  });
});
