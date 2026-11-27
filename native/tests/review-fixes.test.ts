import { WorkoutStore } from '../src/data/workout/store';
import { repeatSession } from '../src/features/workout/start-workout';
import { actionSheet } from '../src/features/workout/action-sheet';
import { trainingNav } from '../src/features/workout/nav';
import { TrainingData } from '../src/features/workout/training-data';
import { heroInput } from '../src/features/home/hero/data';
import { loadSettingsPrefs, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs-model';
import { saveProfileUnit } from '../src/features/onboarding/model';
import { buildCsvs } from '../src/features/progress/export';
import { addDays, emptyProgress } from '../src/features/progress/model';
import { mergeHealthDays } from '../src/features/health/oura';
import type { HealthDays } from '../src/features/health/days';
import { memoryRepository } from './workout-repository';

jest.mock('../src/features/workout/action-sheet', () => ({ actionSheet: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));

const lines = (csv: string) => csv.trimEnd().split('\r\n');
beforeEach(() => jest.clearAllMocks());

describe('repeating a workout that had no template while another is going', () => {
  test('offers to resume the one going, and Resume opens the logger', () => {
    const repo = memoryRepository(), w = new WorkoutStore(repo);
    const old = w.start();
    w.addExercise(old.id, 'Squat', 4);
    repo.save('sessions', { ...repo.get('sessions', old.id)!.data, finished_at: Date.now() }, old.id);
    const live = w.start();
    const logger = jest.spyOn(trainingNav, 'logger').mockImplementation(() => {});
    expect(repeatSession(repo as never, old.id)).toBeNull();
    const sheet = (actionSheet as jest.Mock).mock.calls[0][0] as { actions: { label: string; run: () => void }[] };
    expect(sheet.actions).toHaveLength(1);
    sheet.actions[0].run();
    expect(logger).toHaveBeenCalledTimes(1);
    // Nothing was added to the workout that's going.
    expect(w.entries(live.id)).toHaveLength(0);
  });
  test('with nothing going it starts a copy and opens the logger', () => {
    const repo = memoryRepository(), w = new WorkoutStore(repo);
    const old = w.start();
    w.addExercise(old.id, 'Squat', 4);
    repo.save('sessions', { ...repo.get('sessions', old.id)!.data, finished_at: Date.now() }, old.id);
    const logger = jest.spyOn(trainingNav, 'logger').mockImplementation(() => {});
    const s = repeatSession(repo as never, old.id)!;
    expect(w.entries(s.id).map(e => String(e.data.exercise))).toEqual(['Squat']);
    expect(w.drafts(w.entries(s.id)[0].id)).toHaveLength(4);
    expect(logger).toHaveBeenCalledTimes(1);
  });
});

describe('the daily training goal is the one set in Settings', () => {
  test('Training reads and writes the Settings goal', () => {
    const repo = memoryRepository();
    expect(new TrainingData(repo as never).goalMin()).toBe(60);
    repo.localSave(SETTINGS_PREFS_KEY, withPref(loadSettingsPrefs(repo), 'goals.train', 45));
    expect(new TrainingData(repo as never).goalMin()).toBe(45);
    new TrainingData(repo as never).setGoalMin(90);
    expect(loadSettingsPrefs(repo).goals.train).toBe(90);
  });
  test('the Home hero measures training against the Settings goal', () => {
    const now = new Date(2026, 10, 27, 15);
    const goal = (g?: number) => heroInput(null, null, 'kcal', now, false, undefined, g).goals.trainMin;
    expect(goal()).toBe(60);
    expect(goal(45)).toBe(45);
    expect(goal(0)).toBe(60);
  });
});

describe('changing the weight unit during a workout', () => {
  test('typed weights not yet logged keep the same load in the new unit', () => {
    const repo = memoryRepository(), w = new WorkoutStore(repo);
    repo.save('profile', { name: 'Sam', dob: '1990-01-01', weight_unit: 'lb', height_m: 1.8 });
    const s = w.start(), e = w.addExercise(s.id, 'Bench Press', 2);
    w.editDraft(e.id, 0, { weight: '225', reps: '5' });
    saveProfileUnit(repo, 'kg');
    expect(w.unit(e.id)).toBe('kg');
    const d = w.drafts(e.id);
    expect(Number(d[0].weight)).toBeCloseTo(102, 0);
    expect(d[0].reps).toBe('5');
    expect(d[1].weight).toBe('');
  });
  test('a finished workout keeps its weights as they were', () => {
    const repo = memoryRepository(), w = new WorkoutStore(repo);
    repo.save('profile', { name: 'Sam', dob: '1990-01-01', weight_unit: 'lb', height_m: 1.8 });
    const s = w.start(), e = w.addExercise(s.id, 'Bench Press', 1);
    w.editDraft(e.id, 0, { weight: '225', reps: '5' });
    repo.save('sessions', { ...repo.get('sessions', s.id)!.data, finished_at: Date.now() }, s.id);
    saveProfileUnit(repo, 'kg');
    expect(repo.localGet<{ weight: string }[]>(`draft:${e.id}`)![0].weight).toBe('225');
  });
});

describe('export', () => {
  const today = '2026-11-27';
  test('cardio sessions are in the workouts export', () => {
    const repo = memoryRepository();
    repo.save('cardio_sessions', { day: '2026-11-20', kind: 'run', duration_ms: 30 * 60000, distance_m: 5000, notes: 'Easy' });
    repo.save('cardio_sessions', { day: '2026-11-25', kind: 'bike', duration_ms: 45 * 60000, distance_m: null, notes: '' });
    const files = buildCsvs(repo as never, emptyProgress(today, 'kg'), ['work'], 'all');
    const cardio = files.find(f => f.name === 'cardio.csv')!;
    expect(lines(cardio.csv)[0]).toBe('date,activity,minutes,distance_km,notes');
    expect(lines(cardio.csv).slice(1)).toEqual([expect.stringMatching(/^2026-11-20,[^,]+,30,5,Easy$/), expect.stringMatching(/^2026-11-25,[^,]+,45,,$/)]);
  });
  test('with no cardio there is no cardio file', () => {
    expect(buildCsvs(memoryRepository() as never, emptyProgress(today, 'kg'), ['work'], 'all').map(f => f.name)).toEqual(['workouts-and-sets.csv']);
  });
  test('each night of sleep says where it came from when Apple Health fills an Oura gap', () => {
    const blank: Omit<HealthDays, 'sleepHours' | 'sleepFrom'> = { steps: null, activeKcal: null, exerciseMinutes: null, waterMl: null, mindfulMinutes: null, bodyFat: null };
    const merged = mergeHealthDays({ ...blank, sleepHours: [7, 6.5, 8], sleepFrom: ['apple', 'apple', 'apple'] }, { ...blank, sleepHours: [7.5, null, 8.25], sleepFrom: ['oura', null, 'oura'] })!;
    expect(merged.sleepHours).toEqual([7.5, 6.5, 8.25]);
    expect(merged.sleepFrom).toEqual(['oura', 'apple', 'oura']);
    const d = emptyProgress(today, 'kg'), n = d.days.sleep.length;
    d.sources = { ...d.sources, oura: true, apple: true };
    d.days.sleep = d.days.sleep.slice(); d.sleepFrom = Array(n).fill(null);
    merged.sleepHours!.forEach((h, i) => { d.days.sleep[n - 3 + i] = h; d.sleepFrom![n - 3 + i] = merged.sleepFrom![i] === 'oura' ? 'Oura' : 'Apple Health'; });
    expect(lines(buildCsvs(memoryRepository() as never, d, ['sleep'], '30')[0].csv).slice(1)).toEqual([
      `${addDays(today, -2)},7.5,Oura`, `${addDays(today, -1)},6.5,Apple Health`, `${today},8.25,Oura`,
    ]);
  });
});
