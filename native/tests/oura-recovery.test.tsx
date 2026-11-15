import { render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { readOuraRecovery, resetOuraAsk, type OuraDay, type OuraRecovery, type OuraSource, type OuraStatus } from '../src/features/health/oura';
import type { Recovery as AppleRecovery } from '../src/features/health/recovery';
import { Recovery } from '../src/features/insights/recovery';

// Made-up values only.
const NOW = new Date(2026, 10, 12, 15);
const DAYS = ['2026-11-10', '2026-11-11', '2026-11-12'];
const fresh: OuraStatus = { connected: true, lastSync: NOW.toISOString(), account: 'a' };
const ring = (status: OuraStatus | null, rows: OuraDay[] = []): OuraSource => ({ status: async () => status, connectUrl: async () => '', sync: jest.fn(async () => {}), days: jest.fn(async () => rows), disconnect: async () => {} });
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;
beforeEach(() => resetOuraAsk());

describe("Oura's part of Recovery", () => {
  test('nothing when Oura is not connected or nobody is signed in', async () => {
    expect(await readOuraRecovery(null, DAYS, NOW)).toBeNull();
    expect(await readOuraRecovery(ring(null), DAYS, NOW)).toBeNull();
    expect(await readOuraRecovery(ring({ connected: false, lastSync: null }), DAYS, NOW)).toBeNull();
  });
  test('scores and heart readings by day, null where Oura has none, and last night by stage with light as core', async () => {
    const rows: OuraDay[] = [
      { day: '2026-11-10', sleepSeconds: 25200, steps: 8000, readiness: 81, sleepScore: 77, hrv: 42.4, restingHeartRate: 54 },
      { day: '2026-11-12', sleepSeconds: 27000, steps: 100, readiness: 85, sleepScore: 0, hrv: null, restingHeartRate: 52,
        deepSeconds: 5400, lightSeconds: 14400, remSeconds: 7200, awakeSeconds: 1800 },
    ];
    expect(await readOuraRecovery(ring(fresh, rows), DAYS, NOW)).toEqual({
      readiness: [81, null, 85], sleepScore: [77, null, null], hrv: [42, null, null], restingHeartRate: [54, null, 52],
      night: { deep: 90, core: 240, rem: 120, asleep: 0, awake: 30 },
    });
  });
  test('no stages for last night means no night', async () => {
    const out = await readOuraRecovery(ring(fresh, [{ day: '2026-11-12', sleepSeconds: 27000, steps: 0, readiness: 70 }]), DAYS, NOW);
    expect(out?.night).toBeNull();
  });
});

const oura = (over: Partial<OuraRecovery> = {}): OuraRecovery => ({
  readiness: [80, 82, 84], sleepScore: [70, null, 75], hrv: [40, 41, 45], restingHeartRate: [55, 54, 53],
  night: { deep: 90, core: 240, rem: 120, asleep: 0, awake: 30 }, ...over,
});

describe('Recovery with Oura', () => {
  test('Oura alone fills the page, even before Apple Health is connected', async () => {
    await render(wrap(<Recovery access="ask" recovery={null} oura={oura()} now={NOW} />));
    expect(screen.queryByTestId('recovery-connect')).toBeNull();
    expect(within(screen.getByTestId('recovery-readiness')).getByText('Latest 84 · 7-day average 82')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-sleep-score')).getByText('Latest 75 · 7-day average 73')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-night')).getByText('Light 4 h 00 min')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-hrv')).getByText('Latest 45 ms · 7-day average 42 ms')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-resting')).getByText('Latest 53 bpm · 7-day average 54 bpm')).toBeTruthy();
    expect(screen.getByText(/Readiness and sleep score come from Oura/)).toBeTruthy();
  });
  test('where both have a reading, Apple Health wins; Oura fills in what Apple Health lacks', async () => {
    const apple: AppleRecovery = { night: { deep: 60, core: 200, rem: 100, asleep: 0, awake: 20 }, restingHeartRate: [60, 61, 62], hrv: [null, null, null], heartToday: null, vo2Max: null };
    await render(wrap(<Recovery access="asked" recovery={apple} oura={oura()} now={NOW} />));
    expect(within(screen.getByTestId('recovery-night')).getByText('Core 3 h 20 min')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-resting')).getByText('Latest 62 bpm · 7-day average 61 bpm')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-hrv')).getByText('Latest 45 ms · 7-day average 42 ms')).toBeTruthy();
    expect(screen.getByTestId('recovery-readiness')).toBeTruthy();
  });
  test('Oura with no readings leaves the Apple Health page as it was', async () => {
    const empty = oura({ readiness: [null, null, null], sleepScore: [null, null, null], hrv: [null, null, null], restingHeartRate: [null, null, null], night: null });
    await render(wrap(<Recovery access="ask" recovery={null} oura={empty} now={NOW} />));
    expect(screen.getByTestId('recovery-connect')).toBeTruthy();
    expect(screen.queryByTestId('recovery-readiness')).toBeNull();
  });
});
