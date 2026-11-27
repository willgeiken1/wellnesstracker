import { memoryRepository } from './workout-repository';
import type { Repository } from '../src/data/repository';
import { WorkoutStore } from '../src/data/workout/store';
import { cartItem, cartTotals } from '../src/features/food/cart';
import { loggerView } from '../src/features/workout/logger/model';
import { TrainingData } from '../src/features/workout/training-data';

const NOW = new Date(2026, 10, 22, 16, 13).getTime();
/** Made-up sample workout and foods only. */
function kgSquatInLbWorkout() {
  const r = memoryRepository() as unknown as Repository, w = new WorkoutStore(r);
  w.preferences().saveMachine('Squat', { text: '', unit_override: 'kg' }, 'lb');
  const s = w.start(undefined, NOW - 10 * 60_000);
  const sq = w.addExercise(s.id, 'Squat', 1), lp = w.addExercise(s.id, 'Leg Press', 1);
  w.editDraft(sq.id, 0, { weight: '100', reps: '5' }); w.toggleDone(sq.id, 0, NOW - 120_000);
  w.editDraft(lp.id, 0, { weight: '200', reps: '10' }); w.toggleDone(lp.id, 0, NOW - 60_000);
  return { r, w, s, sq };
}

describe('workout volume across units', () => {
  test('a kg exercise in a lb workout counts its sets in lb', () => {
    const { r, w, s, sq } = kgSquatInLbWorkout();
    expect(w.unit(sq.id)).toBe('kg');
    expect(w.unit()).toBe('lb');
    // 100 kg x 5 is about 1,102 lb, plus 200 lb x 10.
    const v = loggerView(w, s);
    expect(v.unit).toBe('lb');
    expect(v.volume).toBeCloseTo(100 / 0.45359237 * 5 + 2000, 1);
    expect(new TrainingData(r, NOW).live()!.volume).toBeCloseTo(100 / 0.45359237 * 5 + 2000, 1);
  });
});

describe('one-side sets and the next-set weight', () => {
  test('a one-side set adds both sides to the live and logger volume, as Progress does', () => {
    const r = memoryRepository() as unknown as Repository, w = new WorkoutStore(r);
    w.preferences().saveMachine('Split Squat', { text: '', unit_override: 'lb' }, 'lb');
    const s = w.start(undefined, NOW - 10 * 60_000);
    const e = w.addExercise(s.id, 'Split Squat', 1);
    w.setUnilateral(e.id, true);
    w.editDraft(e.id, 0, { weight: '40', reps: '10', rightWeight: '30', rightReps: '8' }); w.toggleDone(e.id, 0, NOW - 60_000);
    expect(loggerView(w, s).volume).toBeCloseTo(400 + 240, 5);
    expect(new TrainingData(r, NOW).live()!.volume).toBeCloseTo(400 + 240, 5);
  });
  test('a finished one-side workout counts both sides in the week', () => {
    const r = memoryRepository() as unknown as Repository, w = new WorkoutStore(r);
    const s = w.start(undefined, NOW - 10 * 60_000);
    const e = w.addExercise(s.id, 'Split Squat', 1);
    w.setUnilateral(e.id, true);
    w.editDraft(e.id, 0, { weight: '40', reps: '10', rightWeight: '30', rightReps: '8' }); w.toggleDone(e.id, 0, NOW - 60_000);
    w.finish(s.id, { startedAt: NOW - 10 * 60_000, finishedAt: NOW - 30_000, notes: '' }, NOW);
    const data = new TrainingData(r, NOW), done = data.history()[0];
    expect(data.sessionVolume(done)).toBeCloseTo(640, 1);
  });
  test("the next set's typed weight shows in the profile unit", () => {
    const { r, w, sq } = kgSquatInLbWorkout();
    w.addSet(sq.id);
    w.editDraft(sq.id, 1, { weight: '100', reps: '' });
    const next = new TrainingData(r, NOW).live()!.next!;
    expect(next.name).toBe('Squat');
    expect(next.weight).not.toBe(100);
    expect(next.weight).toBeCloseTo(220.5, 0);
  });
});

describe('the Log food tray totals', () => {
  const quick = { name: 'Synthetic quick lunch', energy_kj: 600 * 4.184, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
  const mystery = { ...quick, name: 'Synthetic mystery', energy_kj: null };
  test('keep protein unknown when no food in the tray gave it', () => {
    expect(cartTotals([cartItem('a', quick)])).toEqual({ kcal: 600, p: null });
  });
  test('keep energy unknown when no food gave it, and count only known values otherwise', () => {
    expect(cartTotals([cartItem('m', mystery)])).toEqual({ kcal: null, p: null });
    expect(cartTotals([cartItem('a', quick), cartItem('b', { ...quick, protein_g: 12 })])).toEqual({ kcal: 1200, p: 12 });
    expect(cartTotals([])).toEqual({ kcal: null, p: null });
  });
});
