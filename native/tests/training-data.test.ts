import { memoryRepository } from './workout-repository';
import type { Repository } from '../src/data/repository';
import { WorkoutStore } from '../src/data/workout/store';
import { PlanStore } from '../src/features/plans/store';
import { TrainingData, clock, epley, liftNames, muscleGroup } from '../src/features/workout/training-data';
import { seedTrainingDemo } from '../src/features/workout/training-demo';

const NOW = new Date(2026, 10, 22, 16, 13).getTime();
const repo = () => memoryRepository() as unknown as Repository;

describe('Training data', () => {
  test('a clock reads minutes and seconds, then hours', () => {
    expect(clock(25 * 60_000 + 13_000)).toBe('25:13');
    expect(clock(3_723_000)).toBe('1:02:03');
  });
  test('Epley estimates a one rep max from a set', () => {
    expect(Math.round(epley(245, 5))).toBe(286);
    expect(epley(100, 0)).toBe(0);
  });
  test('library muscles fold into the ten groups', () => {
    expect(muscleGroup('lats')).toBe('Back');
    expect(muscleGroup('sideDelts')).toBe('Shoulders');
    expect(muscleGroup('abs')).toBe('Core');
    expect(muscleGroup(undefined)).toBeNull();
    expect(liftNames('Back squat')).toContain('squat');
  });
  test('an empty account has nothing going and a 60 minute goal', () => {
    const d = new TrainingData(repo(), NOW);
    expect(d.live()).toBeNull();
    expect(d.goalMin()).toBe(60);
    expect(d.todayMin()).toBe(0);
    expect(d.week().days).toHaveLength(7);
    expect(d.recent()).toEqual([]);
  });
  test('the live workout counts working sets and points at the next one', () => {
    const r = repo(), w = new WorkoutStore(r);
    const s = w.start(undefined, NOW - 10 * 60_000);
    const a = w.addExercise(s.id, 'Squat', 2), b = w.addExercise(s.id, 'Leg Press', 2);
    w.editDraft(a.id, 0, { weight: '225', reps: '5' }); w.toggleDone(a.id, 0, NOW - 60_000);
    w.editDraft(a.id, 1, { weight: '225', reps: '5' });
    const d = new TrainingData(r, NOW), live = d.live()!;
    expect(live.done).toBe(1);
    expect(live.total).toBe(4);
    expect(live.matrix).toEqual([1, 'now', 0, 0]);
    expect(live.groups).toEqual([2, 2]);
    expect(live.next).toMatchObject({ name: 'Squat', set: 2, weight: 225, reps: 5 });
    expect(live.volume).toBe(1125);
    expect(d.todayMin()).toBe(10);
    expect(b.id).toBeTruthy();
  });
  test('the goal is the person\'s own, kept on the phone', () => {
    const r = repo(), d = new TrainingData(r, NOW);
    d.setGoalMin(45);
    expect(new TrainingData(r, NOW).goalMin()).toBe(45);
  });
  test('the demo account gets a plan, history, records and a workout going now', () => {
    const r = repo();
    seedTrainingDemo(r, NOW);
    const d = new TrainingData(r, NOW);
    expect(new PlanStore(r).read().days).toHaveLength(6);
    expect(d.planName()).toBe('Push Pull Legs');
    expect(d.live()?.done).toBe(8);
    expect(d.history().length).toBeGreaterThan(30);
    expect(d.records().length).toBeGreaterThan(0);
    expect(d.liftHistory('Back squat').length).toBeGreaterThan(4);
    expect(d.weekHits()).toHaveLength(8);
    expect(d.cardioWeek().length).toBeGreaterThan(0);
    expect(d.muscles('sets', false).some(m => m.v > 0)).toBe(true);
    // seeding twice changes nothing
    const count = r.list('sessions').length;
    seedTrainingDemo(r, NOW);
    expect(r.list('sessions')).toHaveLength(count);
  });
  test('a real account never gets demo samples', () => {
    const r = { ...memoryRepository(), owner: 'user-1' } as unknown as Repository;
    seedTrainingDemo(r, NOW);
    expect(r.list('routines')).toHaveLength(0);
  });
});
