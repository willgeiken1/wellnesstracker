import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { Repository } from '../src/data/repository';
import { useAuth } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { BodyChart } from '../src/features/body/chart';
import { Body } from '../src/features/body/screen';
import { saveWeighIn } from '../src/features/body/model';
import { MiniChart } from '../src/features/insights/mini-chart';
import { Recovery } from '../src/features/insights/recovery';
import type { OuraRecovery } from '../src/features/health/oura';
import type { Recovery as RecoveryData } from '../src/features/health/recovery';
import { CHART_LINES_HINT, CHART_LINES_TITLE } from '../src/features/routines/model/chart-lines';
import { StartedLinesCard, startedDay, startedSpoken } from '../src/features/routines-ui/started-lines';
import { SAMPLE, SAMPLE_NOW, seededRepository, stored } from './routines-repository';

/* The "Started" lines on the Progress charts and the card that switches them on. Every routine, name and
   reading here is made up. */

jest.mock('../src/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const KEEP_REAL = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
const NAME = 'Started Zzyq Sample Vial';
/** The sample routines, with the made-up vial given a start day and its line on or off. */
function repoWith(startDate: string | null, chartLine = false) {
  const repo = seededRepository((store) => { Object.assign(store.compounds[0], { startDate, chartLine }); });
  jest.mocked(useAuth).mockReturnValue({ repository: repo } as ReturnType<typeof useAuth>);
  return repo;
}
const wrap = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;
const compound = (repo: Repository) => stored(repo).compounds.find(row => row.id === SAMPLE.compound)!;
// A week ending on the sample day, Monday November 23: the values stand for November 17 to 23.
const week = [41, 44, null, 47, 45, null, 49];
const recovery = (over: Partial<RecoveryData> = {}): RecoveryData => ({ night: null, restingHeartRate: [58, 57, 59, 58, 60, 57, 58], hrv: week, heartToday: null, vo2Max: null, ...over });
const ring: OuraRecovery = { readiness: [70, 72, 71, 74, 73, 75, 76], sleepScore: [80, 82, 79, 85, 84, 83, 86], hrv: [null, null, null, null, null, null, null], restingHeartRate: [null, null, null, null, null, null, null], night: null } as OuraRecovery;

beforeEach(() => { jest.useFakeTimers({ now: SAMPLE_NOW, doNotFake: [...KEEP_REAL] }); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('the card that switches the lines on', () => {
  test('draws nothing until something in Routines has a start day', async () => {
    repoWith(null);
    await render(wrap(<StartedLinesCard />));
    expect(screen.queryByTestId('started-lines')).toBeNull();
    expect(screen.queryByText(CHART_LINES_TITLE)).toBeNull();
  });
  test('has one switch for it, off, under the title and the line that says where it is drawn', async () => {
    const repo = repoWith('2026-11-20');
    await render(wrap(<StartedLinesCard />));
    expect(screen.getByRole('header', { name: 'Started lines' })).toBeTruthy();
    expect(screen.getByText(CHART_LINES_HINT)).toBeTruthy();
    expect(screen.getByText('Since Nov 20')).toBeTruthy();
    const toggle = screen.getByLabelText(NAME);
    expect(toggle.props.value).toBe(false);
    // Reading the card writes nothing.
    expect(compound(repo).chartLine).toBe(false);
  });
  test('turning it on writes only the switch, and turning it off takes it back', async () => {
    const repo = repoWith('2026-11-20');
    const before = stored(repo);
    await render(wrap(<StartedLinesCard />));
    await fireEvent(screen.getByLabelText(NAME), 'valueChange', true);
    expect(compound(repo).chartLine).toBe(true);
    expect(screen.getByLabelText(NAME).props.value).toBe(true);
    expect(compound(repo)).toMatchObject({ name: before.compounds[0].name, amount: before.compounds[0].amount, unit: before.compounds[0].unit, startDate: '2026-11-20' });
    expect(stored(repo).logs).toEqual(before.logs);
    expect(stored(repo).items).toEqual(before.items);
    await fireEvent(screen.getByLabelText(NAME), 'valueChange', false);
    expect(compound(repo).chartLine).toBe(false);
  });
  test('a start day reads as a short date, with the year when it is not this one', () => {
    expect(startedDay('2026-11-01', SAMPLE_NOW)).toBe('Nov 1');
    expect(startedDay('2025-03-09', SAMPLE_NOW)).toBe('Mar 9, 2025');
    expect(startedSpoken([{ date: '2026-11-20', label: NAME }])).toBe('Started Zzyq Sample Vial, Nov 20.');
    expect(startedSpoken([])).toBe('');
  });
});

describe('a small chart', () => {
  test('stands a thin line on the days it is given, and none without', async () => {
    const view = await render(wrap(<MiniChart values={week} color="#000000" first="Nov 17" last="Nov 23" marks={[3, -1, 9]} />));
    const marks = screen.getAllByTestId('chart-mark');
    expect(marks).toHaveLength(1);
    // The fourth of seven days: the middle of a 300 wide drawing.
    expect(marks[0].props).toMatchObject({ x1: 150, x2: 150, strokeWidth: 1.5 });
    await view.rerender(wrap(<MiniChart values={week} color="#000000" first="Nov 17" last="Nov 23" />));
    expect(screen.queryByTestId('chart-mark')).toBeNull();
  });
  test('on bars the line stands on the middle of its day', async () => {
    await render(wrap(<MiniChart bars values={[1, 2, 3, 4]} color="#000000" first="a" last="b" marks={[0]} />));
    expect(screen.getByTestId('chart-mark').props.x1).toBe(6 + 72 / 2);
  });
});

describe('Recovery', () => {
  const show = () => render(wrap(<Recovery access="asked" recovery={recovery()} oura={ring} now={SAMPLE_NOW} />));
  test('with every switch off no chart carries a line, and the card sits under the charts', async () => {
    repoWith('2026-11-20');
    await show();
    expect(screen.queryByTestId('chart-mark')).toBeNull();
    expect(screen.queryByTestId('recovery-hrv-started')).toBeNull();
    expect(within(screen.getByTestId('recovery-started-lines')).getByLabelText(NAME).props.value).toBe(false);
  });
  test('switched on, the line stands on its day on the sleep and heart rate variability charts only', async () => {
    repoWith('2026-11-20', true);
    await show();
    for (const card of ['recovery-hrv', 'recovery-sleep-score']) {
      const chart = within(screen.getByTestId(card));
      expect(chart.getAllByTestId('chart-mark')).toHaveLength(1);
      expect(chart.getByTestId('chart-mark').props.x1).toBe(150);
      expect(within(screen.getByTestId(`${card}-started`)).getByText('Started Zzyq Sample Vial, Nov 20')).toBeTruthy();
      // The card is one picture to VoiceOver, so its label says what the line is.
      expect(screen.getByTestId(card).props.accessibilityLabel).toMatch(/\. Started Zzyq Sample Vial, Nov 20\.$/);
    }
    for (const card of ['recovery-resting', 'recovery-readiness']) {
      expect(within(screen.getByTestId(card)).queryByTestId('chart-mark')).toBeNull();
      expect(screen.getByTestId(card).props.accessibilityLabel).not.toMatch(/Started/);
    }
  });
  test('switching it on from the card draws the line at once', async () => {
    const repo = repoWith('2026-11-20');
    await show();
    await fireEvent(screen.getByLabelText(NAME), 'valueChange', true);
    expect(compound(repo).chartLine).toBe(true);
    expect(within(screen.getByTestId('recovery-hrv')).getAllByTestId('chart-mark')).toHaveLength(1);
  });
  test('a start day before the chart begins draws no line', async () => {
    repoWith('2026-11-01', true);
    await show();
    expect(screen.queryByTestId('chart-mark')).toBeNull();
    expect(screen.queryByText(/Started Zzyq Sample Vial, Nov 1/)).toBeNull();
  });
  test('with no routines the charts are as they were', async () => {
    jest.mocked(useAuth).mockReturnValue({ repository: null } as unknown as ReturnType<typeof useAuth>);
    await show();
    expect(screen.getByTestId('recovery-hrv')).toBeTruthy();
    expect(screen.queryByTestId('recovery-started-lines')).toBeNull();
    expect(screen.queryByTestId('chart-mark')).toBeNull();
  });
});

describe('the weight chart', () => {
  const points = ['2026-11-10', '2026-11-15', '2026-11-20'].map((day, i) => ({ day, kg: 80 - i, trendKg: 80 - i, count: 1 }));
  test('stands a line on a start day inside its range and ignores one outside', async () => {
    await render(wrap(<BodyChart points={points} raw={[]} unit="kg" started={['2026-11-15', '2026-11-01', '2026-11-22']} />));
    const marks = screen.getAllByTestId('body-chart-mark');
    expect(marks).toHaveLength(1);
    // Half way between the first day and the last.
    expect(marks[0].props.x1).toBeCloseTo(150);
  });
  test('on Body the line and its words show once switched on, with the card under the chart', async () => {
    const repo = repoWith('2026-11-21', true);
    for (const [day, weight] of [['2026-11-19', 80], ['2026-11-21', 79.6], ['2026-11-23', 79.4]] as const) saveWeighIn(repo, weight, 'kg', day);
    await render(wrap(<Body repository={repo} />));
    expect(screen.getAllByTestId('body-chart-mark')).toHaveLength(1);
    expect(within(screen.getByTestId('body-started')).getByText('Started Zzyq Sample Vial, Nov 21')).toBeTruthy();
    expect(within(screen.getByTestId('body-started-lines')).getByLabelText(NAME).props.value).toBe(true);
    await fireEvent(screen.getByLabelText(NAME), 'valueChange', false);
    expect(screen.queryByTestId('body-chart-mark')).toBeNull();
    expect(screen.queryByTestId('body-started')).toBeNull();
    // The weigh-ins are untouched, and no reading was written into a routine.
    expect(repo.list('weigh_ins')).toHaveLength(3);
    expect(JSON.stringify(stored(repo))).not.toMatch(/79\.6|weight/);
  });
});
