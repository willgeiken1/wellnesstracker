import { logItem, logRest, saveItem, setDayRollover, skipItem, undoLog } from '../src/features/routines/model/actions';
import { loggedAmountText } from '../src/features/routines/model/day';
import { routineDayKey } from '../src/features/routines/model/dose';
import {
  compoundDoseHistory, editLog, formatHistoryDay, historyStatus, latestLogId, LOG_DETAILS_REFUSED, LOG_EDIT_REFUSED, LOG_TIME_HINT, LOG_UNIT_HINT, LOGGED_AMOUNTS_HINT, logDraft, logTimeEditable,
  SAME_SITE_HINT, SAME_SITE_WARNING, sameSiteWarning, SITE_OPTIONAL_HINT,
} from '../src/features/routines/model/edit-log';
import { routineHistoryView } from '../src/features/routines/model/history';
import { routineLogId } from '../src/features/routines/model/ids';
import { emptyRoutineStore, lastRoutineSite, liveOf, projectRoutineStore, type RoutineStore } from '../src/features/routines/model/shape';

/* Synthetic rows only. The rules follow the web app's dose, details and site tests. */

const DAY = '2026-11-19';
const clock = (now = 1000, day = DAY) => ({ now, day });
const LOG_NOTE = 'qq4419-scribble-text';
function ids() { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [{ id: 'b-morning', name: 'Morning routine', color: 'citrus', order: 0, updatedAt: 1, deletedAt: null }] };
}
function logged(unit = 'mcg') {
  const newId = ids();
  const dose = must(saveItem(seeded(), { name: 'Example Compound A', kind: 'dose', amount: '250', unit, blockIds: ['b-morning'] }, clock(10), newId));
  const check = must(saveItem(dose.store, { name: 'Example Check', kind: 'check', blockIds: ['b-morning'] }, clock(11), newId));
  let store = must(logItem(check.store, dose.itemId, clock(100)));
  store = must(logItem(store, check.itemId, clock(101)));
  return { store, doseId: dose.itemId, checkId: check.itemId, doseLog: routineLogId(dose.itemId, DAY), checkLog: routineLogId(check.itemId, DAY), newId };
}
const live = (store: RoutineStore, itemId: string) => liveOf(store.logs).filter(row => row.itemId === itemId);
/** The moment `at`, at the same clock time on routine day `day`: before the hour a day starts it is the next calendar morning. */
function sameClockOn(day: string, at: number, rollover = 4): number {
  const was = new Date(at), [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date + (was.getHours() < rollover ? 1 : 0), was.getHours(), was.getMinutes(), was.getSeconds(), was.getMilliseconds()).getTime();
}

