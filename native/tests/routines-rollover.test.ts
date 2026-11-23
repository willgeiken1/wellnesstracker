import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  localCalendarDay, nextDoseCountdown, nextItemCountdown, routineBlockDays, routineBlockRunsOn, routineBlockStartMin, routineBlockWindow,
  routineDayKey, routineDayRolloverHour, routineMinuteOfDay, routineWeekday,
} from '../src/features/routines/model/dose';
import { normalizeRoutineStore } from '../src/features/routines/model/shape';

/* Synthetic rows only. Ported from the pure parts of the web app's
   tests/daily-routines-rollover.test.mjs and tests/daily-routines-dose.test.mjs. */

const at = (year: number, month: number, day: number, hour: number, minute: number, second = 0) => new Date(year, month - 1, day, hour, minute, second);
const NATIVE = join(__dirname, '..');
function inZones(script: string) {
  for (const TZ of ['America/Chicago', 'Pacific/Auckland']) {
    const run = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script], { cwd: NATIVE, env: { ...process.env, TZ }, encoding: 'utf8' });
    expect(`${TZ} ${run.status}\n${run.stdout}\n${run.stderr}`).toBe(`${TZ} 0\n\n`);
  }
}

describe('routine day rollover', () => {
  test('the default hour is 4, the setting stops at 6, and an older hour above 6 is clamped', () => {
    expect(routineDayRolloverHour(undefined)).toBe(4);
    expect(routineDayRolloverHour(4)).toBe(4);
    expect(routineDayRolloverHour(0)).toBe(0);
    expect(routineDayRolloverHour(6)).toBe(6);
    expect(routineDayRolloverHour(7)).toBe(6);
    expect(routineDayRolloverHour(23)).toBe(6);
    expect(routineDayRolloverHour(24)).toBe(6);
    expect(routineDayRolloverHour(99)).toBe(6);
    expect(routineDayRolloverHour(-1)).toBe(4);
    expect(routineDayRolloverHour(4.5)).toBe(4);
    expect(routineDayRolloverHour('4')).toBe(4);
    expect(routineDayKey(new Date(NaN), 4)).toBe('');
    expect(routineDayKey(null, 4)).toBe('');
    const stored = normalizeRoutineStore({
      logs: [{ id: 'log-1', itemId: 'item-a', day: '2026-11-19', status: 'done', amount: 1, unit: 'mg', updatedAt: 10, deletedAt: null }],
      settings: { dayRolloverHour: 23, updatedAt: 8 },
    });
    expect(stored?.settings.dayRolloverHour).toBe(6);
    expect(stored?.settings.updatedAt).toBe(8);
    expect(stored?.logs[0].day).toBe('2026-11-19');
  });

  test('3:59 stays on the previous local day and 4:00 starts the new day', () => {
    expect(routineDayKey(at(2026, 11, 20, 3, 59), 4)).toBe('2026-11-19');
    expect(routineDayKey(at(2026, 11, 20, 3, 59, 59), 4)).toBe('2026-11-19');
    expect(routineDayKey(at(2026, 11, 20, 4, 0), 4)).toBe('2026-11-20');
    expect(routineDayKey(at(2026, 11, 20, 4, 0, 0), 4)).toBe('2026-11-20');
    expect(routineDayKey(at(2026, 11, 20, 1, 0))).toBe('2026-11-19');
    expect(routineDayKey(at(2026, 3, 1, 3, 59), 4)).toBe('2026-02-28');
    expect(routineDayKey(at(2026, 1, 1, 1, 0), 4)).toBe('2025-12-31');
    expect(routineDayKey(at(2026, 3, 8, 3, 30), 4)).toBe('2026-03-07');
  });

  test('a custom hour moves the boundary and midnight is hour 0', () => {
    expect(routineDayKey(at(2026, 11, 20, 5, 59), 6)).toBe('2026-11-19');
    expect(routineDayKey(at(2026, 11, 20, 6, 0), 6)).toBe('2026-11-20');
    expect(routineDayKey(at(2026, 11, 20, 0, 0), 0)).toBe('2026-11-20');
    expect(routineDayKey(at(2026, 11, 19, 23, 59), 0)).toBe('2026-11-19');
    expect(routineDayKey(at(2026, 11, 20, 0, 59), 1)).toBe('2026-11-19');
    expect(routineDayKey(at(2026, 11, 20, 1, 0), 1)).toBe('2026-11-20');
  });

  test("travel uses the phone's current zone, not the UTC date", () => {
    inZones(`
      import assert from "node:assert/strict";
      import { routineDayKey } from "./src/features/routines/model/dose.ts";
      const at = (iso) => new Date(iso);
      if (process.env.TZ === "America/Chicago") {
        const before = at("2026-11-20T09:59:00.000Z");
        assert.equal(before.getHours(), 3);
        assert.equal(before.getMinutes(), 59);
        assert.equal(routineDayKey(before, 4), "2026-11-19");
        assert.equal(before.toISOString().slice(0, 10), "2026-11-20");
        const on = at("2026-11-20T10:00:00.000Z");
        assert.equal(on.getHours(), 4);
        assert.equal(on.getMinutes(), 0);
        assert.equal(routineDayKey(on, 4), "2026-11-20");
        const custom = at("2026-11-20T11:30:00.000Z");
        assert.equal(custom.getHours(), 5);
        assert.equal(routineDayKey(custom, 4), "2026-11-20");
        assert.equal(routineDayKey(custom, 6), "2026-11-19");
      } else if (process.env.TZ === "Pacific/Auckland") {
        const before = at("2026-11-19T14:59:00.000Z");
        assert.equal(before.getHours(), 3);
        assert.equal(before.getMinutes(), 59);
        assert.equal(routineDayKey(before, 4), "2026-11-19");
        const on = at("2026-11-19T15:00:00.000Z");
        assert.equal(on.getHours(), 4);
        assert.equal(on.getMinutes(), 0);
        assert.equal(routineDayKey(on, 4), "2026-11-20");
        assert.notEqual(on.toISOString().slice(0, 10), routineDayKey(on, 4));
      } else {
        throw new Error("unexpected tz " + process.env.TZ);
      }
    `);
  });
});

