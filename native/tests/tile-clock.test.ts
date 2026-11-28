import { clockH, clockHM, clockMs, hourMark } from '../src/features/settings/clock';
import { clock } from '../src/features/progress/format';
import { h12, hax, peptides, rng, win12 } from '../src/features/routines/model';

// Tiles on every page follow Settings, Units, Time, as Home's do.
describe('tile clock', () => {
  test('12 and 24 hour times', () => {
    expect(clockHM(6, 21, '12')).toBe('6:21 AM');
    expect(clockHM(18, 5, '24')).toBe('18:05');
    expect(clockHM(0, 0, '12')).toBe('12:00 AM');
    expect(clockHM(0, 0, '24')).toBe('00:00');
    expect(clockH(18.5, '24')).toBe('18:30');
    expect(clockH(12.999, '12')).toBe('1:00 PM');
    expect(clockMs(new Date(2026, 10, 23, 7, 40).getTime(), '24')).toBe('07:40');
    expect(hourMark(12, '12')).toBe('Noon');
    expect(hourMark(22, '12')).toBe('10 PM');
    expect(hourMark(6, '24')).toBe('06:00');
  });
  test('Progress sleep times', () => {
    expect(clock(6 * 60 + 21)).toBe('6:21 AM');
    expect(clock(22 * 60 + 47, '24')).toBe('22:47');
  });
  test('Routines times take the tile clock', () => {
    expect(h12(21.5, true)).toBe('21:30');
    expect(h12(21.5, false)).toBe('9:30 PM');
    expect(hax(14, true)).toBe('14');
    expect(rng(15, 17, true)).toBe('15:00 to 17:00');
    expect(win12({ from: 21.5, to: 23.5 }, true)).toBe('From 21:30');
    expect(peptides({ routines: [], items: [] } as never, { day: '2026-11-23', wd: 1, h: 9 } as never, true)).toEqual([]);
  });
});