describe('editing the amount on a log', () => {
  test('a different amount is kept as typed, marks the log partial, and leaves the item alone', () => {
    const { store, doseId, doseLog } = logged();
    const edited = must(editLog(store, doseLog, { amount: '0.25', day: DAY }, clock(200)));
    expect(edited.logId).toBe(doseLog);
    expect(live(edited.store, doseId)).toEqual([expect.objectContaining({ id: doseLog, amount: 0.25, unit: 'mcg', status: 'partial', day: DAY, at: 100, updatedAt: 200 })]);
    expect(edited.store.compounds).toEqual(store.compounds);
    expect(edited.store.items).toEqual(store.items);
    expect(loggedAmountText(live(edited.store, doseId)[0])).toBe('0.25 mcg');
    // Typing the amount saved on the item again is a full log.
    expect(live(must(editLog(edited.store, doseLog, { amount: '250', day: DAY }, clock(201))).store, doseId)[0]).toMatchObject({ amount: 250, status: 'done' });
    // The same amount again keeps the status it had.
    expect(live(must(editLog(edited.store, doseLog, { amount: '1/4', day: DAY }, clock(202))).store, doseId)[0]).toMatchObject({ amount: 0.25, status: 'partial' });
  });

  test('500 mcg is not 500 mg: a unit is never converted on the log', () => {
    const { store, doseId, doseLog } = logged('mg');
    const inMcg = { ...store, logs: store.logs.map(row => (row.id === doseLog ? { ...row, unit: 'mcg', amount: 7 } : row)) };
    // The item says 250 mg. The log is in mcg.
    expect(live(must(editLog(inMcg, doseLog, { amount: '250', day: DAY }, clock(200))).store, doseId)[0]).toMatchObject({ amount: 250, unit: 'mcg', status: 'partial' });
    expect(live(must(editLog(inMcg, doseLog, { amount: '250000', day: DAY }, clock(200))).store, doseId)[0]).toMatchObject({ amount: 250000, unit: 'mcg', status: 'done' });
    const inIu = { ...store, logs: store.logs.map(row => (row.id === doseLog ? { ...row, unit: 'IU', amount: 7 } : row)) };
    expect(live(must(editLog(inIu, doseLog, { amount: '250', day: DAY }, clock(200))).store, doseId)[0]).toMatchObject({ amount: 250, unit: 'IU', status: 'partial' });
  });

  test('a blank, zero or negative amount, a bad day or a later day is refused', () => {
    const { store, doseLog, checkLog } = logged();
    expect(editLog(store, doseLog, { amount: '', day: DAY }, clock())).toBeNull();
    expect(editLog(store, doseLog, { amount: '0', day: DAY }, clock())).toBeNull();
    expect(editLog(store, doseLog, { amount: '-1', day: DAY }, clock())).toBeNull();
    expect(editLog(store, doseLog, { amount: '1,000', day: DAY }, clock())).toBeNull();
    expect(editLog(store, doseLog, { amount: '250', day: '2026-11-20' }, clock())).toBeNull();
    expect(editLog(store, doseLog, { amount: '250', day: '2026-02-30' }, clock())).toBeNull();
    expect(editLog(store, doseLog, { amount: '250' }, clock())).toBeNull();
    expect(editLog(store, 'missing', { amount: '250', day: DAY }, clock())).toBeNull();
    expect(editLog(store, doseLog, null, clock())).toBeNull();
    expect(editLog(store, doseLog, { amount: '250', day: DAY }, { now: 1, day: 'bad' })).toBeNull();
    // A missing amount keeps the one on the log.
    expect(must(editLog(store, doseLog, { day: DAY }, clock(200))).store.logs.find(row => row.id === doseLog)).toMatchObject({ amount: 250, status: 'done' });
    // A check has no amount to enter.
    expect(must(editLog(store, checkLog, { amount: '5', day: DAY }, clock(200))).store.logs.find(row => row.id === checkLog)).toMatchObject({ amount: null, unit: '', status: 'done' });
    const rest = must(logRest({ ...store, logs: [] }, clock(300)));
    expect(editLog(rest, routineLogId(null, DAY), { day: DAY }, clock())).toBeNull();
    const undone = must(undoLog(store, doseLog, clock(300)));
    expect(editLog(undone, doseLog, { amount: '250', day: DAY }, clock(301))).toBeNull();
  });

  test('a skip stays a skip and keeps no amount', () => {
    const { store, doseId, doseLog } = logged();
    const skipped = must(skipItem(must(undoLog(store, doseLog, clock(300))), doseId, clock(301)));
    const moved = must(editLog(skipped, doseLog, { amount: '250', day: '2026-11-18' }, clock(302)));
    expect(live(moved.store, doseId)).toEqual([expect.objectContaining({ day: '2026-11-18', status: 'skipped', amount: null, unit: '' })]);
    expect(editLog(skipped, doseLog, { day: DAY, site: 'left-thigh' }, clock(303))).toBeNull();
  });

  test('an item turned into a check keeps the amount on its old log', () => {
    const { store, doseId, doseLog, newId } = logged();
    const asCheck = must(saveItem(store, { itemId: doseId, name: 'Example Compound A', kind: 'check', blockIds: ['b-morning'] }, clock(300), newId)).store;
    expect(logDraft(asCheck, doseLog, DAY)).toMatchObject({ kind: 'dose', amount: '250', unit: 'mcg' });
    expect(live(must(editLog(asCheck, doseLog, { amount: '125', day: DAY }, clock(301))).store, doseId)[0]).toMatchObject({ amount: 125, unit: 'mcg', status: 'partial' });
  });
});

