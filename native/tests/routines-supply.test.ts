import {
  attachSupply, LOW_SUPPLY_DAYS, mixedAgoLabel, parseSupplyCount, parseSupplyDay, readSupplyCount, readSupplyDay, routineDaysLeft, routineSupplyView,
  supplyDraftError, supplyFromDraft, SUPPLY_COUNT_MAX,
} from '../src/features/routines/model/supply';
import { normalizeItem, type ItemLike, type LogLike } from '../src/features/routines/model/shape';

/* Synthetic rows only. Ported from the pure parts of the web app's tests/daily-routines-supply.test.mjs. */

const BANNED = /\b(buy|vendor|vendors|price|pricing|shop|purchase|reorder|pharmacy|\$)\b|https?:\/\//i;
type Extra = { status?: string; amount?: number | null; at?: number; updatedAt?: number; deletedAt?: number | null; rest?: boolean };
function doseLog(id: string, itemId: string, day: string, extra: Extra = {}): LogLike {
  return {
    id, itemId, compoundId: null, day, status: extra.status || 'done', amount: extra.amount === undefined ? 250 : extra.amount, unit: 'mcg',
    at: extra.at || 1, updatedAt: extra.updatedAt || 1, deletedAt: extra.deletedAt == null ? null : extra.deletedAt, rest: extra.rest === true,
  };
}
const viewOf = (item: ItemLike, logs: LogLike[], today = '2026-11-19') => routineSupplyView({ item, logs, today });

