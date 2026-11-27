import { WorkoutStore } from '../src/data/workout/store';
import { addDays, emptyProgress, goalEta, HISTORY, series, stats, weekReport, type ProgressData } from '../src/features/progress/model';
import { buildProgress } from '../src/features/progress/source';
import { metricView } from '../src/features/progress/metric';
import { addPhoto, readMeasures, readPhotos, saveMeasures } from '../src/features/progress/local';
import { fill } from '../src/features/progress/format';
import { saveWeighIn } from '../src/features/body/model';
import { setTargets } from '../src/features/food/model';
import { memoryRepository } from './workout-repository';

const NOW = new Date(2026, 10, 11, 12), TODAY = '2026-11-11';
const blank = (): ProgressData => emptyProgress(TODAY, 'kg', NOW.getTime());
const at = (d: ProgressData, daysAgo: number) => HISTORY - 1 - daysAgo;
const nulls = (n: number) => Array<number | null>(n).fill(null);

describe('series and stats', () => {
  test('a week is the last seven days, today last; a day with nothing read stays null, not zero', () => {
    const d = blank();
    d.days.steps[at(d, 0)] = 4000; d.days.steps[at(d, 2)] = 9000;
    const s = series(d, 'steps', 'week');
    expect(s.v).toHaveLength(7);
    expect(s.v.at(-1)).toBe(4000);
    expect(s.v.at(-2)).toBeNull();
    expect(s.v.at(-3)).toBe(9000);
    expect(stats(s.v)).toMatchObject({ avg: 6500, max: 9000, min: 4000, n: 2 });
    expect(stats(series(blank(), 'steps', 'month').v)).toMatchObject({ avg: null, max: null, n: 0 });
  });
  test('a month is thirty days', () => {
    expect(series(blank(), 'sleep', 'month').v).toHaveLength(30);
  });
});

describe('goalEta', () => {
  test('reaches the goal at the pace of the last 30 days of weigh-ins', () => {
    const d = blank();
    // 80.0 kg 29 days ago down to 77.0 kg today: 3 kg over 30 days, 0.1 kg a day; 2 kg to go is 20 days.
    d.days.weight[at(d, 29)] = 80; d.days.weight[at(d, 0)] = 77;
    d.weight = { ...d.weight, kg: 77, goalKg: 75 };
    expect(goalEta(d)).toBe(addDays(TODAY, 20));
  });
  test('is null with no goal, one weigh-in, the goal reached, or weight heading the other way', () => {
    const d = blank();
    d.days.weight[at(d, 10)] = 77; d.days.weight[at(d, 0)] = 78;
    d.weight = { ...d.weight, kg: 78, goalKg: 75 };
    expect(goalEta(d)).toBeNull();
    d.weight.goalKg = null; expect(goalEta(d)).toBeNull();
    const one = blank(); one.days.weight[at(one, 0)] = 78; one.weight = { ...one.weight, kg: 78, goalKg: 75 };
    expect(goalEta(one)).toBeNull();
    const done = blank(); done.days.weight[at(done, 9)] = 76; done.days.weight[at(done, 0)] = 74; done.weight = { ...done.weight, kg: 74, goalKg: 75 };
    expect(goalEta(done)).toBeNull();
  });
});

describe('weekReport', () => {
  test('covers the last seven days and counts food on target only on finished days', () => {
    const d = blank();
    d.food.goalKcal = 2000;
    d.days.kcal[at(d, 0)] = 2000; // today is still going and is left out
    d.days.kcal[at(d, 1)] = 1900; d.days.kcal[at(d, 2)] = 1000; d.days.kcal[at(d, 3)] = 2100;
    d.days.sleep[at(d, 1)] = 6.5; d.days.sleep[at(d, 2)] = 8;
    const r = weekReport(d);
    expect(r.from).toBe('2026-11-05');
    expect(r.to).toBe(TODAY);
    expect(r.logged).toBe(3);
    expect(r.onTarget).toBe(2);
    expect(r.kcalAvg).toBe(1667);
    expect(r.sleepAvg).toBeCloseTo(7.25, 5);
    expect(r.shortNights).toEqual(['Tue']);
  });
  test('an empty week has nulls where there is nothing to average, not zeros', () => {
    const r = weekReport(blank());
    expect(r).toMatchObject({ avgScore: null, sleepAvg: null, kcalAvg: null, wDeltaKg: null, volPct: null, stepsAvg: null, workouts: 0, logged: 0 });
  });
});

