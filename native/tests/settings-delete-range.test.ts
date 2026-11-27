import { memoryRepository } from './workout-repository';
import { deleteDateRange, firstLoggedDay, isoDay, registerRangeDeleter, canDeleteKind } from '../src/features/settings/delete-range';
import { backupWhen } from '../src/features/settings/data-actions';
import { readSettingsPrefs } from '../src/features/settings/prefs';
import { rangeBounds, rangeDays } from '../src/features/settings/more-pages';
import type { Repository } from '../src/data/repository';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/phone-only/export', () => ({ exportPhoneBackup: jest.fn(), exportAccountBackup: jest.fn() }));

const seed = () => {
  const repo = memoryRepository() as unknown as Repository;
  const inside = repo.save('sessions', { day: '2026-11-17', name: 'Legs' });
  const entry = repo.save('entries', { session_id: inside.id, exercise: 'squat', position: 0 });
  repo.save('sets', { entry_id: entry.id, position: 0, weight_kg: 100 });
  const outside = repo.save('sessions', { day: '2026-11-10', name: 'Push' });
  repo.save('food_entries', { day: '2026-11-18', name: 'Oats' });
  repo.save('food_entries', { day: '2026-11-09', name: 'Rice' });
  repo.save('weigh_ins', { day: '2026-11-18', weight_kg: 80 });
  repo.localSave('foodWater', { v: 1, log: { '2026-11-18': [{ id: 'a', oz: 8 }], '2026-11-01': [{ id: 'b', oz: 8 }] } });
  repo.localSave('progressPhotos', [{ id: 'p1', day: '2026-11-18' }, { id: 'p2', day: '2026-10-01' }]);
  return { repo, outside };
};
const live = (repo: Repository, table: Parameters<Repository['list']>[0]) => repo.list(table).filter(r => r.deleted_at === null);

describe('Delete a date range', () => {
  test('removes only the picked kinds on the picked days, with a workout’s exercises and sets', () => {
    const { repo, outside } = seed();
    const n = deleteDateRange(repo, '2026-11-16', '2026-11-22', ['workouts', 'food']);
    expect(live(repo, 'sessions').map(r => r.id)).toEqual([outside.id]);
    expect(live(repo, 'entries')).toHaveLength(0);
    expect(live(repo, 'sets')).toHaveLength(0);
    expect(live(repo, 'food_entries').map(r => r.data.name)).toEqual(['Rice']);
    expect(Object.keys(repo.localGet<{ log: Record<string, unknown> }>('foodWater')!.log)).toEqual(['2026-11-01']);
    // Body and photos were not picked, so they stay.
    expect(live(repo, 'weigh_ins')).toHaveLength(1);
    expect(repo.localGet<unknown[]>('progressPhotos')).toHaveLength(2);
    expect(n).toBe(5);
  });
  test('body and photos go only when picked', () => {
    const { repo } = seed();
    deleteDateRange(repo, '2026-11-16', '2026-11-22', ['body', 'photos']);
    expect(live(repo, 'weigh_ins')).toHaveLength(0);
    expect(repo.localGet<{ id: string }[]>('progressPhotos')!.map(p => p.id)).toEqual(['p2']);
    expect(live(repo, 'sessions')).toHaveLength(2);
  });
  test('routine check-ins can only be picked once their store adds a deleter', () => {
    expect(canDeleteKind('routines')).toBe(false);
    const fn = jest.fn(() => 3);
    registerRangeDeleter('routines', fn);
    expect(canDeleteKind('routines')).toBe(true);
    const { repo } = seed();
    expect(deleteDateRange(repo, '2026-11-16', '2026-11-22', ['routines'])).toBe(3);
    expect(fn).toHaveBeenCalledWith(repo, '2026-11-16', '2026-11-22');
  });
  test('presets cover today, the week from its first day, the last 30 days and since the first log', () => {
    const today = new Date(2026, 10, 22); // a Sunday
    expect(rangeDays('today', today).map(isoDay)).toEqual(['2026-11-22', '2026-11-22']);
    expect(rangeDays('week', today, 'mon').map(isoDay)).toEqual(['2026-11-16', '2026-11-22']);
    expect(rangeDays('week', today, 'sun').map(isoDay)).toEqual(['2026-11-22', '2026-11-22']);
    expect(rangeDays('d30', today).map(isoDay)).toEqual(['2026-10-24', '2026-11-22']);
    expect(rangeDays('all', today, 'mon', new Date(2026, 9, 1)).map(isoDay)).toEqual(['2026-10-01', '2026-11-22']);
  });
});