describe('moving a log to another day', () => {
  test('the log takes the day that was picked and that day\'s row id, and the old row goes', () => {
    const { store, doseId, doseLog } = logged();
    const moved = must(editLog(store, doseLog, { amount: '0.25', day: '2026-11-15' }, clock(200)));
    expect(moved.logId).toBe(routineLogId(doseId, '2026-11-15'));
    expect(moved.logId).not.toBe(doseLog);
    expect(live(moved.store, doseId)).toEqual([expect.objectContaining({ id: moved.logId, day: '2026-11-15', amount: 0.25, unit: 'mcg', status: 'partial', at: sameClockOn('2026-11-15', 100) })]);
    const old = moved.store.logs.find(row => row.id === doseLog);
    expect(old?.deletedAt).toBeGreaterThan(0);
    expect(old?.undone).toBeUndefined(); // moved, not undone: nothing to restore on the old day
    // History shows it on the day it keeps, and today is open again.
    const month = routineHistoryView(projectRoutineStore(moved.store), { month: '2026-11', day: '2026-11-15', today: DAY });
    expect(month.days.find(row => row.day === '2026-11-15')?.items.find(row => row.itemId === doseId)).toMatchObject({ mark: 'partial', log: { amount: 0.25, unit: 'mcg' } });
    expect(month.days.find(row => row.day === DAY)?.items.find(row => row.itemId === doseId)).toMatchObject({ mark: 'open', log: null });
    // The item can be logged again today, as a new row.
    const again = must(logItem(moved.store, doseId, clock(300)));
    expect(live(again, doseId).map(row => row.day).sort()).toEqual(['2026-11-15', DAY]);
  });

  test('a day that already has a log for the item stays as it is', () => {
    const { store, doseId, doseLog } = logged();
    const earlier = must(logItem(store, doseId, clock(50, '2026-11-18')));
    expect(editLog(earlier, doseLog, { amount: '250', day: '2026-11-18' }, clock(200))).toBeNull();
    expect(must(editLog(earlier, doseLog, { amount: '250', day: '2026-11-17' }, clock(200))).logId).toBe(routineLogId(doseId, '2026-11-17'));
    // A day whose log was undone is free, and the move takes over that row.
    const freed = must(undoLog(earlier, routineLogId(doseId, '2026-11-18'), clock(300)));
    const taken = must(editLog(freed, doseLog, { amount: '125', day: '2026-11-18' }, clock(301)));
    expect(live(taken.store, doseId)).toEqual([expect.objectContaining({ id: routineLogId(doseId, '2026-11-18'), amount: 125, deletedAt: null })]);
    expect(live(taken.store, doseId)[0].undone).toBeUndefined();
    expect(live(taken.store, doseId)[0].updatedAt).toBeGreaterThan(300);
  });

  test('a time is written only on an earlier day, in the phone\'s own zone', () => {
    const { store, doseId, doseLog } = logged();
    expect(logTimeEditable('2026-11-18', DAY)).toBe(true);
    expect(logTimeEditable(DAY, DAY)).toBe(false);
    // Today: the typed time is ignored and the logged clock stays.
    expect(live(must(editLog(store, doseLog, { amount: '250', day: DAY, time: '07:30' }, clock(200))).store, doseId)[0].at).toBe(100);
    const earlier = must(editLog(store, doseLog, { amount: '250', day: '2026-11-18', time: '7:30' }, clock(200)));
    expect(live(earlier.store, doseId)[0].at).toBe(new Date(2026, 10, 18, 7, 30).getTime());
    expect(logDraft(earlier.store, earlier.logId, DAY)).toMatchObject({ day: '2026-11-18', time: '07:30', maxDay: DAY });
    // Blank keeps the logged clock time, on the day the log now has. A bad time is refused.
    expect(live(must(editLog(store, doseLog, { amount: '250', day: '2026-11-18', time: '  ' }, clock(200))).store, doseId)[0].at).toBe(sameClockOn('2026-11-18', 100));
    expect(editLog(store, doseLog, { amount: '250', day: '2026-11-18', time: '25:00' }, clock(200))).toBeNull();
    expect(editLog(store, doseLog, { amount: '250', day: '2026-11-18', time: 'noon' }, clock(200))).toBeNull();
    expect(editLog(store, doseLog, { amount: '250', day: '2026-11-18', time: 730 }, clock(200))).toBeNull();
  });
});