describe('weekReport against dated targets', () => {
  test("each day is held to the calorie target it had then, so raising today's target doesn't rewrite the week", () => {
    const d = blank();
    d.food.goalKcal = 2600;
    d.food.goalByDay = d.days.kcal.map(() => 2000);
    for (let k = 1; k <= 6; k++) d.days.kcal[at(d, k)] = 2000;
    expect(weekReport(d).onTarget).toBe(6);
    // Without dated targets the week falls back to today's.
    delete d.food.goalByDay;
    expect(weekReport(d).onTarget).toBe(0);
  });
  test('buildProgress keeps each logged day\'s own target', () => {
    const repo = memoryRepository();
    repo.localSave('targetBasis', 'manual');
    setTargets(repo as never, '2026-11-01', { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 200, fat_g: 70 });
    setTargets(repo as never, TODAY, { energy_kj: 2600 * 4.184, protein_g: 150, carbs_g: 200, fat_g: 70 });
    for (let k = 1; k <= 6; k++) repo.save('food_entries', { name: 'Synthetic meal', day: addDays(TODAY, -k), energy_kj: 2000 * 4.184 });
    const d = buildProgress({ store: new WorkoutStore(repo), now: NOW, demo: false, health: null, recovery: null, ring: null });
    expect(d.food.goalKcal).toBe(2600);
    expect(weekReport(d).logged).toBe(6);
    expect(weekReport(d).onTarget).toBe(6);
  });
});

