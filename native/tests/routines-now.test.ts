import {
  formatRoutineClock, formatRoutineWait, lastDoseLabel, routineBlockCount, routineClockTime, routineNextItem, routineNowNext, routineSlotIndex, routineSunAxis,
} from '../src/features/routines/model/now';
import { projectRoutineStore } from '../src/features/routines/model/shape';

/* Synthetic rows only. Ported from the pure assertions of the web app's day-view tests. */

const at = (hour: number, minute = 0) => new Date(2026, 10, 19, hour, minute, 0);
const DAY = '2026-11-19';
const morning = { id: 'b1', name: 'Morning routine', order: 0, updatedAt: 1 };
const night = { id: 'b2', name: 'Night routine', order: 1, updatedAt: 1 };

describe('now and next', () => {
  test('the clock and the wait read the way the web shows them', () => {
    expect(formatRoutineClock(at(0, 5))).toBe('12:05 AM');
    expect(formatRoutineClock(at(12, 0))).toBe('12:00 PM');
    expect(formatRoutineClock(at(21, 15))).toBe('9:15 PM');
    expect(routineClockTime(at(4, 7).getTime())).toBe('04:07');
    expect(routineClockTime(0)).toBe('');
    expect(routineClockTime('x')).toBe('');
    expect(formatRoutineWait(0)).toBe('now');
    expect(formatRoutineWait(1)).toBe('in 1 min');
    expect(formatRoutineWait(45)).toBe('in 45 min');
    expect(formatRoutineWait(60)).toBe('in 1 hr');
    expect(formatRoutineWait(120)).toBe('in 2 hr');
    expect(formatRoutineWait(510)).toBe('in 8 hr 30 min');
    expect(formatRoutineWait(-1)).toBe('');
    expect(formatRoutineWait(NaN)).toBe('');
    expect([at(4), at(5), at(11, 59), at(12), at(16, 59), at(17), at(23)].map(routineSlotIndex)).toEqual([2, 0, 0, 1, 1, 2, 2]);
    expect(lastDoseLabel({ status: 'done', at: at(4).getTime() })).toBe('last: 4:00 AM');
    expect(lastDoseLabel({ status: 'skipped', at: at(4).getTime() })).toBe('');
    expect(lastDoseLabel({ status: 'done', rest: true, at: at(4).getTime() })).toBe('');
    expect(lastDoseLabel({ status: 'done', at: 0 })).toBe('');
  });

  test('the routine whose window started last is now, and the next start gives the wait', () => {
    // By their names, Morning runs 5:00 to 11:00 and Night 17:00 to 23:00.
    expect(routineNowNext([morning, night], at(8, 30))).toMatchObject({ nowBlock: morning, nextBlock: night, waitMin: 510 });
    expect(routineNowNext([morning, night], at(14, 0))).toMatchObject({ nowBlock: morning, nextBlock: night, waitMin: 180 });
    expect(routineNowNext([morning, night], at(22, 0))).toMatchObject({ nowBlock: night, nextBlock: morning, waitMin: 420 });
    expect(routineNowNext([morning, night], at(2, 0))).toMatchObject({ nowBlock: night, nextBlock: morning, waitMin: 180 });
    expect(routineNowNext([], at(8))).toEqual({ nowBlock: null, nextBlock: null, waitMin: null, slot: 0 });
    expect(routineNowNext([morning], at(8))).toMatchObject({ nowBlock: morning, nextBlock: null, waitMin: null });
    // A hidden or deleted routine, or one that does not run that weekday, is left out.
    expect(routineNowNext([morning, { ...night, hidden: true }], at(22)).nowBlock).toBe(morning);
    expect(routineNowNext([morning, { ...night, deletedAt: 5 }], at(22)).nowBlock).toBe(morning);
    const weekend = { ...night, days: [5, 6] };
    expect(routineNowNext([morning, weekend], at(22), DAY).nowBlock).toBe(morning);
    expect(routineNowNext([morning, weekend], at(22), '2026-11-21').nowBlock).toBe(weekend);
    // No windows: block order by time of day.
    const a = { id: 'a', name: 'Example A', order: 0 }, b = { id: 'b', name: 'Example B', order: 1 };
    expect(routineNowNext([b, a], at(8))).toMatchObject({ nowBlock: a, nextBlock: b, waitMin: null });
    expect(routineNowNext([b, a], at(20))).toMatchObject({ nowBlock: b, nextBlock: a, waitMin: null });
    // A window the user set wins over the name.
    const own = { id: 'c', name: 'Example C', order: 2, startMin: 600, endMin: 660 };
    expect(routineNowNext([morning, own], at(10, 30)).nowBlock).toBe(own);
  });

  test('the next item is the soonest open one, with overdue ones after it', () => {
    const view = projectRoutineStore({
      blocks: [morning, night],
      items: [{ id: 'i1', name: 'Example A', kind: 'dose', updatedAt: 1 }, { id: 'i2', name: 'Example B', kind: 'check', updatedAt: 1 }, { id: 'i3', name: 'Example C', kind: 'check', updatedAt: 1 }],
      placements: [{ id: 'p1', blockId: 'b1', itemId: 'i1', order: 0, updatedAt: 1 }, { id: 'p2', blockId: 'b2', itemId: 'i2', order: 0, updatedAt: 1 }, { id: 'p3', blockId: 'b2', itemId: 'i3', order: 1, updatedAt: 1 }],
      logs: [],
    });
    expect(routineNextItem(view, at(4, 30), DAY)).toMatchObject({ item: { id: 'i1' }, waitMin: 30, overdue: false });
    // At 1 PM the morning item is overdue, so the night item still to come is named first.
    expect(routineNextItem(view, at(13, 0), DAY)).toMatchObject({ item: { id: 'i2' }, waitMin: 240, overdue: false });
    const logged = projectRoutineStore({ ...view, logs: [{ id: 'l1', itemId: 'i2', day: DAY, status: 'done', at: 1, updatedAt: 1 }, { id: 'l2', itemId: 'i3', day: DAY, status: 'skipped', at: 1, updatedAt: 1 }] });
    expect(routineNextItem(logged, at(13, 0), DAY)).toMatchObject({ item: { id: 'i1' }, overdue: true });
    expect(routineBlockCount(logged, 'b2', DAY)).toMatchObject({ done: 1, total: 2 });
    expect(routineBlockCount(logged, 'b1', DAY)).toMatchObject({ done: 0, total: 1 });
    const all = projectRoutineStore({ ...logged, logs: [...(logged?.logs ?? []), { id: 'l3', itemId: 'i1', day: DAY, status: 'done', at: 1, updatedAt: 1 }] });
    expect(routineNextItem(all, at(13, 0), DAY)).toBeNull();
    expect(routineNextItem(view, new Date(NaN), DAY)).toBeNull();
    expect(routineNextItem(null, at(8), DAY)).toBeNull();
  });

  test('the sun path covers 5 AM to 11 PM, widens to whole hours, and places a late time after midnight', () => {
    const plain = routineSunAxis([]);
    expect([plain.start, plain.end]).toEqual([300, 1380]);
    expect(plain.place(100)).toBe(300);
    expect(plain.place(1400)).toBe(1380);
    expect(plain.place(600)).toBe(600);
    const late = routineSunAxis([{ startMin: 1350, endMin: 1500 }]);
    expect([late.start, late.end]).toEqual([300, 1500]);
    expect(late.place(30)).toBe(1470);
    expect(late.place(200)).toBe(300);
    const early = routineSunAxis([{ startMin: 250, endMin: 310 }]);
    expect([early.start, early.end]).toEqual([240, 1380]);
    const whole = routineSunAxis([{ startMin: 0, endMin: 2000 }]);
    expect(whole.end - whole.start).toBe(1440);
  });
});