describe('Since you joined', () => {
  const today = new Date(2026, 10, 22);
  test('starts at the oldest thing kept only on this iPhone when it is older than any synced record', () => {
    const { repo } = seed();
    repo.localSave('progressNeck', [{ day: '2026-03-04', cm: 38 }]);
    expect(firstLoggedDay(repo)).toBe('2026-03-04');
    expect(rangeBounds('all', repo, today).map(isoDay)).toEqual(['2026-03-04', '2026-11-22']);
  });
  test('with only water logged, shows from the first water day, not just today', () => {
    const repo = memoryRepository() as unknown as Repository;
    repo.localSave('foodWater', { v: 1, log: { '2026-02-01': [{ id: 'a', oz: 8 }], '2026-02-03': [] } });
    expect(rangeBounds('all', repo, today).map(isoDay)).toEqual(['2026-02-01', '2026-11-22']);
  });
  test('the range shown is the range deleted: nothing outside it goes', () => {
    const { repo } = seed();
    repo.localSave('progressBodyFat', [{ day: '2026-04-01', pct: 18 }]);
    const [from, to] = rangeBounds('all', repo, today);
    deleteDateRange(repo, isoDay(from), isoDay(to), ['workouts', 'food', 'body', 'photos']);
    expect(repo.localGet<unknown[]>('progressBodyFat')).toEqual([]);
    expect(live(repo, 'sessions')).toHaveLength(0);
    expect(repo.localGet<unknown[]>('progressPhotos')).toEqual([]);
  });
  test('a store that adds a deleter can say how far back it goes', () => {
    registerRangeDeleter('routines', () => 0, () => '2025-12-31');
    const repo = memoryRepository() as unknown as Repository;
    expect(firstLoggedDay(repo)).toBe('2025-12-31');
    registerRangeDeleter('routines', () => 0);
    expect(firstLoggedDay(repo)).toBeUndefined();
  });
  test('with nothing logged, it is today alone', () => {
    expect(rangeBounds('all', memoryRepository() as unknown as Repository, today).map(isoDay)).toEqual(['2026-11-22', '2026-11-22']);
  });
});

describe('Last backup', () => {
  test('is kept with the settings choices and reads as the mockup words it', () => {
    expect(readSettingsPrefs({ data: { lastBackup: 5 } }).data.lastBackup).toBe(5);
    expect(readSettingsPrefs({ data: { lastBackup: 'x' } }).data.lastBackup).toBe(0);
    const now = new Date(2026, 10, 22, 12);
    expect(backupWhen(new Date(2026, 10, 22, 9, 41).getTime(), now)).toBe('today, 9:41 AM');
    expect(backupWhen(new Date(2026, 10, 21, 9, 41).getTime(), now)).toBe('yesterday, 9:41 AM');
    expect(backupWhen(new Date(2026, 10, 2).getTime(), now)).toBe('Nov 2');
  });
});

describe('Auth errors read without the auth module', () => {
  test('match what the Account screen said for each error class', () => {
    const { AccountDeletionFailed, AccountDeletionUncertain, DepartureFailure } = jest.requireActual('../src/auth/sign-out') as typeof import('../src/auth/sign-out');
    const { deletionError, signOutError } = require('../src/features/settings/auth-errors') as typeof import('../src/features/settings/auth-errors');
    expect(deletionError(new AccountDeletionFailed())).toBe('deleteAccountFailed');
    expect(deletionError(new AccountDeletionUncertain())).toBe('deleteAccountUncertain');
    expect(deletionError(new DepartureFailure())).toBe('signOutFailed');
    expect(deletionError(new Error('x'))).toBe('deleteAccountUncertain');
    expect(signOutError(new DepartureFailure())).toBe('signOutFailed');
    expect(signOutError(new Error('x'))).toBe('signOutNotStarted');
  });
});
