import {
  coveringLog, loggedAmountText, loggedTodayCount, parseRoutineAmount, placedItems, routineBlockRows, routineDayComplete, routineDoseProgress,
  routineRestLog, routineStreak, shiftRoutineDay,
} from '../src/features/routines/model/day';
import { lastRoutineSite, projectRoutineStore, routineSiteId, routineSiteLabel, ROUTINE_SITES, clipText, forgetGraphemeSegmenter, normalizeLog, wellFormed } from '../src/features/routines/model/shape';
import type { LogLike } from '../src/features/routines/model/shape';

/* Synthetic rows only. Ported from the pure assertions of the web app's rest, check-off, site and store tests. */

const log = (id: string, day: string, extra: LogLike = {}): LogLike => ({ id, itemId: 'item-a', day, status: 'done', amount: null, unit: '', at: 1, updatedAt: 1, deletedAt: null, ...extra });
const store = () => ({
  blocks: [
    { id: 'b-morning', name: 'Morning routine', color: 'citrus', order: 0, updatedAt: 1 },
    { id: 'b-week', name: 'Example weekdays', color: 'pink', order: 1, days: [0, 1, 2, 3, 4], updatedAt: 1 },
    { id: 'b-hidden', name: 'Example hidden', color: 'pink', order: 2, hidden: true, updatedAt: 1 },
  ],
  items: [
    { id: 'item-a', name: 'Example Compound A', kind: 'dose', compoundId: 'c-a', updatedAt: 1 },
    { id: 'item-b', name: 'Example Check', kind: 'check', updatedAt: 1 },
    { id: 'item-c', name: 'Example Weekday Check', kind: 'check', updatedAt: 1 },
    { id: 'item-d', name: 'Example Hidden Check', kind: 'check', updatedAt: 1 },
    { id: 'item-e', name: 'Example Typed', kind: 'check', type: 'supplement', updatedAt: 1 },
    { id: 'item-f', name: 'Example Stale Type', kind: 'check', type: 'type_missing', updatedAt: 1 },
  ],
  placements: [
    { id: 'p2', blockId: 'b-morning', itemId: 'item-b', order: 1, updatedAt: 1 },
    { id: 'p1', blockId: 'b-morning', itemId: 'item-a', order: 0, updatedAt: 1 },
    { id: 'p3', blockId: 'b-week', itemId: 'item-c', order: 0, updatedAt: 1 },
    { id: 'p4', blockId: 'b-hidden', itemId: 'item-d', order: 0, updatedAt: 1 },
  ],
  compounds: [{ id: 'c-a', name: 'Example Compound A', amount: 250, unit: 'mcg', updatedAt: 1 }],
  logs: [] as LogLike[],
});

