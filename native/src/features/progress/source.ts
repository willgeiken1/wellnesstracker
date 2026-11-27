import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { dailyWeights } from '@/features/body/model';
import { foodTargets } from '@/features/food/model';
import type { HealthDays } from '@/features/health/days';
import type { OuraRecovery } from '@/features/health/oura';
import type { Recovery } from '@/features/health/recovery';
import { readProfile } from '@/features/onboarding/model';
import { PlanStore } from '@/features/plans/store';
import { liftRecords } from '@/features/progress/records';
import { dayScore } from '@/features/score/day';
import { withDemoSleep } from '@/features/home/demo-sleep';
import { foodDays, scoreDays } from '@/features/score/days';
import { loadSettingsPrefs } from '@/features/settings/prefs';
import { t } from '@/i18n/en';
import { fill, hm } from './format';
import { readBodyFat, readMeasures, readPhotos } from './local';
import { addDays, avg, daysEnding, emptyProgress, finite, HISTORY, LB, parseDay, type Daily, type ProgressData } from './model';
import { sampleProgress } from './sample';

const KJ = 4.184;
export interface SourceInput {
  store: WorkoutStore; now: Date; demo: boolean;
  /** Read for the last 30 days, oldest first, ending today. Null when not connected or not read. */
  health: HealthDays | null; recovery: Recovery | null; ring: OuraRecovery | null;
  /** The sleep goal in minutes from Settings › Goals; read from the saved choices when left out. */
  sleepGoalMin?: number;
}
/** The sleep goal in minutes the person chose, or eight hours. */
export function sleepGoalOf(repo: Parameters<typeof loadSettingsPrefs>[0]): number {
  const v = loadSettingsPrefs(repo).goals.sleep;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 480;
}
/** The last `n` values of a 30-day list placed at the end of a 365-day list. */
function tail(list: readonly (number | null)[] | null | undefined): Daily {
  const out: Daily = Array(HISTORY).fill(null);
  if (!list) return out;
  const n = Math.min(list.length, HISTORY);
  for (let i = 0; i < n; i++) { const v = list[list.length - n + i]; out[HISTORY - n + i] = finite(v) ? v : null; }
  return out;
}
/** A usual range from the readings before today: the middle half, when there are at least 7. */
function band(list: Daily): readonly [number, number] | null {
  const prior = list.slice(-29, -1).filter(finite).sort((a, b) => a - b);
  if (prior.length < 7) return null;
  const q = (p: number) => prior[Math.min(prior.length - 1, Math.max(0, Math.round(p * (prior.length - 1))))];
  return [Math.round(q(0.25)), Math.round(q(0.75))];
}
const minutesOf = (s: Row) => {
  const d = Number(s.data.duration_ms);
  if (finite(d) && d > 0) return Math.round(d / 60000);
  const a = Number(s.data.started_at), b = Number(s.data.finished_at);
  return finite(a) && finite(b) && b > a ? Math.round((b - a) / 60000) : 0;
};