describe('a note and an injection site', () => {
  test('a note is stored only when the draft has one, and a blank clears it', () => {
    const { store, doseId, doseLog } = logged();
    const noted = must(editLog(store, doseLog, { amount: '250', day: DAY, note: `  ${LOG_NOTE}  ` }, clock(200))).store;
    expect(live(noted, doseId)[0].note).toBe(LOG_NOTE);
    expect(live(must(editLog(noted, doseLog, { amount: '250', day: DAY }, clock(201))).store, doseId)[0].note).toBe(LOG_NOTE);
    expect(live(must(editLog(noted, doseLog, { amount: '250', day: DAY, note: ' ' }, clock(201))).store, doseId)[0].note).toBeUndefined();
    expect(editLog(noted, doseLog, { amount: '250', day: DAY, note: 5 }, clock(201))).toBeNull();
    expect(live(must(editLog(noted, doseLog, { amount: '250', day: DAY, note: 'n'.repeat(400) }, clock(201))).store, doseId)[0].note).toHaveLength(280);
    // The note moves with the log.
    expect(live(must(editLog(noted, doseLog, { amount: '250', day: '2026-11-17' }, clock(202))).store, doseId)[0]).toMatchObject({ day: '2026-11-17', note: LOG_NOTE });
  });

  test('a site is optional, only one of the eight is kept, and a check cannot store one', () => {
    const { store, doseId, doseLog, checkLog } = logged();
    const sited = must(editLog(store, doseLog, { amount: '250', day: DAY, site: ' left-thigh ' }, clock(200))).store;
    expect(live(sited, doseId)[0].site).toBe('left-thigh');
    expect(live(must(editLog(sited, doseLog, { amount: '250', day: DAY }, clock(201))).store, doseId)[0].site).toBe('left-thigh');
    expect(live(must(editLog(sited, doseLog, { amount: '250', day: DAY, site: '' }, clock(201))).store, doseId)[0].site).toBeUndefined();
    expect(editLog(sited, doseLog, { amount: '250', day: DAY, site: 'left-elbow' }, clock(201))).toBeNull();
    expect(editLog(sited, doseLog, { amount: '250', day: DAY, site: 4 }, clock(201))).toBeNull();
    expect(editLog(store, checkLog, { day: DAY, site: 'left-thigh' }, clock(201))).toBeNull();
    expect(must(editLog(store, checkLog, { day: DAY, site: '' }, clock(201))).store.logs.find(row => row.id === checkLog)?.site).toBeUndefined();
    expect(logDraft(sited, doseLog, DAY)).toMatchObject({ site: 'left-thigh', kind: 'dose' });
  });

  test('the same site as last time warns once and never blocks the save', () => {
    const { store, doseId, doseLog } = logged();
    const earlier = must(logItem(store, doseId, clock(50, '2026-11-18')));
    const sited = must(editLog(earlier, routineLogId(doseId, '2026-11-18'), { amount: '250', day: '2026-11-18', site: 'left-thigh' }, clock(60))).store;
    const lastSite = lastRoutineSite(sited, doseId, doseLog);
    expect(lastSite).toBe('left-thigh');
    expect(sameSiteWarning({ site: 'left-thigh', lastSite })).toBe(true);
    expect(sameSiteWarning({ site: 'left-thigh', lastSite, siteDismissed: 'left-thigh' })).toBe(false);
    expect(sameSiteWarning({ site: 'right-thigh', lastSite })).toBe(false);
    expect(sameSiteWarning({ site: '', lastSite })).toBe(false);
    expect(sameSiteWarning(null)).toBe(false);
    expect(must(editLog(sited, doseLog, { amount: '250', day: DAY, site: 'left-thigh' }, clock(200))).store.logs.find(row => row.id === doseLog)?.site).toBe('left-thigh');
  });

  test('what the sheets say is the same as on the web', () => {
    expect(LOG_EDIT_REFUSED).toBe('Enter an amount and a day up to today. A day that already has a log stays as it is.');
    expect(LOG_DETAILS_REFUSED).toBe('Enter an amount and a day up to today. A day that already has a log stays as it is. On an earlier day, leave the time blank or use hours and minutes.');
    expect(SAME_SITE_WARNING).toBe('Same site as last time.');
    expect(SAME_SITE_HINT).toBe('You can dismiss this and still save.');
    expect(SITE_OPTIONAL_HINT).toBe('A site is optional. Saving does not require one.');
    expect(LOG_UNIT_HINT).toBe('This is the unit already on the log.');
    expect(LOGGED_AMOUNTS_HINT).toBe('Logged amounts. Changing the item amount does not change them.');
    expect(LOG_TIME_HINT).toBe('Shown when the day is before today. Leave it blank to keep the logged time.');
  });
});

