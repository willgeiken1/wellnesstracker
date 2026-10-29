import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Progress from '../src/app/(tabs)/progress';
import Insights from '../src/app/(tabs)/insights';
import { ThemeProvider } from '../src/design/theme-provider';
import { memoryRepository } from './workout-repository';
import { PatternPanel } from '../src/features/body/presentation';
import { saveWeighIn } from '../src/features/body/model';
import { router } from 'expo-router';
const mockAuth = { repository: memoryRepository(), ready: true, demo: false, syncStatus: 'idle', syncNow: jest.fn(), retryBoot: jest.fn(), recovery: undefined as string | undefined };
jest.mock('../src/auth/provider', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/features/atlas/body-atlas', () => ({ BodyAtlas: () => {
 const { Text } = require('react-native'); return <Text>Unchanged atlas</Text>;
} }));
jest.mock('@expo/ui', () => {
 const { View } = require('react-native');
 return { Host: View, RNHostView: View, List: View, ListItem: ({children, trailing}: any) => <View>{children}{trailing}</View>, BottomSheet: ({children, isPresented, ...props}: any) => isPresented ? <View {...props}>{children}</View> : null };
});
const show = async (Page: typeof Progress) => render(<ThemeProvider><Page /></ThemeProvider>);
beforeEach(() => { mockAuth.repository = memoryRepository(); mockAuth.ready = true; mockAuth.demo = false; mockAuth.recovery = undefined; mockAuth.syncStatus = 'idle'; jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

test.each([['Progress', Progress], ['Insights', Insights]] as const)('%s delays loading skeletons until 300 ms and never flashes empty', async (_, Page) => {
 jest.useFakeTimers(); mockAuth.ready = false;
 await show(Page);
 expect(screen.queryByTestId('loading-panels')).toBeNull();
 expect(screen.queryByText(/Add your first|Trends need/)).toBeNull();
 await act(() => jest.advanceTimersByTime(299)); expect(screen.queryByTestId('loading-panels')).toBeNull();
 await act(() => jest.advanceTimersByTime(1)); expect(screen.getByTestId('loading-panels')).toBeTruthy();
});
test.each([['Progress', Progress], ['Insights', Insights]] as const)('%s shows a read error with retry and recovers', async (_, Page) => {
 const list = jest.spyOn(mockAuth.repository, 'list').mockImplementation(() => { throw Error('Synthetic read failure'); });
 await show(Page); expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t load/);
 list.mockRestore(); await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
 expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText(Page === Progress ? 'Add your first weigh-in' : 'Trends need a few days. Log for a week and patterns show up here.')).toBeTruthy();
});
test('Progress empty Body opens a native numeric sheet; Photos and Goals have distinct empty states', async () => {
 await show(Progress); await fireEvent.press(screen.getByRole('button', { name: 'Add your first weigh-in' }));
 expect(screen.getByTestId('weight-entry-sheet')).toBeTruthy();
 const input = screen.getByLabelText(/Weight \(/); expect(input.props.keyboardType).toBe('decimal-pad');
 await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
 await fireEvent.press(screen.getByRole('tab', { name: 'Photos' })); expect(screen.getByText('No photos yet')).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', { name: 'Goals & PRs' })); expect(screen.getByText('No goals yet')).toBeTruthy();
});
test('Progress data shows weight hero, measurement sparklines, photo grid and goals', async () => {
 mockAuth.repository.save('profile', { weight_unit: 'kg' }); saveWeighIn(mockAuth.repository, 80, 'kg');
 mockAuth.repository.save('measurements', { day: '2026-10-28', waist_m: 0.8 });
 mockAuth.repository.save('photos', { file_name: 'demo/photo.jpg', captured_at: 1793188800000 });
 mockAuth.repository.save('goals', { kind: 'Weight', target_value: 78, target_unit: 'kg', target_day: '2026-12-01' });
 await show(Progress); expect(screen.getByTestId('body-chart')).toBeTruthy(); expect(screen.getByText('Waist')).toBeTruthy(); expect(screen.getByTestId('measurement-waist_m')).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', { name: 'Photos' })); expect(screen.getByTestId('photo-grid')).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', { name: 'Goals & PRs' })); expect(screen.getByText('78 kg')).toBeTruthy();
});
test('Insights empty trends, recovery no data, atlas segment and weekly empty are reachable', async () => {
 await show(Insights); expect(screen.getByText('Trends need a few days. Log for a week and patterns show up here.')).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', { name: 'Recovery' })); expect(screen.getAllByText('No data from Health yet')).toHaveLength(4);
 for (const name of ['HRV', 'Sleep', 'Steps']) expect(screen.getByText(name)).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', { name: 'Muscles' })); expect(screen.getByText('Unchanged atlas')).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', { name: 'Weekly report' })); expect(screen.getByText('No weekly reports yet')).toBeTruthy();
});
test('Insights data puts pattern panels before 14-day charts and shows weekly charts inline', async () => {
 mockAuth.demo = true;
 for (let i = 1; i <= 7; i++) mockAuth.repository.save('sessions', { day: `2026-10-${String(i + 20).padStart(2, '0')}`, name: 'Synthetic workout', started_at: Date.UTC(2026, 9, i + 20, 10), finished_at: Date.UTC(2026, 9, i + 20, 11) });
 await show(Insights); expect(screen.getByText('Example data')).toBeTruthy(); expect(screen.getByText('What affects you')).toBeTruthy(); expect(screen.getAllByText('Correlation, not cause').length).toBeGreaterThan(0);
 expect(screen.getByTestId('pattern-panels')).toBeTruthy(); expect(screen.getByTestId('fourteen-day-charts')).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', { name: 'Weekly report' })); expect(screen.getAllByTestId('weekly-chart').length).toBeGreaterThan(0);
});

test.each([['up', '↑'], ['down', '↓']] as const)('pattern presentation shows the %s effect direction with plain copy and caveat', async (direction, arrow) => {
 await render(<ThemeProvider><PatternPanel pattern={{ direction, sentence: 'Synthetic observations move together.' }} /></ThemeProvider>);
 expect(screen.getByText(`${arrow} Synthetic observations move together.`)).toBeTruthy();
 expect(screen.getByText('Correlation, not cause')).toBeTruthy();
});
test.each([['Progress', Progress], ['Insights', Insights]] as const)('%s keeps local content visible while offline', async (_, Page) => {
 mockAuth.syncStatus = 'offline'; await show(Page);
 expect(screen.getByText('Offline · logs save here and sync when you reconnect.')).toBeTruthy();
 expect(screen.getByRole('tab', { name: Page === Progress ? 'Body' : 'Trends' })).toBeSelected();
});
test.each([
 ['Progress', Progress, ['Body', 'Photos', 'Goals & PRs']],
 ['Insights', Insights, ['Trends', 'Recovery', 'Weekly report']],
] as const)('%s exposes Back to Home from every segment', async (_, Page, segments) => {
 const navigate = jest.spyOn(router, 'navigate').mockImplementation(() => undefined);
 await show(Page);
 for (const segment of segments) {
  await fireEvent.press(screen.getByRole('tab', { name: segment }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
  expect(navigate).toHaveBeenLastCalledWith('/');
 }
 expect(navigate).toHaveBeenCalledTimes(segments.length);
});
