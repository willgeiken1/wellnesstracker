import { act, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { nightOf } from '../src/features/health/days';
import { nightStages, readRecovery } from '../src/features/health/recovery';
import type { HealthAccess, HeartMetric, HealthSource, SleepSpan, Spread } from '../src/features/health/source';
import { useRecovery } from '../src/features/health/use-recovery';
import { Recovery } from '../src/features/insights/recovery';

// Made-up values only.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const NOW = at(12, 15);
const span = (a: Date, b: Date, extra: Partial<SleepSpan> = {}): SleepSpan => ({ start: a, end: b, ...extra });
const source = (access: HealthAccess, over: Partial<HealthSource> = {}): HealthSource => ({
  access: async () => access, request: async () => {}, weights: async () => [], steps: async () => 0, sleep: async () => [],
  activeEnergy: async () => 0, exerciseMinutes: async () => 0, heart: async () => null, vo2Max: async () => null, water: async () => 0, mindful: async () => [], bodyFat: async () => [], ...over,
});
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });

describe('last night by stage', () => {
  const night = nightOf('2026-11-12');
  test('each stage counts once, awake comes out of every stage, and plain asleep only fills gaps', () => {
    const spans = [
      span(at(11, 23), at(12, 1), { stage: 'core' }),
      span(at(12, 1), at(12, 2), { stage: 'deep' }),
      span(at(12, 1, 30), at(12, 2), { stage: 'deep' }), // a second device: counted once
      span(at(12, 2), at(12, 3), { stage: 'rem' }),
      span(at(12, 2, 30), at(12, 2, 45), { awake: true }), // out of REM
      span(at(11, 23), at(12, 4)), // a phone's plain asleep block: only 3 to 4 am is new
    ];
    expect(nightStages(spans, night.from, night.to)).toEqual({ core: 120, deep: 60, rem: 45, asleep: 60, awake: 15 });
  });
  test('awake before falling asleep or after waking is left out, and no sleep gives nothing', () => {
    const spans = [span(at(11, 22), at(11, 23), { awake: true }), span(at(11, 23), at(12, 6), { stage: 'core' }), span(at(12, 6), at(12, 7), { awake: true })];
    expect(nightStages(spans, night.from, night.to)).toMatchObject({ awake: 0, core: 420 });
    expect(nightStages([span(at(12, 2), at(12, 3), { awake: true })], night.from, night.to)).toBeNull();
    expect(nightStages([], night.from, night.to)).toBeNull();
  });
});

describe('reading recovery', () => {
  test('nothing is read before the person has been asked, or with no Apple Health', async () => {
    const heart = jest.fn(async () => null), sleep = jest.fn(async () => []);
    expect(await readRecovery(source('ask', { heart, sleep }), ['2026-11-12'], NOW)).toBeNull();
    expect(await readRecovery(null, ['2026-11-12'], NOW)).toBeNull();
    expect(heart).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });
  test('daily heart readings up to now, today\'s heart rate, the newest VO2 max, and last night', async () => {
    const windows: [HeartMetric, Date, Date][] = [];
    const read = await readRecovery(source('asked', {
      heart: async (metric, from, to): Promise<Spread | null> => {
        windows.push([metric, from, to]);
        if (metric === 'heartRate') return { average: 71.6, min: 52.2, max: 141.4 };
        if (from.getDate() === 11) return null;
        return metric === 'hrv' ? { average: 48.4, min: 30, max: 70 } : { average: 56.5, min: 56, max: 57 };
      },
      vo2Max: async () => ({ value: 44.27, at: at(10, 9) }),
      sleep: async () => [span(at(11, 23), at(12, 6), { stage: 'core' })],
    }), ['2026-11-11', '2026-11-12'], NOW);
    expect(read).toEqual({
      night: { core: 420, deep: 0, rem: 0, asleep: 0, awake: 0 },
      restingHeartRate: [null, 57], hrv: [null, 48],
      heartToday: { average: 72, min: 52, max: 141 },
      vo2Max: { value: 44.3, at: at(10, 9) },
    });
    expect(windows.filter(([metric]) => metric === 'restingHeartRate').map(([, from, to]) => [from, to])).toEqual([[at(11, 0), at(12, 0)], [at(12, 0), NOW]]);
  });
  test('one failed part is left out and the rest still show', async () => {
    const read = await readRecovery(source('asked', {
      heart: async metric => { if (metric === 'hrv') throw new Error('made-up failure'); return { average: 60, min: 50, max: 70 }; },
      sleep: async () => { throw new Error('made-up failure'); },
      vo2Max: async () => ({ value: 40, at: at(13, 9) }), // a date past now is not shown
    }), ['2026-11-12'], NOW);
    expect(read).toEqual({ night: null, restingHeartRate: [60], hrv: null, heartToday: { average: 60, min: 50, max: 70 }, vo2Max: null });
  });
});