describe('a log\'s time around the hour a new day starts', () => {
  /* A dose taken at 02:30:17 on the calendar morning of Nov 21. With the day starting at 04:00 it belongs to
     routine day Nov 20. It is edited two routine days later. */
  const TAKEN = new Date(2026, 10, 21, 2, 30, 17).getTime();
  const LATER = new Date(2026, 10, 22, 9, 0).getTime();
  const late = (now = LATER) => ({ now, day: '2026-11-22' });
  const local = (month: number, date: number, hour: number, minute: number) => new Date(2026, month - 1, date, hour, minute).getTime();
  function lateLog(hour = 4, taken = TAKEN) {
    const newId = ids();
    const dose = must(saveItem(seeded(), { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: ['b-morning'] }, clock(10), newId));
    const set = hour === 4 ? dose.store : must(setDayRollover(dose.store, hour, clock(20)));
    const day = routineDayKey(new Date(taken), hour);
    const store = must(logItem(set, dose.itemId, { now: taken, day }));
    return { store, doseId: dose.itemId, logId: routineLogId(dose.itemId, day), day };
  }
  const atOf = (store: RoutineStore, doseId: string) => live(store, doseId)[0].at;

  test('saving a note on a dose logged before the rollover hour leaves its day and its moment alone', () => {
    const { store, doseId, logId, day } = lateLog();
    expect(day).toBe('2026-11-20');
    const draft = must(logDraft(store, logId, '2026-11-22'));
    expect(draft).toMatchObject({ day: '2026-11-20', time: '02:30' });
    // The sheet sends the day and the time it opened with, and only the note is new.
    const saved = must(editLog(store, logId, { amount: draft.amount, day: draft.day, time: draft.time, note: LOG_NOTE }, late()));
    expect(saved.logId).toBe(logId);
    expect(live(saved.store, doseId)[0]).toMatchObject({ day: '2026-11-20', at: TAKEN, note: LOG_NOTE });
    expect(routineDayKey(new Date(atOf(saved.store, doseId)), 4)).toBe('2026-11-20');
    // The same time written another way is still the same time.
    expect(atOf(must(editLog(store, logId, { amount: '250', day: '2026-11-20', time: ' 2:30 ' }, late())).store, doseId)).toBe(TAKEN);
    // Saved twice, it still has not moved.
    expect(atOf(must(editLog(saved.store, logId, { amount: '250', day: '2026-11-20', time: '02:30', site: 'left-thigh' }, late(LATER + 1000))).store, doseId)).toBe(TAKEN);
  });

  test('a new time on the same routine day lands on the right calendar day either side of the rollover hour', () => {
    const { store, doseId, logId } = lateLog();
    const edit = (time: string) => atOf(must(editLog(store, logId, { amount: '250', day: '2026-11-20', time }, late())).store, doseId);
    expect(edit('02:31')).toBe(local(11, 21, 2, 31));
    expect(edit('00:00')).toBe(local(11, 21, 0, 0));
    expect(edit('03:59')).toBe(local(11, 21, 3, 59));
    expect(edit('04:00')).toBe(local(11, 20, 4, 0));
    expect(edit('23:59')).toBe(local(11, 20, 23, 59));
    for (const time of ['00:00', '02:31', '03:59', '04:00', '12:00', '23:59']) expect([time, routineDayKey(new Date(edit(time)), 4)]).toEqual([time, '2026-11-20']);
  });

  test('moved to another day with its time untouched, it keeps that time on the new routine day', () => {
    const { store, doseId, logId } = lateLog();
    const moved = must(editLog(store, logId, { amount: '250', day: '2026-11-19', time: '02:30' }, late()));
    expect(moved.logId).toBe(routineLogId(doseId, '2026-11-19'));
    expect(live(moved.store, doseId)).toEqual([expect.objectContaining({ day: '2026-11-19', at: local(11, 20, 2, 30) })]);
    expect(logDraft(moved.store, moved.logId, '2026-11-22')).toMatchObject({ day: '2026-11-19', time: '02:30' });
    // Yesterday is the latest day a time can be typed for, and a time before the rollover hour is this calendar morning.
    const yesterday = must(editLog(store, logId, { amount: '250', day: '2026-11-21', time: '03:10' }, late()));
    expect(atOf(yesterday.store, doseId)).toBe(local(11, 22, 3, 10));
    expect(atOf(yesterday.store, doseId)).toBeLessThan(LATER);
  });

  test('moved to another day with the time left blank, it is stamped again at the same clock time on that routine day', () => {
    // Taken at 21:15:42 on Nov 20, well after the day started.
    const evening = lateLog(4, new Date(2026, 10, 20, 21, 15, 42).getTime());
    for (const time of ['', '   ', undefined, null]) {
      const moved = must(editLog(evening.store, evening.logId, { amount: '250', day: '2026-11-18', ...(time === undefined ? {} : { time }) }, late()));
      const at = atOf(moved.store, evening.doseId);
      expect(at).toBe(new Date(2026, 10, 18, 21, 15, 42).getTime());
      expect(routineDayKey(new Date(at), 4)).toBe('2026-11-18');
      expect(logDraft(moved.store, moved.logId, '2026-11-22')).toMatchObject({ day: '2026-11-18', time: '21:15' });
    }
    // Taken at 02:30:17, before the day starts: on routine day Nov 18 that is the calendar morning of Nov 19.
    const { store, doseId, logId } = lateLog();
    const moved = must(editLog(store, logId, { amount: '250', day: '2026-11-18', time: '' }, late()));
    expect(live(moved.store, doseId)).toEqual([expect.objectContaining({ day: '2026-11-18', at: new Date(2026, 10, 19, 2, 30, 17).getTime() })]);
    expect(routineDayKey(new Date(atOf(moved.store, doseId)), 4)).toBe('2026-11-18');
    // The hour the person chose decides which calendar morning that is.
    const six = lateLog(6, local(11, 21, 5, 59));
    const sixMoved = must(editLog(six.store, six.logId, { amount: '250', day: '2026-11-17', time: '' }, late()));
    expect(atOf(sixMoved.store, six.doseId)).toBe(local(11, 18, 5, 59));
    expect(routineDayKey(new Date(atOf(sixMoved.store, six.doseId)), 6)).toBe('2026-11-17');
    // Moved to today, where no time can be typed, it lands on today and never after now.
    const early = { now: local(11, 22, 9, 0), day: '2026-11-22' }, today = must(editLog(evening.store, evening.logId, { amount: '250', day: '2026-11-22', time: '21:15' }, early));
    expect(atOf(today.store, evening.doseId)).toBe(early.now);
    const night = { now: local(11, 22, 23, 0), day: '2026-11-22' };
    expect(atOf(must(editLog(evening.store, evening.logId, { amount: '250', day: '2026-11-22' }, night)).store, evening.doseId)).toBe(new Date(2026, 10, 22, 21, 15, 42).getTime());
    // A blank time with the day left alone still keeps the moment it was logged.
    expect(atOf(must(editLog(store, logId, { amount: '250', day: '2026-11-20', time: '' }, late())).store, doseId)).toBe(TAKEN);
  });

  test('the hour the person chose is the one that decides, from midnight to 06:00', () => {
    // Midnight: nothing is before the rollover hour, so every time stays on its own calendar day.
    const midnight = lateLog(0, local(11, 20, 0, 0));
    expect(midnight.day).toBe('2026-11-20');
    const atMidnight = (time: string) => atOf(must(editLog(midnight.store, midnight.logId, { amount: '250', day: '2026-11-20', time }, late())).store, midnight.doseId);
    expect(atMidnight('00:01')).toBe(local(11, 20, 0, 1));
    expect(atMidnight('23:59')).toBe(local(11, 20, 23, 59));
    // 06:00: 05:59 still belongs to the day before.
    const six = lateLog(6, local(11, 21, 5, 59));
    expect(six.day).toBe('2026-11-20');
    const atSix = (time: string) => atOf(must(editLog(six.store, six.logId, { amount: '250', day: '2026-11-20', time }, late())).store, six.doseId);
    expect(atSix('05:59')).toBe(local(11, 21, 5, 59));
    expect(atSix('05:58')).toBe(local(11, 21, 5, 58));
    expect(atSix('06:00')).toBe(local(11, 20, 6, 0));
    expect(routineDayKey(new Date(atSix('05:58')), 6)).toBe('2026-11-20');
  });

  test('a dose logged under an earlier rollover hour is not moved by a later setting', () => {
    const { store, doseId, logId } = lateLog();
    const reset = must(setDayRollover(store, 0, late(LATER - 1000)));
    expect(atOf(must(editLog(reset, logId, { amount: '250', day: '2026-11-20', time: '02:30', note: LOG_NOTE }, late())).store, doseId)).toBe(TAKEN);
  });
});