/** Progress from what is logged on this phone, plus steps, sleep and heart readings held in memory. Saves nothing. */
export function buildProgress({ store, now, demo, health, recovery, ring, sleepGoalMin }: SourceInput): ProgressData {
  const repo = store.repo, unit = readProfile(repo).unit, today = addDays(dayKeyOf(now), 0);
  const days = daysEnding(today, HISTORY), index = new Map(days.map((d, i) => [d, i]));
  const base = demo ? sampleProgress(today, unit, now.getTime()) : emptyProgress(today, unit, now.getTime());
  base.sleepGoalMin = sleepGoalMin != null && Number.isFinite(sleepGoalMin) && sleepGoalMin > 0 ? sleepGoalMin : sleepGoalOf(repo);
  const d: ProgressData = demo ? base : { ...base };

  /* weight */
  const weighed = dailyWeights(repo.list('weigh_ins').filter(r => String(r.data.day) <= today));
  if (weighed.length) {
    if (demo) d.days.weight = d.days.weight.slice();
    for (const w of weighed) { const i = index.get(w.day); if (i != null) d.days.weight[i] = w.kg; }
    const last = weighed[weighed.length - 1];
    if (!demo || last.day >= (d.weight.day ?? '')) d.weight = { ...d.weight, kg: last.kg, day: last.day, time: null };
    if (!demo) { d.weight.startKg = weighed[0].kg; d.weight.startDay = weighed[0].day; }
  }
  if (!demo) {
    const goal = repo.list('goals').filter(r => r.data.kind === 'weight' && finite(r.data.target_value)).sort((a, b) => b.updated_at - a.updated_at)[0];
    if (goal) d.weight.goalKg = goal.data.target_unit === 'lb' ? Number(goal.data.target_value) / LB : Number(goal.data.target_value);
  }

  /* measurements, body fat, photos */
  const measures = readMeasures(repo), fat = readBodyFat(repo), photos = readPhotos(repo);
  d.measures = demo ? [...d.measures, ...measures] : measures;
  d.bodyFat = demo ? [...d.bodyFat, ...fat] : fat.slice();
  if (!demo && health?.bodyFat?.length && health.bodyFatAt) {
    const day = dayKeyOf(health.bodyFatAt), pct = health.bodyFat[health.bodyFat.length - 1];
    if (!d.bodyFat.some(b => b.day >= day)) d.bodyFat.push({ day, pct, health: true });
  }
  // A photo keeps no weight of its own: it shows the weigh-in of its day (or the closest one in the week before), so a reading
  // from Apple Health is never copied into what this phone backs up.
  const weightOn = (day: string) => { const i = index.get(day); if (i == null) return null; for (let j = i; j >= Math.max(0, i - 7); j--) { const w = d.days.weight[j]; if (finite(w)) return w; } return null; };
  const withKg = photos.map(p => ({ ...p, kg: p.kg ?? weightOn(p.day) }));
  d.photos = demo ? [...d.photos, ...withKg] : withKg;
  if (demo) {
    // Sample data keeps the design's charts, but each day's score is worked out from the sample logs and the sample
    // nights by the same function as for anyone else, so Home's hero and Progress show one score for a day.
    const sleep = withDemoSleep(null, repo.owner, 7)?.sleepHours ?? null;
    if (sleep) { d.days.sleep = d.days.sleep.slice(); sleep.forEach((h, i) => { d.days.sleep[HISTORY - 7 + i] = h; }); }
    const all = scoreDays({ store, days, steps: null, sleepHours: d.days.sleep });
    const scores = all.map(dayScore);
    d.days.score = d.days.score.map((v, i) => scores[i] ?? v);
    d.pillars = all[HISTORY - 1];
    d.weekPillars = all.slice(-7);
    { const y = d.days.score[HISTORY - 2]; d.yesterdayScore = finite(y) ? y : null; }
    d.baseline = { ...d.baseline, score: round(avg(d.days.score.slice(-29, -1))) };
    return d;
  }

  /* health: steps and sleep from Apple Health and Oura (merged per day), HRV and resting heart rate from one source only */
  d.days.steps = tail(health?.steps);
  d.days.sleep = tail(health?.sleepHours);
  const ouraHeart = !!ring && [...ring.hrv, ...ring.restingHeartRate].some(finite);
  d.days.hrv = tail(ouraHeart ? ring!.hrv : recovery?.hrv);
  d.days.rhr = tail(ouraHeart ? ring!.restingHeartRate : recovery?.restingHeartRate);
  d.hrvBand = band(d.days.hrv); d.rhrBand = band(d.days.rhr);
  const night = ring?.night ?? recovery?.night ?? null;
  if (night) {
    const core = night.core + night.asleep;
    d.night = { min: night.deep + core + night.rem + night.awake, deep: night.deep, core, rem: night.rem, awake: night.awake, bed: null, wake: null,
      source: ring?.night ? 'Oura' : 'Apple Health', segments: null };
  }
  const appleHeart = !ouraHeart && !!recovery && [...(recovery.hrv ?? []), ...(recovery.restingHeartRate ?? [])].some(finite);
  d.sources = { oura: !!ring, apple: !!health || !!recovery, ouraSynced: null, heart: ouraHeart ? 'Oura' : appleHeart ? 'Apple Health' : null };

  /* food */
  const byDay = new Set(repo.list('food_entries').map(r => String(r.data.day)));
  const foods = foodDays(repo, days);
  d.days.kcal = foods.map(f => f.logged && finite(f.kcal) ? f.kcal : null);
  const todayFood = foods[HISTORY - 1];
  let targetsToday: ReturnType<typeof foodTargets>['targets'] = null;
  try { targetsToday = foodTargets(repo, today).targets; } catch { targetsToday = null; }
  d.food = { goalKcal: targetsToday ? Math.round(targetsToday.energy_kj / KJ) : null, eatenKcal: todayFood.logged ? Math.round(todayFood.kcal ?? 0) : null,
    proteinG: todayFood.protein == null ? null : Math.round(todayFood.protein), proteinGoal: targetsToday ? Math.round(targetsToday.protein_g) : null };

  /* training */
  const sessions = store.trainingHistory(), active = store.active();
  const minutes = new Map<string, number>(), names = new Map<string, string[]>();
  for (const s of sessions) { const k = String(s.data.day); minutes.set(k, (minutes.get(k) ?? 0) + minutesOf(s)); names.set(k, [...(names.get(k) ?? []), String(s.data.name ?? '')]); }
  // Cardio logged on its own sheet counts toward training minutes, as on Training.
  const cardio = repo.list('cardio_sessions').filter(c => typeof c.data.day === 'string' && String(c.data.day) <= today);
  for (const c of cardio) { const min = Math.round(Number(c.data.duration_ms ?? 0) / 60000); if (finite(min) && min > 0) minutes.set(String(c.data.day), (minutes.get(String(c.data.day)) ?? 0) + min); }
  const activeMin = active && finite(Number(active.data.started_at)) ? Math.max(0, Math.round((now.getTime() - Number(active.data.started_at)) / 60000)) : null;
  const firstDay = [...sessions, ...cardio].map(s => String(s.data.day)).sort()[0] ?? (active ? today : null);
  d.days.training = days.map(day => firstDay && day >= firstDay ? (minutes.get(day) ?? 0) + (day === today && activeMin != null ? activeMin : 0) : null);
  const weekStart = addDays(today, -6), prevStart = addDays(today, -13);
  const volume = (from: string, to: string) => {
    let kg = 0;
    for (const s of sessions) {
      const day = String(s.data.day);
      if (day < from || day > to) continue;
      for (const e of store.entries(s.id)) {
        if (store.skipped(e.id)) continue;
        for (const set of store.sets(e.id)) {
          const x = set.data, v = x.left_weight_kg != null && x.right_weight_kg != null
            ? Number(x.left_weight_kg) * Number(x.left_reps) + Number(x.right_weight_kg) * Number(x.right_reps) : Number(x.weight_kg) * Number(x.reps);
          if (finite(v)) kg += v;
        }
      }
    }
    return kg;
  };
  let perWeek = 3;
  try { perWeek = new PlanStore(repo).read().daysPerWeek; } catch { perWeek = 3; }
  const parsed = parseDay(today), monday = addDays(today, -((parsed.getDay() + 6) % 7));
  const records = (() => { try { return liftRecords(store); } catch { return []; } })();
  d.training = {
    goalMin: null, weekVolumeKg: volume(weekStart, today), lastWeekVolumeKg: volume(prevStart, addDays(weekStart, -1)),
    sessions: sessions.filter(s => String(s.data.day) >= weekStart).length,
    active: active && activeMin != null ? { name: String(active.data.name ?? t('progressWorkout')), min: activeMin } : null,
    plan: { name: null, perWeek, done: sessions.filter(s => String(s.data.day) >= monday).length }, next: null,
    records: records.map(r => ({ name: r.exercise, kg: r.unit === 'lb' ? r.weight / LB : r.weight, reps: 0, day: r.day, unit: r.unit })),
    streak: streak(today, new Set([...byDay, ...minutes.keys()])),
  };

  /* the day score, each day: the same function Home's hero reads */
  const logsTraining = !!firstDay;
  const sleep = d.days.sleep;
  const all = scoreDays({ store, days, steps: d.days.steps, sleepHours: sleep, foods });
  d.days.score = all.map(dayScore);
  d.pillars = all[HISTORY - 1];
  { const y = d.days.score[HISTORY - 2]; d.yesterdayScore = finite(y) ? y : null; }
  d.weekPillars = all.slice(-7);
  const prior = all.slice(-29, -1);
  d.baseline = {
    score: round(avg(d.days.score.slice(-29, -1))), training: round(avg(prior.map(p => p.training))),
    food: round(avg(prior.map(p => p.food))), sleep: round(avg(prior.map(p => p.sleep))),
  };
  d.dayNotes = daysEnding(today, 7).map((day, i) => {
    const parts: string[] = [], n = names.get(day), m = minutes.get(day), h = sleep[HISTORY - 7 + i];
    if (n?.length) parts.push(fill(t('progressNoteWorkout'), { name: n.filter(Boolean).join(', ') || t('progressWorkout'), min: m ?? 0 }));
    else if (day === today && d.training.active) parts.push(fill(t('progressNoteGoing'), { name: d.training.active.name, min: d.training.active.min }));
    else if (logsTraining) parts.push(t('progressNoteRest'));
    if (finite(h)) parts.push(fill(t('progressNoteSleep'), { hm: hm(h) }));
    return parts.join(' ');
  });
  return d;
}
const round = (n: number | null) => n == null ? null : Math.round(n);
function dayKeyOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
/** Days in a row with anything logged, ending today (or yesterday, while today is still empty). */
function streak(today: string, logged: Set<string>) {
  let day = logged.has(today) ? today : addDays(today, -1), n = 0;
  while (logged.has(day) && n < 3650) { n++; day = addDays(day, -1); }
  return n;
}