describe('a routine day', () => {
  test('due items follow shown routines, their weekdays, and typed items with no routine', () => {
    const view = projectRoutineStore(store());
    expect(view?.blocks.map(block => block.id)).toEqual(['b-morning', 'b-week']);
    expect(view?.hiddenBlocks.map(block => block.id)).toEqual(['b-hidden']);
    // 2026-11-19 is a Thursday, 2026-11-21 a Saturday.
    expect(placedItems(view, '2026-11-19').map(item => item.id)).toEqual(['item-b', 'item-a', 'item-c', 'item-e']);
    expect(placedItems(view, '2026-11-21').map(item => item.id)).toEqual(['item-b', 'item-a', 'item-e']);
    expect(routineBlockRows(view, 'b-morning', '2026-11-19').map(row => [row.item.id, row.open, row.compound?.amount ?? null])).toEqual([['item-a', true, 250], ['item-b', true, null]]);
  });

  test('progress counts logged doses, a skip is due and not logged, and nothing is summed', () => {
    const data = store();
    data.logs = [log('l1', '2026-11-19', { amount: 250, unit: 'mcg' }), log('l2', '2026-11-19', { itemId: 'item-b', status: 'skipped' })];
    const view = projectRoutineStore(data);
    expect(routineDoseProgress(view, '2026-11-19')).toEqual({ logged: 1, due: 1 });
    expect(routineDoseProgress(view, '2026-11-20')).toEqual({ logged: 0, due: 1 });
    expect(loggedTodayCount(view?.logs, '2026-11-19')).toBe(1);
    expect(routineDayComplete(view, '2026-11-19')).toBe(false);
    data.logs = [log('l1', '2026-11-21'), log('l2', '2026-11-21', { itemId: 'item-b' }), log('l3', '2026-11-21', { itemId: 'item-e' })];
    expect(routineDayComplete(projectRoutineStore(data), '2026-11-21')).toBe(true);
    expect(routineDayComplete(projectRoutineStore({ ...store(), items: [] }), '2026-11-21')).toBe(false);
    expect(coveringLog([log('old', '2026-11-19', { updatedAt: 1 }), log('new', '2026-11-19', { updatedAt: 5 }), log('gone', '2026-11-19', { updatedAt: 9, deletedAt: 9 }), log('rest', '2026-11-19', { rest: true, updatedAt: 8 })], 'item-a', '2026-11-19')?.id).toBe('new');
  });

  test('the streak counts done, partial and skip days, pauses on a rest, and stops at a miss', () => {
    const today = '2026-11-19';
    expect(routineStreak([], today)).toBe(0);
    expect(routineStreak([log('a', '2026-11-19')], today)).toBe(1);
    expect(routineStreak([log('a', '2026-11-18'), log('b', '2026-11-17', { status: 'skipped' }), log('c', '2026-11-16', { status: 'partial' })], today)).toBe(3);
    expect(routineStreak([log('a', '2026-11-19'), log('b', '2026-11-17')], today)).toBe(1);
    expect(routineStreak([log('a', '2026-11-19'), log('r', '2026-11-18', { rest: true, itemId: null }), log('b', '2026-11-17')], today)).toBe(2);
    expect(routineStreak([log('a', '2026-11-19'), log('r', '2026-11-19', { rest: true, itemId: null }), log('b', '2026-11-18')], today)).toBe(2);
    expect(routineStreak([log('r', '2026-11-19', { rest: true, itemId: null })], today)).toBe(0);
    expect(routineStreak([log('a', '2026-11-18', { deletedAt: 5 })], today)).toBe(0);
    expect(routineStreak([log('a', '2026-11-18')], 'not-a-day')).toBe(0);
    expect(shiftRoutineDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftRoutineDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftRoutineDay('bad', 1)).toBe('');
    expect(routineRestLog([log('r2', today, { rest: true, updatedAt: 4 }), log('r1', today, { rest: true, updatedAt: 4 }), log('r0', today, { rest: true, updatedAt: 9, deletedAt: 9 })], today)?.id).toBe('r1');
    expect(routineRestLog([log('a', today)], today)).toBeNull();
  });

  test('a typed amount is read as the number typed, and a logged amount is shown as stored', () => {
    expect(parseRoutineAmount('1/4')).toBe(0.25);
    expect(parseRoutineAmount('¼')).toBe(0.25);
    expect(parseRoutineAmount('1½')).toBe(1.5);
    expect(parseRoutineAmount('0,25')).toBe(0.25);
    expect(parseRoutineAmount('.5')).toBe(0.5);
    expect(parseRoutineAmount('1,000')).toBeNull();
    expect(parseRoutineAmount('')).toBeNull();
    expect(parseRoutineAmount('-1')).toBeNull();
    expect(parseRoutineAmount('1/0')).toBeNull();
    expect(parseRoutineAmount('abc')).toBeNull();
    expect(parseRoutineAmount(-2)).toBeNull();
    expect(parseRoutineAmount(13.25)).toBe(13.25);
    expect(loggedAmountText({ status: 'done', amount: 13.25, unit: 'mg' })).toBe('13.25 mg');
    expect(loggedAmountText({ status: 'done', amount: 0.1234567, unit: '' })).toBe('0.123');
    expect(loggedAmountText({ status: 'skipped', amount: 13.25, unit: 'mg' })).toBe('');
    expect(loggedAmountText({ status: 'done', rest: true, amount: 1, unit: 'mg' })).toBe('');
    expect(loggedAmountText({ status: 'done', amount: null, unit: 'mg' })).toBe('');
  });

  test('a site is one of the eight in the list, kept only on a taken dose', () => {
    expect(ROUTINE_SITES.map(site => site.id)).toEqual(['left-belly', 'right-belly', 'left-thigh', 'right-thigh', 'left-arm', 'right-arm', 'left-glute', 'right-glute']);
    expect(routineSiteId(' right-thigh ')).toBe('right-thigh');
    expect(routineSiteId('elbow')).toBe('');
    expect(routineSiteLabel('right-thigh')).toBe('Right thigh');
    expect(routineSiteLabel('elbow')).toBe('');
    expect(normalizeLog(log('a', '2026-11-19', { site: 'right-thigh' }))?.site).toBe('right-thigh');
    expect(normalizeLog(log('a', '2026-11-19', { site: 'right-thigh', status: 'skipped' }))?.site).toBeUndefined();
    expect(normalizeLog(log('a', '2026-11-19', { site: 'right-thigh', rest: true }))?.site).toBeUndefined();
    expect(normalizeLog(log('a', '2026-11-19', { site: 'elbow' }))?.site).toBeUndefined();
    expect(normalizeLog(log('a', '2026-02-30'))).toBeNull();
    const data = { ...store(), logs: [log('l1', '2026-11-17', { site: 'left-arm' }), log('l2', '2026-11-18', { site: 'right-thigh' }), log('l3', '2026-11-19', { site: 'left-glute', deletedAt: 9, undone: true }), log('l4', '2026-11-19', { itemId: 'item-b', site: 'left-belly' })] };
    expect(lastRoutineSite(data, 'item-a')).toBe('right-thigh');
    expect(lastRoutineSite(data, 'item-a', 'l2')).toBe('left-arm');
    expect(lastRoutineSite(data, 'item-z')).toBe('');
  });

  test('text is clipped on whole characters and a lone surrogate cannot be stored', () => {
    expect(clipText('  abc  ', 2)).toBe('ab');
    expect(clipText('a😀b', 2)).toBe('a');
    expect(clipText(5, 2)).toBe('');
    expect(wellFormed('a\uD800b')).toBe('a�b');
    expect(wellFormed('a😀b')).toBe('a😀b');
    const family = '👨‍👩‍👧';
    forgetGraphemeSegmenter();
    expect([family, '']).toContain(clipText(`${family}${family}`, family.length + 2));
    expect(clipText(`ab${family}`, 3)).toBe('ab');
  });
});