describe('Insights › Recovery', () => {
  test('shows last night by stage and each heart reading, from Apple Health', async () => {
    await render(wrap(<Recovery access="asked" now={NOW} recovery={{
      night: { core: 230, deep: 65, rem: 95, asleep: 0, awake: 22 },
      restingHeartRate: [58, null, 57, 56, 57, 55, 56], hrv: [44, 47, null, 51, 49, 52, 50],
      heartToday: { average: 72, min: 52, max: 141 }, vo2Max: { value: 44.3, at: at(10, 9) },
    }} />));
    expect(screen.getByLabelText('Last night. 6 h 30 min asleep. Deep 1 h 05 min, Core 3 h 50 min, REM 1 h 35 min, Awake 0 h 22 min')).toBeTruthy();
    expect(screen.queryByTestId('recovery-stage-asleep')).toBeNull();
    expect(screen.getByLabelText('Resting heart rate. Latest 56 bpm · 7-day average 57 bpm')).toBeTruthy();
    expect(screen.getByLabelText('Heart rate variability. Latest 50 ms · 7-day average 49 ms')).toBeTruthy();
    expect(screen.getByLabelText('Heart rate today. Average 72 bpm · range 52 to 141 bpm')).toBeTruthy();
    expect(screen.getByLabelText('VO2 max. 44.3 mL/kg/min · recorded Nov 10')).toBeTruthy();
  });
  test('says what to do when Apple Health is not connected, unavailable, unread or empty', async () => {
    const view = await render(wrap(<Recovery access="ask" recovery={null} now={NOW} />));
    expect(screen.getByTestId('recovery-connect')).toBeTruthy();
    await view.rerender(wrap(<Recovery access="unavailable" recovery={null} now={NOW} />));
    expect(screen.getByTestId('recovery-later')).toBeTruthy();
    await view.rerender(wrap(<Recovery access="asked" recovery={null} now={NOW} />));
    expect(screen.getByTestId('recovery-failed')).toBeTruthy();
    await view.rerender(wrap(<Recovery access="asked" now={NOW} recovery={{ night: null, restingHeartRate: [null], hrv: null, heartToday: null, vo2Max: null }} />));
    expect(screen.getByTestId('recovery-empty')).toBeTruthy();
  });
  test('the page reads only while it is in front and never prompts', async () => {
    const request = jest.fn(async () => {}), heart = jest.fn(async () => ({ average: 60, min: 50, max: 70 }));
    const fake = source('asked', { request, heart });
    let shown: ReturnType<typeof useRecovery> | null = null;
    function Probe({ focused }: { focused: boolean }) { shown = useRecovery(focused, fake, 7); return null; }
    const view = await render(<Probe focused={false} />);
    await settle();
    expect(heart).not.toHaveBeenCalled();
    await view.rerender(<Probe focused />);
    await waitFor(() => expect(shown!.recovery?.heartToday).toEqual({ average: 60, min: 50, max: 70 }));
    expect(request).not.toHaveBeenCalled();
  });
});
