import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { FIRST_SYNC_DAYS, LATER_SYNC_DAYS, SYNC_TIMEOUT, isExpired, isOuraUrl, syncOura, mergeHealthDays, readOuraDays, refreshOura, resetOuraAsk, type OuraDay, type OuraSource, type OuraStatus } from '../src/features/health/oura';

// Made-up values only.
const NOW = new Date(2026, 10, 13, 9, 0, 0);
const DAYS = ['2026-11-11', '2026-11-12', '2026-11-13'];
function ring(status: OuraStatus | null, rows: OuraDay[] = []): OuraSource & { sync: jest.Mock; days: jest.Mock } {
  return { status: async () => status, connectUrl: async () => '', sync: jest.fn(async () => {}), days: jest.fn(async () => rows), disconnect: async () => {} };
}
beforeEach(resetOuraAsk);

describe('reading Oura days', () => {
  test('nothing is read without a source, without a sign-in, or before Oura is connected', async () => {
    expect(await readOuraDays(null, DAYS, NOW)).toBeNull();
    const signedOut = ring(null), off = ring({ connected: false, lastSync: null });
    expect(await readOuraDays(signedOut, DAYS, NOW)).toBeNull();
    expect(await readOuraDays(off, DAYS, NOW)).toBeNull();
    for (const source of [signedOut, off]) { expect(source.sync).not.toHaveBeenCalled(); expect(source.days).not.toHaveBeenCalled(); }
  });
  test('sleep comes back in hours and steps whole, in the order asked, with 0 for a day Oura has nothing for', async () => {
    const source = ring({ connected: true, lastSync: NOW.toISOString() }, [
      { day: '2026-11-13', sleepSeconds: 27000, steps: 4321.4 }, { day: '2026-11-11', sleepSeconds: null, steps: 9000 }]);
    expect(await readOuraDays(source, DAYS, NOW)).toEqual({ steps: [9000, 0, 4321], sleepHours: [0, 0, 7.5] });
    expect(source.days).toHaveBeenCalledWith('2026-11-11', '2026-11-13');
  });
});

describe('asking the server to refresh', () => {
  test('a copy under an hour old is trusted; an older one is refreshed once, then not again for ten minutes', async () => {
    const fresh = ring({ connected: true, lastSync: new Date(NOW.getTime() - 59 * 60_000).toISOString() });
    await refreshOura(fresh, (await fresh.status())!, NOW);
    expect(fresh.sync).not.toHaveBeenCalled();
    const stale = ring({ connected: true, lastSync: new Date(NOW.getTime() - 61 * 60_000).toISOString() }), status = (await stale.status())!;
    await refreshOura(stale, status, NOW);
    await refreshOura(stale, status, new Date(NOW.getTime() + 9 * 60_000));
    expect(stale.sync).toHaveBeenCalledTimes(1);
    expect(stale.sync).toHaveBeenCalledWith(LATER_SYNC_DAYS);
    await refreshOura(stale, status, new Date(NOW.getTime() + 11 * 60_000));
    expect(stale.sync).toHaveBeenCalledTimes(2);
  });
  test('the first refresh reaches further back, and a failed refresh still shows the stored days', async () => {
    const source = ring({ connected: true, lastSync: null }, [{ day: '2026-11-12', sleepSeconds: 25200, steps: 100 }]);
    source.sync.mockRejectedValue(new Error('made-up failure'));
    expect(await readOuraDays(source, DAYS, NOW)).toEqual({ steps: [0, 100, 0], sleepHours: [0, 7, 0] });
    expect(source.sync).toHaveBeenCalledWith(FIRST_SYNC_DAYS);
  });
});