describe('routine supply and mixed-on date', () => {
  test('days left uses the logged gap, not a summed amount', () => {
    const itemId = 'item-a';
    const none: LogLike[] = [];
    expect(routineDaysLeft(8, none, itemId)).toBe(8);
    expect(routineDaysLeft(7, none, itemId)).toBe(7);
    expect(routineDaysLeft(0, none, itemId)).toBe(0);
    expect(routineDaysLeft(null, none, itemId)).toBeNull();
    expect(routineDaysLeft(4, [doseLog('only', itemId, '2026-11-01', { amount: 9000 })], itemId)).toBe(4);

    const everyOther = [doseLog('a', itemId, '2026-11-01', { amount: 250 }), doseLog('b', itemId, '2026-11-03', { amount: 500 }), doseLog('c', itemId, '2026-11-05', { amount: 9000 })];
    expect(routineDaysLeft(4, everyOther, itemId)).toBe(8);
    expect(routineDaysLeft(3, everyOther, itemId)).toBe(6);
    expect(routineDaysLeft(4, everyOther, itemId)).not.toBe(250 + 500 + 9000);

    const skipped = [doseLog('d1', itemId, '2026-11-01'), doseLog('skip', itemId, '2026-11-02', { status: 'skipped', amount: null }), doseLog('d3', itemId, '2026-11-03')];
    expect(routineDaysLeft(4, skipped, itemId)).toBe(8);
    const rested = [doseLog('r1', itemId, '2026-11-01'), doseLog('rest', itemId, '2026-11-02', { rest: true, status: 'done' }), doseLog('r3', itemId, '2026-11-03')];
    expect(routineDaysLeft(4, rested, itemId)).toBe(8);
    const tombstone = [doseLog('t1', itemId, '2026-11-01'), doseLog('gone', itemId, '2026-11-02', { deletedAt: 50 }), doseLog('t3', itemId, '2026-11-03')];
    expect(routineDaysLeft(4, tombstone, itemId)).toBe(8);
    const partial = [doseLog('p1', itemId, '2026-11-01', { status: 'partial', amount: 1 }), doseLog('p3', itemId, '2026-11-03', { amount: 2 })];
    expect(routineDaysLeft(4, partial, itemId)).toBe(8);
    const other = [doseLog('mine-1', itemId, '2026-11-01'), doseLog('other', 'item-b', '2026-11-02', { amount: 400 }), doseLog('mine-3', itemId, '2026-11-03')];
    expect(routineDaysLeft(4, other, itemId)).toBe(8);
    const weekly = [doseLog('w1', itemId, '2026-11-01'), doseLog('w2', itemId, '2026-11-09')];
    expect(routineDaysLeft(1, weekly, itemId)).toBe(8);
    const half = [doseLog('h1', itemId, '2026-11-01'), doseLog('h2', itemId, '2026-11-03'), doseLog('h3', itemId, '2026-11-06')];
    expect(routineDaysLeft(1, half, itemId)).toBe(3);
    const belowHalf = ['01', '02', '03', '04', '05', '08'].map((day, index) => doseLog(`b${index}`, itemId, `2026-11-${day}`));
    expect(routineDaysLeft(3, belowHalf, itemId)).toBe(4);
  });

  test('the estimate counts down from the day the count was typed and stops at zero', () => {
    expect(routineDaysLeft(8, [], 'item-a', '2026-11-19', '2026-11-16')).toBe(5);
    expect(routineDaysLeft(8, [], 'item-a', '2026-11-19', '2026-11-19')).toBe(8);
    expect(routineDaysLeft(2, [], 'item-a', '2026-11-19', '2026-11-01')).toBe(0);
    expect(routineDaysLeft(8, [], 'item-a', '2026-11-19', 'not-a-day')).toBe(8);
  });

  test('wording names the count, the days left, and how long ago a vial was mixed', () => {
    const item = { id: 'item-a', kind: 'dose', name: 'Example Compound A' };
    const today = '2026-11-19';
    expect(mixedAgoLabel('2026-11-19', today)).toBe('Mixed today');
    expect(mixedAgoLabel('2026-11-18', today)).toBe('Mixed 1 day ago');
    expect(mixedAgoLabel('2026-11-10', today)).toBe('Mixed 9 days ago');
    expect(mixedAgoLabel('2026-11-20', today)).toBe('');

    const steady = viewOf({ ...item, onHand: 8 }, [], today);
    expect(steady).toEqual({ text: '8 on hand · 8 days left', state: 'set' });
    const low = viewOf({ ...item, onHand: 7 }, [], today);
    expect(low).toEqual({ text: 'Low supply · 7 on hand · 7 days left', state: 'low' });
    expect(LOW_SUPPLY_DAYS).toBe(7);
    expect(viewOf({ ...item, onHand: 0 }, [], today).text).toBe('Low supply · 0 on hand · 0 days left');
    expect(viewOf({ ...item, onHand: 1 }, [], today).text).toBe('Low supply · 1 on hand · 1 day left');
    const rare = viewOf({ ...item, onHand: 1 }, [doseLog('w1', item.id, '2026-11-01'), doseLog('w2', item.id, '2026-11-09')], today);
    expect(rare).toEqual({ text: '1 on hand · 8 days left', state: 'set' });
    const both = viewOf({ ...item, onHand: 4, mixedOn: '2026-11-10' }, [doseLog('a', item.id, '2026-11-01'), doseLog('b', item.id, '2026-11-03'), doseLog('c', item.id, '2026-11-05')], today);
    expect(both).toEqual({ text: '4 on hand · 8 days left · Mixed 9 days ago', state: 'set' });
    const lowMixed = viewOf({ ...item, onHand: 3, mixedOn: '2026-11-10' }, [], today);
    expect(lowMixed).toEqual({ text: 'Low supply · 3 on hand · 3 days left · Mixed 9 days ago', state: 'low' });
    expect(viewOf({ ...item, mixedOn: '2026-11-10' }, [], today)).toEqual({ text: 'Mixed 9 days ago', state: 'mixed' });
    expect(viewOf({ ...item, kind: 'check', mixedOn: '2026-11-10' }, [], today)).toEqual({ text: '', state: '' });
    expect(viewOf(item, [], today)).toEqual({ text: '', state: '' });
    for (const text of [steady.text, low.text, rare.text, both.text, lowMixed.text, 'Mixed 9 days ago']) expect(text).not.toMatch(BANNED);
  });

  test('a blank clears, a bad value is refused, and a check item keeps no mix date', () => {
    expect(parseSupplyCount('12')).toBe(12);
    expect(parseSupplyCount(' 12 ')).toBe(12);
    expect(parseSupplyCount('1.5')).toBeNull();
    expect(parseSupplyCount(-1)).toBeNull();
    expect(parseSupplyCount(SUPPLY_COUNT_MAX)).toBe(9999);
    expect(parseSupplyCount(10000)).toBeNull();
    expect(parseSupplyDay('2026-02-30')).toBeNull();
    expect(parseSupplyDay('2026-02-28')).toBe('2026-02-28');
    expect(readSupplyCount('')).toEqual({ ok: true, count: null });
    expect(readSupplyCount('abc')).toEqual({ ok: false, count: null });
    expect(readSupplyDay('', '2026-11-19')).toEqual({ ok: true, day: null });
    expect(readSupplyDay('2026-11-20', '2026-11-19')).toEqual({ ok: false, day: null });
    expect(readSupplyDay('2026-11-19', '2026-11-19')).toEqual({ ok: true, day: '2026-11-19' });
    expect(supplyDraftError({ kind: 'dose', onHand: 'x' }, '2026-11-19')).toBe('On hand is a whole number, or leave it blank.');
    expect(supplyDraftError({ kind: 'dose', mixedOn: '2026-11-20' }, '2026-11-19')).toBe('Mixed on is a day up to today, or leave it blank.');
    expect(supplyDraftError({ kind: 'check', mixedOn: '2026-11-20' }, '2026-11-19')).toBe('');
    expect(supplyDraftError({ kind: 'dose', onHand: '4', mixedOn: '2026-11-18' }, '2026-11-19')).toBe('');

    expect(supplyFromDraft({ onHand: '4', mixedOn: '2026-11-18' }, 'dose', '2026-11-19')).toEqual({ onHand: 4, onHandDay: '2026-11-19', mixedOn: '2026-11-18' });
    expect(supplyFromDraft({ onHand: '4' }, 'dose', '2026-11-19', { onHand: 4, onHandDay: '2026-11-10' })).toEqual({ onHand: 4 });
    expect(supplyFromDraft({ onHand: '5' }, 'dose', '2026-11-19', { onHand: 4, onHandDay: '2026-11-10' })).toEqual({ onHand: 5, onHandDay: '2026-11-19' });
    expect(supplyFromDraft({ onHand: '' }, 'dose', '2026-11-19')).toEqual({ onHand: null, onHandDay: null });
    expect(supplyFromDraft({ onHand: '4', mixedOn: '2026-11-18' }, 'check', '2026-11-19')).toEqual({ onHand: 4, onHandDay: '2026-11-19', mixedOn: null });
    expect(supplyFromDraft({ onHand: 'x' }, 'dose', '2026-11-19')).toBeNull();
    expect(supplyFromDraft({}, 'dose', '2026-11-19')).toEqual({});

    expect(attachSupply({ kind: 'dose', onHand: 4, onHandDay: '2026-11-19', mixedOn: '2026-11-18' })).toEqual({ kind: 'dose', onHand: 4, onHandDay: '2026-11-19', mixedOn: '2026-11-18' });
    expect(attachSupply({ kind: 'check', onHand: 4, mixedOn: '2026-11-18' })).toEqual({ kind: 'check', onHand: 4 });
    expect(attachSupply({ kind: 'dose', onHandDay: '2026-11-19' })).toEqual({ kind: 'dose' });
  });

  test('a stored item keeps only the supply fields, and nothing that names a seller or a price', () => {
    const item = normalizeItem({ id: 'item-a', name: 'Example Compound A', kind: 'dose', updatedAt: 5, onHand: 4, onHandDay: '2026-11-19', onHandAt: 77, mixedOn: '2026-11-18', vendor: 'x', price: 3, url: 'https://example.invalid', mood: 4 });
    expect(item).toEqual({ id: 'item-a', name: 'Example Compound A', kind: 'dose', compoundId: null, updatedAt: 5, deletedAt: null, onHand: 4, onHandDay: '2026-11-19', onHandAt: 77, mixedOn: '2026-11-18' });
    expect(normalizeItem({ id: 'item-b', name: 'Example Check', kind: 'check', onHand: 1.5, onHandAt: 77, mixedOn: '2026-11-18' })).toEqual({ id: 'item-b', name: 'Example Check', kind: 'check', compoundId: null, updatedAt: 0, deletedAt: null });
  });
});