describe('the draft and the dose history', () => {
  test('the sheet opens with the log as it was saved', () => {
    const { store, doseId, checkId, doseLog, checkLog } = logged();
    expect(logDraft(store, doseLog, DAY)).toEqual({
      logId: doseLog, itemId: doseId, itemName: 'Example Compound A', compoundId: store.compounds[0].id, amount: '250', unit: 'mcg', kind: 'dose', skipped: false,
      day: DAY, maxDay: DAY, time: '00:00', note: '', site: '', error: '',
    } satisfies ReturnType<typeof logDraft>);
    expect(logDraft(store, checkLog, DAY)).toMatchObject({ itemId: checkId, itemName: 'Example Check', kind: 'check', amount: '', unit: '' });
    expect(logDraft(store, 'missing', DAY)).toBeNull();
    expect(logDraft(must(undoLog(store, doseLog, clock(300))), doseLog, DAY)).toBeNull();
  });

  test('dose history lists the amounts stored on the logs, newest day first', () => {
    const { store, doseId, doseLog, newId } = logged();
    let next = must(logItem(store, doseId, clock(50, '2026-11-17')));
    next = must(editLog(next, doseLog, { amount: '125', day: DAY }, clock(200))).store;
    next = must(skipItem(next, doseId, clock(60, '2026-11-18')));
    // The item's amount changes later. The old logs keep theirs.
    next = must(saveItem(next, { itemId: doseId, name: 'Example Compound A', kind: 'dose', amount: '500', unit: 'mcg', blockIds: ['b-morning'] }, clock(300), newId)).store;
    const history = compoundDoseHistory(next, next.compounds[0].id);
    expect(history.map(row => [row.day, historyStatus(row), loggedAmountText(row)])).toEqual([[DAY, 'Partial', '125 mcg'], ['2026-11-18', 'Skipped', ''], ['2026-11-17', 'Logged', '250 mcg']]);
    expect(compoundDoseHistory(next, 'missing')).toEqual([]);
    expect(compoundDoseHistory(null, 'x')).toEqual([]);
    expect(latestLogId(next, doseId, DAY)).toBe(doseLog);
    expect(latestLogId(next, doseId, '2026-11-18')).toBe(''); // a skip is not taken
    expect(latestLogId(next, 'missing', DAY)).toBe('');
    expect(formatHistoryDay(DAY)).toBe('Nov 19, 2026');
    expect(formatHistoryDay('2026-13-01')).toBe('2026-13-01');
    expect(formatHistoryDay('x')).toBe('');
    expect(historyStatus({ status: 'skipped' })).toBe('Skipped');
    expect(historyStatus(null)).toBe('');
  });
});