describe('a slow or hung Oura never holds anything back', () => {
  test('the stored days come back while the refresh is still running, and onFresh follows once it lands', async () => {
    let land: () => void = () => {};
    const source = ring({ connected: true, lastSync: null }, [{ day: '2026-11-12', sleepSeconds: 25200, steps: 100 }]);
    source.sync.mockImplementation(() => new Promise<void>(done => { land = done; }));
    const fresh = jest.fn();
    expect(await readOuraDays(source, DAYS, NOW, fresh)).toEqual({ steps: [0, 100, 0], sleepHours: [0, 7, 0] });
    expect(source.sync).toHaveBeenCalledWith(FIRST_SYNC_DAYS);
    expect(fresh).not.toHaveBeenCalled();
    land();
    await new Promise(done => setTimeout(done, 0));
    expect(fresh).toHaveBeenCalledTimes(1);
  });
  test('a refresh that fails or is skipped does not ask for a second read', async () => {
    const failing = ring({ connected: true, lastSync: null }), fresh = jest.fn();
    failing.sync.mockRejectedValue(new Error('made-up failure'));
    await readOuraDays(failing, DAYS, NOW, fresh);
    await readOuraDays(ring({ connected: true, lastSync: NOW.toISOString() }), DAYS, NOW, fresh);
    await new Promise(done => setTimeout(done, 0));
    expect(fresh).not.toHaveBeenCalled();
  });
  test('a refresh that never answers is given up on', async () => {
    jest.useFakeTimers({ now: NOW });
    try {
      const source = ring({ connected: true, lastSync: null });
      source.sync.mockImplementation(() => new Promise<void>(() => {}));
      const asked = syncOura(source, LATER_SYNC_DAYS).then(() => 'answered', () => 'gave up');
      await jest.advanceTimersByTimeAsync(SYNC_TIMEOUT - 1);
      let settled = false; void asked.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(await asked).toBe('gave up');
    } finally { jest.useRealTimers(); }
  });
  test('each account on the phone has its own ten-minute retry gap', async () => {
    const stale = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();
    const first = ring({ connected: true, lastSync: stale, account: 'made-up-a' }), second = ring({ connected: true, lastSync: stale, account: 'made-up-b' });
    await refreshOura(first, (await first.status())!, NOW);
    await refreshOura(second, (await second.status())!, new Date(NOW.getTime() + 60_000));
    await refreshOura(first, (await first.status())!, new Date(NOW.getTime() + 120_000));
    expect(first.sync).toHaveBeenCalledTimes(1);
    expect(second.sync).toHaveBeenCalledTimes(1);
  });
});

describe('when Oura has signed Insight out', () => {
  test('the server\'s expired and missing sign-in messages are recognised, other failures are not', () => {
    expect(isExpired('Oura login expired. Reconnect Oura in the app. (401)')).toBe(true);
    expect(isExpired('Oura isn\'t connected')).toBe(true);
    for (const other of ['Oura daily_sleep request failed (500)', '', null, undefined, 401]) expect(isExpired(other)).toBe(false);
  });
  test('no refresh is asked for, and the days already stored still show', async () => {
    const source = ring({ connected: true, expired: true, lastSync: '2026-11-01T08:00:00.000Z' }, [{ day: '2026-11-11', sleepSeconds: 25200, steps: 8000 }]);
    expect(await readOuraDays(source, DAYS, NOW)).toEqual({ steps: [8000, 0, 0], sleepHours: [7, 0, 0] });
    expect(source.sync).not.toHaveBeenCalled();
  });
});

describe('two sources, one day', () => {
  const apple = { steps: [8000, 0, 5000], sleepHours: [6.5, 7, 0] }, worn = { steps: [7000, 3000, 9000], sleepHours: [7.25, 0, 8] };
  test('one source alone is used as it is', () => {
    expect(mergeHealthDays(apple, null)).toBe(apple);
    expect(mergeHealthDays(null, worn)).toBe(worn);
    expect(mergeHealthDays(null, null)).toBeNull();
  });
  test('sleep prefers the ring, steps prefer Apple Health, each falls back per day, and nothing is ever added together', () => {
    expect(mergeHealthDays(apple, worn)).toEqual({ steps: [8000, 3000, 5000], sleepHours: [7.25, 7, 8] });
  });
  test('a list one source could not read comes from the other', () => {
    expect(mergeHealthDays({ steps: null, sleepHours: [6, 6, 6] }, worn)).toEqual({ steps: worn.steps, sleepHours: [7.25, 6, 8] });
  });
});

test('Oura values never reach the phone\'s database: nothing in the app writes the old local Oura table', () => {
  // An old oura_days table remains (migrations are not changed) so sign-out and purge keep clearing it. Nothing may write to it.
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : [path]; });
  const src = join(__dirname, '../src');
  const writers = files(src).filter(path => /\.(ts|tsx)$/.test(path) && /cacheOura|(insert\s+into|update|replace\s+into)\s+oura_days/i.test(readFileSync(path, 'utf8')));
  expect(writers).toEqual([]);
  // The Oura files hold values in memory only: no database, no local saves, no logs, no error or analytics reporting.
  for (const name of ['oura.ts', 'use-oura.ts', 'use-health-days.ts'])
    expect(readFileSync(join(src, 'features/health', name), 'utf8')).not.toMatch(/data\/repository|localSave|console\.|Sentry|posthog/i);
});

test('only Oura\'s own approval page may be opened', () => {
  expect(isOuraUrl('https://cloud.ouraring.com/oauth/authorize?client_id=made-up')).toBe(true);
  for (const bad of ['https://cloud.ouraring.com.example.com/oauth/authorize?x=1', 'http://cloud.ouraring.com/oauth/authorize?x=1', 'https://example.com/?next=https://cloud.ouraring.com/oauth/authorize?', 'javascript:alert(1)', null, 7])
    expect(isOuraUrl(bad)).toBe(false);
});
