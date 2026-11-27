import { localDay, toKg } from '../../core/workout/rules';
import type { Repository } from '../../data/repository';
import { rpeKey } from './logger/model';
import { liveReads } from '../../data/read-cache';
import { syncedTables } from '../../data/rows';
import { WorkoutStore } from '../../data/workout/store';
import { PlanStore } from '../plans/store';

/* Synthetic Training samples for "Look around first" (the demo account only): a six day plan, eight weeks of
 * history, two cardio sessions and a workout going now, so the Training tab reads the way it does for someone
 * who trains. Nothing here runs for a real account. */
type Ex = [name: string, sets: number, reps: number, lb: number];
const DAYS: [string, Ex[]][] = [
  ['Push A', [['Bench Press', 4, 5, 205], ['Overhead Press', 3, 8, 115], ['Incline Dumbbell Press', 3, 10, 70], ['Cable Lateral Raise', 3, 15, 25], ['Cable Tricep Pulldown', 3, 12, 60]]],
  ['Pull A', [['Deadlift', 3, 5, 315], ['Pull-Up', 3, 8, 0], ['Barbell Row', 3, 8, 185], ['Face Pull', 3, 15, 50], ['Barbell Curl', 3, 10, 75]]],
  ['Legs A', [['Squat', 4, 5, 245], ['Romanian Deadlift', 3, 8, 185], ['Dumbbell Walking Lunge', 3, 10, 50], ['Leg Press', 3, 10, 360], ['Lying Leg Curl', 3, 12, 90], ['Standing Calf Raise', 2, 15, 135]]],
  ['Push B', [['Incline Dumbbell Press', 4, 8, 75], ['Bench Press', 3, 8, 175], ['Cable Fly', 3, 12, 40], ['Cable Lateral Raise', 3, 15, 25], ['Cable Tricep Pulldown', 3, 12, 60]]],
  ['Pull B', [['Barbell Row', 4, 8, 185], ['Lat Pulldown Machine', 3, 10, 150], ['Face Pull', 3, 15, 50], ['Hammer Curl', 3, 12, 35]]],
  ['Legs B', [['Squat', 3, 8, 215], ['Hip Thrust', 3, 10, 225], ['Leg Extension', 3, 12, 120], ['Seated Leg Curl', 3, 12, 90], ['Seated Calf Raise', 3, 15, 90]]],
];
const TRAIN_DOW = [1, 2, 4, 5, 6]; // Monday, Tuesday, Thursday, Friday, Saturday

export function seedTrainingDemo(base: Repository, now = Date.now()) {
  if (base.owner !== 'demo' || base.localGet('trainingDemo')) return;
  // One remembering view for the whole seed: writes go through it, so it forgets at each one.
  const repo = liveReads(base);
  const w = new WorkoutStore(repo), plans = new PlanStore(repo);
  repo.atomic(() => {
    const before = new Set(syncedTables.flatMap(table => base.list(table, true)).map(row => row.id));
    const ids = DAYS.map(([name, ex]) => w.saveTemplate(name, ex.map(([exercise, target_sets, target_reps]) => ({ exercise, target_sets, target_reps, rep_min: Math.max(1, target_reps - 2), rep_max: target_reps }))).id);
    plans.save({ mode: 'rotation', daysPerWeek: 5, days: ids.map(routineId => ({ routineId, weekdays: [] })) });
    repo.localSave('plans:name', 'Push Pull Legs');
    const today = new Date(now); today.setHours(12, 0, 0, 0);
    const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 49);
    let k = 0, seq = 0;
    for (const d = new Date(start); localDay(d) < localDay(today); d.setDate(d.getDate() + 1)) {
      if (!TRAIN_DOW.includes(d.getDay())) continue;
      const week = Math.floor((d.getTime() - start.getTime()) / (7 * 86_400_000));
      if (week === 3 && d.getDay() === 5) continue; // one lighter week
      const [name, ex] = DAYS[k % DAYS.length], routineId = ids[k % DAYS.length]; k++;
      const began = new Date(d); began.setHours(17, 30 + (k % 4) * 6, 0, 0);
      const dur = (48 + (k * 7) % 14) * 60_000;
      const s = repo.save('sessions', { origin: 'template', routine_id: routineId, name, day: localDay(d), started_at: began.getTime(), finished_at: began.getTime() + dur, duration_ms: dur, notes: null });
      repo.localSave(`plans:session:${s.id}`, ++seq);
      ex.forEach(([exercise, sets, reps, lb], position) => {
        const e = repo.save('entries', { session_id: s.id, exercise, position, notes: null });
        const load = lb ? Math.round(lb * (0.9 + week * 0.0145) / 5) * 5 : 0;
        const drafts = Array.from({ length: sets }, (_, i) => {
          const r = reps + (i === sets - 1 && week % 2 ? 1 : 0);
          const set = repo.save('sets', { entry_id: e.id, position: i, weight_kg: toKg(load, 'lb'), reps: r, entered_value: load, entered_unit: 'lb' });
          repo.localSave(rpeKey(e.id, i), Math.min(10, 7 + Math.floor((i + 1) * 2 / sets)));
          return { weight: String(load), reps: String(r), setId: set.id };
        });
        repo.localSave(`draft:${e.id}`, drafts);
        repo.localSave(`entryUnit:${e.id}`, 'lb');
      });
    }
    for (const [kind, ago, min, mi] of [['walk', 1, 32, 1.6], ['run', 3, 26, 2.9]] as const) {
      const d = new Date(today); d.setDate(d.getDate() - ago);
      repo.save('cardio_sessions', { day: localDay(d), kind, duration_ms: min * 60_000, distance_m: mi * 1609.344, notes: '' });
    }
    w.recompute();
    // The plan day going now: started 25 minutes ago with its first eight sets done.
    const next = plans.nextIndex();
    const live = plans.startDay(ids[next], now - 25 * 60_000 - 13_000);
    let left = 8;
    for (const e of w.entries(live.id)) {
      const ex = DAYS[next][1].find(x => x[0] === e.data.exercise);
      if (!ex) continue;
      w.drafts(e.id).forEach((_, i) => {
        if (left <= 0 || ex[3] <= 0) return;
        w.editDraft(e.id, i, { weight: String(ex[3]), reps: String(ex[2]) });
        w.toggleDone(e.id, i, now - left * 150_000);
        repo.localSave(rpeKey(e.id, i), 8);
        left--;
      });
    }
    w.skipTimer();
    // Every row here is a sample and must never reach an account. A namespace with no sample list holds rows of
    // unknown origin, so it stays without one and promotion keeps refusing it.
    const samples = base.localGet<string[]>('demoSamples');
    if (samples) {
      const made = syncedTables.flatMap(table => base.list(table, true)).filter(row => !before.has(row.id)).map(row => row.id);
      repo.localSave('demoSamples', [...new Set([...samples, ...made])]);
    }
    repo.localSave('trainingDemo', true);
  });
}
