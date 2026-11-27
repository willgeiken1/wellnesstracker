import { randomUUID } from 'node:crypto';
import { localDatabase } from './server/sqlite';
import { Repository } from '../src/data/repository';
import { DEVICE_A } from '../fixtures/sync';
import { SplitStore } from '../src/features/splits/store';
import { presetFor } from '../src/features/splits/store';
import { PlanStore } from '../src/features/plans/store';
jest.mock('expo-sqlite', () => require('./server/expo-sqlite-stub'));

// A split, where it has got to and how it runs are kept on the phone's own database, so they come back after the app is
// closed and opened again (a new Repository on the same database). Made-up days only.
const MON = new Date(2026, 10, 23, 9), TUE = new Date(2026, 10, 24, 9);

test('the split, a skipped day and its schedule come back after a reload', async () => {
  const { db } = await localDatabase();
  const first = new SplitStore(new Repository(db, 'demo', DEVICE_A, randomUUID));
  const ul = presetFor(first, 'ul')!;
  first.choose({ key: 'ul', name: ul.preset.name, mode: 'rotate', perWeek: 4, days: ul.drafts, start: 0 }, MON);
  first.skip(MON);

  // Reopened: the same split, its days with their exercises, and today's skip.
  const again = new SplitStore(new Repository(db, 'demo', DEVICE_A, randomUUID));
  const v = again.view(MON)!;
  expect(v.def).toMatchObject({ key: 'ul', name: 'Upper Lower', mode: 'rotate', perWeek: 4 });
  expect(v.days.map(d => d.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  expect(v.days[0].exercises[0]).toMatchObject({ name: 'Bench Press', sets: 4, repMin: 5, repMax: 8 });
  expect(v.now).toMatchObject({ kind: 'skipped', focus: 0 });
  // The next day the skipped day is the session, carried over.
  expect(again.view(TUE)!.now).toMatchObject({ kind: 'planned', focus: 0, carried: true });

  // A split day started and finished, then a reload: the split has moved on.
  const session = again.startDay(v.days[0].routineId, TUE.getTime());
  again.workout.repo.save('sessions', { ...again.workout.active()!.data, finished_at: TUE.getTime() + 3_600_000 }, session.id);
  const third = new SplitStore(new Repository(db, 'demo', DEVICE_A, randomUUID));
  expect(third.view(TUE)!.now).toMatchObject({ kind: 'done' });
  expect(third.view(TUE)!.days[third.view(TUE)!.now.focus].name).toBe('Lower A');

  // Set weekdays and the weekday each day falls on are kept too, and the plan store reads the same days.
  third.setMode('weekdays');
  third.setWeekday(6, 3);
  const fourth = new SplitStore(new Repository(db, 'demo', DEVICE_A, randomUUID));
  const w = fourth.view(TUE)!;
  expect(w.def.mode).toBe('weekdays');
  expect(w.def.week[6]).toBe(3);
  expect(new PlanStore(fourth.repo).read().days.map(d => d.routineId)).toEqual(w.days.map(d => d.routineId));
}, 60000);
