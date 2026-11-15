import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { useAuth } from '../src/auth/provider';
import { Recovery, hoursLabel, lastNightLine } from '../src/features/insights/recovery';
import type { HealthSource, SleepSpan } from '../src/features/health/source';

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn(() => ({})) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// Apple Health only here; Oura has its own tests.
jest.mock('../src/features/health/oura-client', () => ({ oura: jest.fn(() => null) }));
const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;
// Friday 9 a.m. on a made-up week.
const NOW = new Date(2026, 10, 13, 9, 0);
// The hook reads the last days from the real clock, so the clock is held at NOW (only Date is faked).
beforeAll(() => jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'] }));
afterAll(() => jest.useRealTimers());
/** Made-up readings only: 7 h 30 min every night, 8 h 12 min last night, 8,000 steps a day and 4,321 so far today. */
function source(): HealthSource {
  const spans: SleepSpan[] = [];
  for (let back = 40; back >= 0; back--) {
    const wake = new Date(2026, 10, 13 - back, back === 0 ? 7 : 6, back === 0 ? 12 : 30);
    spans.push({ start: new Date(2026, 10, 12 - back, 23, 0), end: wake });
  }
  return {
    access: async () => 'asked', request: async () => {}, weights: async () => [],
    steps: async (_from, to) => to.getTime() >= new Date(2026, 10, 13).getTime() ? 4321 : 8000,
    sleep: async () => spans,
  };
}

test('last night, the week and 30 nights of sleep, with steps, in plain facts', async () => {
  await render(wrap(<Recovery now={NOW} source={source()} />));
  expect(await screen.findByLabelText('Last night: 8 h 12 min. 42 min above your 7-night average.')).toBeTruthy();
  expect(screen.getByLabelText('Steps today: 4,321')).toBeTruthy();
  expect(screen.getByLabelText(/^Sleep, 7-night average: 7 h \d+ min$/)).toBeTruthy();
  expect(screen.getByLabelText(/^Steps, 7-day average: /)).toBeTruthy();
  expect(screen.getByLabelText('Sleep, last 30 nights. 30 of 30 nights recorded. Dashed line: 7 h')).toBeTruthy();
  expect(screen.getByText(/^From Apple Health or Oura\./)).toBeTruthy();
});

test('not connected: says how to connect, and the phone-only build says it does not read Apple Health', async () => {
  const view = await render(wrap(<Recovery now={NOW} source={null} />));
  expect(screen.getByRole('header', { name: 'Sleep and steps' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open Health & devices' })).toBeTruthy();
  jest.mocked(useAuth).mockReturnValue({ phoneOnly: true } as ReturnType<typeof useAuth>);
  await view.rerender(wrap(<Recovery now={NOW} source={null} />));
  expect(screen.getByText('This build does not read Apple Health, so there is no sleep or steps data to show.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open Health & devices' })).toBeNull();
});

test('a night with nothing recorded is unknown, not zero', () => {
  expect(lastNightLine([7.5, 7.5, null])).toBeNull();
  expect(lastNightLine([7, 8, 6.5])).toBe('1 h below your 7-night average.');
  expect(lastNightLine([7.5, 7.5])).toBe('Same as your 7-night average.');
  expect(hoursLabel(7.7)).toBe('7 h 42 min');
});

test('a week average needs three recorded days, and skips the days with nothing', () => {
  const { weekAverage } = require('../src/features/insights/recovery') as typeof import('../src/features/insights/recovery');
  expect(weekAverage([null, null, null, null, null, null, 6.5])).toBeNull();
  expect(weekAverage([0, 0, 0, 0, 7, 6, 8])).toBe(7);
  expect(weekAverage([9, 9, 9, 9, null, null, null, null, null, null, 6])).toBeNull();
});