describe('next dose countdown', () => {
  test('the next dose uses the local block time and the pinned day', () => {
    const item = { id: 'item-a', kind: 'dose' };
    const morning = [{ id: 'morning', name: 'Morning routine' }];
    const placements = [{ itemId: 'item-a', blockId: 'morning' }];
    const atFour = new Date(2026, 10, 19, 4, 0, 0);
    expect(nextDoseCountdown({ item, blocks: morning, placements, logs: [], date: atFour, day: '2026-11-19' })?.waitMin).toBe(60);
    // Nov 18 is already covered, and Nov 19's 5:00 AM dose is one hour away.
    expect(nextDoseCountdown({ item, blocks: morning, placements, logs: [{ itemId: 'item-a', day: '2026-11-18', status: 'done' }], date: atFour, day: '2026-11-18' })?.waitMin).toBe(60);
    expect(nextDoseCountdown({ item, blocks: morning, placements, logs: [{ itemId: 'item-a', day: '2026-11-19', status: 'skipped' }], date: atFour, day: '2026-11-19' })?.waitMin).toBe(1500);
    expect(nextDoseCountdown({ item, blocks: [{ id: 'morning', name: 'Custom block' }], placements, logs: [], date: atFour, day: '2026-11-19' })).toBeNull();
    expect(nextDoseCountdown({ item: { id: 'item-a', kind: 'check' }, blocks: morning, placements, logs: [], date: atFour, day: '2026-11-19' })).toBeNull();
    expect(nextItemCountdown({ item: { id: 'item-a', kind: 'check' }, blocks: morning, placements, logs: [], date: atFour, day: '2026-11-19' })?.waitMin).toBe(60);
    const night = [{ id: 'night', name: 'Night routine' }];
    expect(nextDoseCountdown({ item, blocks: night, placements: [{ itemId: 'item-a', blockId: 'night' }], logs: [], date: new Date(2026, 10, 19, 8, 30, 0), day: '2026-11-19' })?.waitMin).toBe(510);
    // Placed in both: the sooner block wins.
    expect(nextDoseCountdown({ item, blocks: [...morning, ...night], placements: [...placements, { itemId: 'item-a', blockId: 'night' }], logs: [], date: new Date(2026, 10, 19, 8, 30, 0), day: '2026-11-19' })?.waitMin).toBe(510);
    expect(localCalendarDay(new Date(2026, 10, 19, 4, 0, 0))).toBe('2026-11-19');
  });

  test('a block window, its weekdays and a minute of the day are read strictly', () => {
    expect(routineMinuteOfDay(0)).toBe(0);
    expect(routineMinuteOfDay(1439)).toBe(1439);
    expect(routineMinuteOfDay(1440)).toBeNull();
    expect(routineMinuteOfDay(-1)).toBeNull();
    expect(routineMinuteOfDay(1.5)).toBeNull();
    expect(routineMinuteOfDay('300')).toBeNull();
    expect(routineBlockStartMin({ name: 'Morning routine' })).toBe(300);
    expect(routineBlockStartMin({ name: 'Custom block' })).toBeNull();
    expect(routineBlockWindow({ name: 'Custom block', startMin: 600, endMin: 660 })).toEqual({ startMin: 600, endMin: 660, own: true });
    expect(routineBlockWindow({ name: 'Custom block' })).toBeNull();
    expect(routineBlockDays({ days: [0, 2, 4] })).toEqual([0, 2, 4]);
    expect(routineBlockDays({})).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(routineWeekday('2026-11-16')).toBe(0);
    expect(routineWeekday('2026-11-22')).toBe(6);
    expect(routineBlockRunsOn({ days: [0] }, '2026-11-16')).toBe(true);
    expect(routineBlockRunsOn({ days: [0] }, '2026-11-17')).toBe(false);
    expect(routineBlockRunsOn({}, '2026-11-17')).toBe(true);
  });

  test('local day and countdown follow a non-UTC zone across midnight', () => {
    inZones(`
      import assert from "node:assert/strict";
      import { localCalendarDay, nextDoseCountdown } from "./src/features/routines/model/dose.ts";
      const item = { id: "item-a", kind: "dose" };
      const blocks = [{ id: "morning", name: "Morning routine" }];
      const placements = [{ itemId: "item-a", blockId: "morning" }];
      const countdown = (date, day, logs) => nextDoseCountdown({ item, blocks, placements, logs, date, day }).waitMin;
      if (process.env.TZ === "America/Chicago") {
        const evening = new Date("2026-11-20T05:30:00.000Z");
        assert.equal(localCalendarDay(evening), "2026-11-19");
        assert.equal(countdown(evening, "2026-11-19", []), 330);
        const midnight = new Date("2026-11-20T06:00:00.000Z");
        assert.equal(localCalendarDay(midnight), "2026-11-20");
        assert.equal(midnight.getHours(), 0);
        assert.equal(countdown(midnight, "2026-11-20", []), 300);
        const spring = new Date(2026, 2, 8, 1, 30, 0);
        assert.equal(countdown(spring, "2026-03-08", []), 150);
        const fall = new Date(2026, 10, 1, 1, 30, 0);
        assert.equal(countdown(fall, "2026-11-01", []), 270);
      } else if (process.env.TZ === "Pacific/Auckland") {
        const early = new Date("2026-11-18T15:00:00.000Z");
        assert.equal(localCalendarDay(early), "2026-11-19");
        assert.equal(early.getHours(), 4);
        assert.notEqual(early.toISOString().slice(0, 10), "2026-11-19");
        assert.equal(countdown(early, "2026-11-19", []), 60);
        assert.equal(countdown(early, "2026-11-19", [{ itemId: "item-a", day: "2026-11-19", status: "done" }]), 1500);
        assert.equal(countdown(early, "2026-11-19", [{ itemId: "item-a", day: "2026-11-18", status: "done" }]), 60);
      } else {
        throw new Error("unexpected tz " + process.env.TZ);
      }
    `);
  });
});
