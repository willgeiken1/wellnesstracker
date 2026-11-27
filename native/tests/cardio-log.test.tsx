import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { CardioStore } from '../src/features/cardio/store';
import { CardioLogSheet } from '../src/features/workout/sheets/cardio';
import { showToast } from '../src/features/shell/toast';
import { memoryRepository } from './workout-repository';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs';

let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({ useAuth: () => ({ pending: 0, syncStatus: 'idle', demo: false, repository: mockRepository }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useIsFocused: () => true, useLocalSearchParams: () => ({}) }));
jest.mock('../src/features/cardio/use-health-workouts', () => ({ useHealthWorkouts: () => null }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => { mockRepository = memoryRepository(); jest.clearAllMocks(); });

describe('CardioStore.logManual', () => {
  const base = { kind: 'run' as const, day: '2026-11-20', durationMs: 30 * 60_000, distanceM: 4828, notes: '' };
  test('saves a run with its distance, and keeps effort and start time on this phone only', () => {
    const store = new CardioStore(mockRepository);
    const row = store.logManual({ ...base, effort: 'hard', startedAt: 1_700_000_000_000 }, '2026-11-22');
    expect(mockRepository.list('cardio_sessions')).toHaveLength(1);
    expect(row.data).toMatchObject({ day: '2026-11-20', kind: 'run', duration_ms: 1_800_000, distance_m: 4828 });
    expect(row.data).not.toHaveProperty('effort');
    expect(mockRepository.localGet(`cardio.effort.${row.id}`)).toBe('hard');
    expect(mockRepository.localGet(`cardio.started.${row.id}`)).toBe(1_700_000_000_000);
  });
  test('refuses an unknown type, a bad distance, a future day and over-long notes, saving nothing', () => {
    const store = new CardioStore(mockRepository);
    expect(() => store.logManual({ ...base, kind: 'swim' as never }, '2026-11-22')).toThrow();
    expect(() => store.logManual({ ...base, distanceM: -1 }, '2026-11-22')).toThrow();
    expect(() => store.logManual({ ...base, distanceM: Number.NaN }, '2026-11-22')).toThrow();
    expect(() => store.logManual({ ...base, day: '2026-11-23' }, '2026-11-22')).toThrow();
    expect(() => store.logManual({ ...base, notes: 'x'.repeat(2001) }, '2026-11-22')).toThrow();
    expect(mockRepository.list('cardio_sessions')).toHaveLength(0);
  });
});

describe('Log cardio sheet', () => {
  const at = new Date(2026, 10, 22, 16, 12).getTime();
  test('saves the default 30 minute, 3 mile run and closes with a toast', async () => {
    await render(<CardioLogSheet at={at} />, { wrapper });
    expect(screen.getByRole('button', { name: 'Run' })).toBeSelected();
    await fireEvent.press(screen.getByText('Save'));
    const rows = mockRepository.list('cardio_sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({ day: '2026-11-22', kind: 'run', duration_ms: 1_800_000, distance_m: 4828 });
    expect(mockRepository.localGet(`cardio.effort.${rows[0].id}`)).toBe('moderate');
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Run saved/), expect.anything());
    expect(router.back).toHaveBeenCalled();
  });
  test('takes the distance in kilometres when Settings says km', async () => {
    mockRepository.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'units.distance', 'km'));
    await render(<CardioLogSheet at={at} />, { wrapper });
    expect(screen.getByRole('button', { name: /^More: Distance in kilometres/ })).toBeTruthy();
    expect(screen.queryByText('mi')).toBeNull();
    await fireEvent.press(screen.getByText('Save'));
    expect(mockRepository.list('cardio_sessions')[0].data).toMatchObject({ distance_m: 5000 });
  });
  test('the steppers change the minutes, and stairs save with no distance', async () => {
    await render(<CardioLogSheet at={at} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Stairs' }));
    await fireEvent.press(screen.getByRole('button', { name: /^More: Duration/ }));
    await fireEvent.press(screen.getByText('Save'));
    const row = mockRepository.list('cardio_sessions')[0];
    expect(row.data.kind).toBe('stairs');
    expect(row.data.distance_m).toBeNull();
    expect(Number(row.data.duration_ms)).toBeGreaterThan(1_800_000);
  });
});
