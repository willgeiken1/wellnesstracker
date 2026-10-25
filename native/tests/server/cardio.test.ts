import { localDatabase } from './sqlite';
import { CardioStore } from '../../src/features/cardio/store';

test('finishing commits one cardio row and outbox entry; repeated finish is a no-op', async () => {
  const { repo, sqlite } = await localDatabase();
  try {
    const store = new CardioStore(repo);
    const base = Date.parse('2026-10-24T12:00:00Z');
    store.start('treadmill', { mph: 3, incline: 12, level: 8 }, base);
    store.pause(base + 60000);
    store.resume(base + 120000);
    const row = store.finish(base + 180000)!;
    expect(row.data).toEqual({ day: '2026-10-24', kind: 'treadmill', duration_ms: 120000, distance_m: null, notes: '' });
    expect(repo.list('cardio_sessions')).toHaveLength(1);
    expect(repo.pending().map(p => p.row.table)).toEqual(['cardio_sessions']);
    expect(store.finish(base + 190000)).toBeNull();
    expect(repo.list('cardio_sessions')).toHaveLength(1);
    expect(repo.pending()).toHaveLength(1);
    expect(new CardioStore(repo).segments(row.id)).toHaveLength(1);
    expect(store.live()).toBeNull();
  } finally { sqlite.close(); }
});
test('live changes preserve segment kcal, local goal and live state survive facade recreation', async () => {
  const { repo, sqlite } = await localDatabase();
  try {
    const store = new CardioStore(repo);
    store.start('bike', { mph: 0, incline: 0, level: 1 }, 0);
    store.change({ mph: 0, incline: 0, level: 20 }, 60000);
    store.setGoal(90);
    const again = new CardioStore(repo);
    expect(again.goal()).toBe(90);
    expect(again.liveKcal(80, 120000)).toBeCloseTo(18.62);
    expect(repo.pending()).toHaveLength(0);
    const row = again.finish(120000)!;
    expect(again.sessionKcal(row, 80)).toBeCloseTo(18.62);
    expect(repo.pending()).toHaveLength(1);
  } finally { sqlite.close(); }
});
test('log elsewhere validates date/duration and writes only existing columns', async () => {
  const { repo, sqlite } = await localDatabase();
  try {
    const store = new CardioStore(repo);
    const input = { day: '2026-10-23', machine: 'rower' as const, durationMs: 1800000, settings: { mph: 0, incline: 0, level: 8 }, notes: 'Synthetic fixture' };
    for (const durationMs of [0, 59999, 21600001, NaN]) expect(() => store.logFinished({ ...input, durationMs }, '2026-10-24')).toThrow();
    for (const day of ['2026-10-25','2026-02-30','nonsense']) expect(() => store.logFinished({ ...input, day }, '2026-10-24')).toThrow();
    expect(repo.pending()).toHaveLength(0);
    const row = store.logFinished(input, '2026-10-24');
    expect(row.data).toEqual({ day: '2026-10-23', kind: 'rower', duration_ms: 1800000, distance_m: null, notes: 'Synthetic fixture' });
    expect(repo.pending()).toHaveLength(1);
    expect(store.sessionKcal(row, 80)).toBeCloseTo(289.8);
    expect(store.sessionKcal({ ...row, id: 'other-device' }, 80)).toBeNull();
  } finally { sqlite.close(); }
});
test('failed finish rolls back row, outbox and local live state for retry', async () => {
  const { repo, sqlite } = await localDatabase();
  try {
    const store = new CardioStore(repo);
    store.start('bike', { mph: 0, incline: 0, level: 8 }, 0);
    const save = jest.spyOn(repo, 'localSave').mockImplementation(() => { throw new Error('Synthetic disk failure'); });
    expect(() => store.finish(60000)).toThrow();
    save.mockRestore();
    expect(repo.list('cardio_sessions')).toHaveLength(0);
    expect(repo.pending()).toHaveLength(0);
    expect(store.live()).not.toBeNull();
    expect(store.finish(60000)).not.toBeNull();
  } finally { sqlite.close(); }
});