describe('buildProgress', () => {
  const recovery = (hrv: (number | null)[], rhr: (number | null)[]) => ({ night: null, hrv, restingHeartRate: rhr, heartToday: null, vo2Max: null });
  const ring = (hrv: (number | null)[], rhr: (number | null)[]) => ({ readiness: nulls(30), sleepScore: nulls(30), hrv, restingHeartRate: rhr, night: null });
  const health = (steps: (number | null)[]) => ({ steps, sleepHours: nulls(30), activeKcal: null, exerciseMinutes: null, waterMl: null, mindfulMinutes: null, bodyFat: null });
  const store = () => new WorkoutStore(memoryRepository());

  test('nothing read and nothing logged leaves every reading empty, never 0', () => {
    const d = buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: null, ring: null });
    for (const key of ['weight', 'sleep', 'hrv', 'rhr', 'steps', 'kcal', 'training'] as const) expect(d.days[key].every(v => v === null)).toBe(true);
    expect(d.weight.kg).toBeNull();
    expect(d.food.eatenKcal).toBeNull();
  });
  test("weight names where its readings came from, never Apple Health for a weight typed in Insight", () => {
    const typed = memoryRepository();
    saveWeighIn(typed as never, 80, 'kg', '2026-11-05');
    expect(metricView(buildProgress({ store: new WorkoutStore(typed), now: NOW, demo: false, health: null, recovery: null, ring: null }), 'weight').src).toBe('Logged in Insight');
    const scale = memoryRepository();
    scale.save('weigh_ins', { day: '2026-11-05', weight_kg: 80, entered_value: 80, entered_unit: 'kg', source: 'healthkit' });
    expect(metricView(buildProgress({ store: new WorkoutStore(scale), now: NOW, demo: false, health: null, recovery: null, ring: null }), 'weight').src).toBe('Apple Health');
    saveWeighIn(scale as never, 79.5, 'kg', '2026-11-06');
    expect(metricView(buildProgress({ store: new WorkoutStore(scale), now: NOW, demo: false, health: null, recovery: null, ring: null }), 'weight').src).toBe('Apple Health and Insight');
    // With no weigh-ins yet, Apple Health is named only when it is connected.
    expect(metricView(buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: null, ring: null }), 'weight').src).toBe('Logged in Insight');
    expect(metricView(buildProgress({ store: store(), now: NOW, demo: false, health: health(nulls(30)), recovery: null, ring: null }), 'weight').src).toBe('Apple Health');
  });
  test('cardio logged on its own counts toward training minutes, from its first day', () => {
    const repo = memoryRepository();
    repo.save('cardio_sessions', { day: '2026-11-10', kind: 'run', duration_ms: 30 * 60000, distance_m: 5000, notes: '' });
    repo.save('cardio_sessions', { day: TODAY, kind: 'ride', duration_ms: 45 * 60000, distance_m: null, notes: '' });
    const d = buildProgress({ store: new WorkoutStore(repo), now: NOW, demo: false, health: null, recovery: null, ring: null });
    expect(d.days.training.at(-1)).toBe(45);
    expect(d.days.training.at(-2)).toBe(30);
    expect(d.days.training.at(-3)).toBeNull();
  });
  test('a missing day from Apple Health stays missing', () => {
    const steps = nulls(30); steps[29] = 5000; steps[27] = 0.5 * Number.NaN;
    const d = buildProgress({ store: store(), now: NOW, demo: false, health: health(steps), recovery: null, ring: null });
    expect(d.days.steps.at(-1)).toBe(5000);
    expect(d.days.steps.at(-2)).toBeNull();
    expect(d.days.steps.at(-3)).toBeNull();
  });
  test('HRV and resting heart rate come from one source: Oura when it has readings, else Apple Health, never mixed', () => {
    const apple = recovery([...nulls(29), 45], [...nulls(29), 60]);
    const both = buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: apple, ring: ring([...nulls(28), 30, null], [...nulls(28), 52, null]) });
    expect(both.days.hrv.slice(-2)).toEqual([30, null]);
    expect(both.days.rhr.slice(-2)).toEqual([52, null]);
    const empty = buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: apple, ring: ring(nulls(30), nulls(30)) });
    expect(empty.days.hrv.slice(-2)).toEqual([null, 45]);
    expect(empty.days.rhr.slice(-2)).toEqual([null, 60]);
  });
  test('heart readings are labelled by the source they came from, even with Oura connected', () => {
    const apple = recovery([...nulls(29), 45], [...nulls(29), 60]);
    const fromOura = buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: apple, ring: ring([...nulls(29), 30], [...nulls(29), 52]) });
    expect(fromOura.sources.heart).toBe('Oura');
    expect(metricView(fromOura, 'hrv').src).toBe('Oura');
    // Oura is connected but has no heart readings, so the Apple Health ones shown are labelled Apple Health.
    const fromApple = buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: apple, ring: ring(nulls(30), nulls(30)) });
    expect(fromApple.sources.oura).toBe(true);
    expect(fromApple.sources.heart).toBe('Apple Health');
    expect(metricView(fromApple, 'hrv').src).toBe('Apple Health');
    expect(metricView(fromApple, 'rhr').src).toBe('Apple Health');
    expect(metricView(fromApple, 'hrv').about).toBe(metricView(buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: apple, ring: null }), 'hrv').about);
    const none = buildProgress({ store: store(), now: NOW, demo: false, health: null, recovery: null, ring: ring(nulls(30), nulls(30)) });
    expect(none.sources.heart).toBeNull();
  });
  test('a photo shows the weigh-in of its day or the week before, and what is kept on the phone holds no weight', () => {
    const s = store(), repo = s.repo;
    saveWeighIn(repo, 80, 'kg', '2026-11-06');
    addPhoto(repo, { id: 'p1', day: '2026-11-09', kg: null, pose: 'Front', uri: 'file:///p1.jpg' });
    addPhoto(repo, { id: 'p2', day: '2026-10-20', kg: null, pose: 'Side', uri: 'file:///p2.jpg' });
    const d = buildProgress({ store: s, now: NOW, demo: false, health: null, recovery: null, ring: null });
    expect(d.photos.find(p => p.id === 'p1')!.kg).toBeCloseTo(80, 5);
    expect(d.photos.find(p => p.id === 'p2')!.kg).toBeNull();
    expect(readPhotos(repo).every(p => p.kg === null)).toBe(true);
  });
  test('body fat from Apple Health is marked as such and is not saved on the phone', () => {
    const s = store(), h = { ...health(nulls(30)), bodyFat: [21.4], bodyFatAt: new Date(2026, 10, 10, 7) };
    const d = buildProgress({ store: s, now: NOW, demo: false, health: h, recovery: null, ring: null });
    expect(d.bodyFat).toEqual([{ day: '2026-11-10', pct: 21.4, health: true }]);
    expect(s.repo.localGet('progressBodyFat')).toBeUndefined();
  });
  test('measurements saved on a day read back for that day', () => {
    const repo = memoryRepository();
    saveMeasures(repo, TODAY, { waist: 84, neck: 38 });
    expect(readMeasures(repo).at(-1)).toMatchObject({ day: TODAY, cm: { waist: 84, neck: 38 } });
  });
});

test('a count of one takes the singular', () => {
  expect(fill('{n} sessions', { n: 1 })).toBe('1 session');
  expect(fill('{n} sessions', { n: 2 })).toBe('2 sessions');
  expect(fill('{n} new records: {names}', { n: 1, names: 'squat' })).toBe('1 new record: squat');
  expect(fill('{n} CSV files, about {kb} KB', { n: 1, kb: 1 })).toBe('1 CSV file, about 1 KB');
  expect(fill('Week of {day}', { day: 1 })).toBe('Week of 1');
});
