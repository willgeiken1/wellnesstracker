import type { HomeTileData } from './data-types';

/**
 * Home's tile data, built from what the app has read: logged food, workouts and weigh-ins, plus health readings held in
 * memory. Pure: everything comes in through `HomeInput`, so it can be checked without a phone.
 *
 * A tile is only drawn when its own reading for today exists (`ready`). Without it the tile shows its empty state, so a
 * missing reading is never drawn as 0. Earlier days with no reading stay empty in the series (no bar, no point).
 */
export const DAYS = 30;
const KG_PER_LB = 0.45359237, FLOZ = 33.814;

/** One day of food, as the Food tab files it. Nutrients are null when nothing logged carries them. */
export interface FoodDayIn {
  kcal: number | null; protein: number | null; carbs: number | null; fat: number | null;
  goalKcal: number | null; goalProtein: number | null;
  meals: { id: string; name: string; kcal: number | null; protein: number | null; count: number; loggedAt: Date | null }[];
}
export interface ActiveWorkoutIn { name: string; startedAt: Date | null; setsDone: number; setsTotal: number }
export interface HealthIn {
  steps: (number | null)[] | null; activeKcal: (number | null)[] | null; exerciseMinutes: (number | null)[] | null;
  sleepHours: (number | null)[] | null; mindfulMinutes: (number | null)[] | null;
}
/** Today hour by hour and last night in detail, when the health source could be read that finely. */
export interface HealthDetailIn {
  stepsHourly: (number | null)[] | null; activeHourly: (number | null)[] | null; exerciseHourly: (number | null)[] | null;
  night: { bed: Date; wake: Date; stages: [stage: 'awake' | 'core' | 'deep' | 'rem', from: number, to: number][] } | null;
  bedtimes: (number | null)[] | null;
  mindful: { start: Date; minutes: number }[] | null;
  /** Body-fat readings with when each was taken, oldest first. */
  bodyFat: { at: Date; percent: number }[] | null;
}
export interface RecoveryIn { hrv: (number | null)[] | null; rhr: (number | null)[] | null; sleepScore: (number | null)[] | null; source: string }
/**
 * Water as the Food tab keeps it (features/food/water.ts), the one model every water surface reads: the unit and goal set
 * in the water section, litres drunk on each day in `days`, today's drinks and the containers on quick add.
 */
export interface WaterIn {
  unit: 'oz' | 'ml';
  /** Litres a day. */
  goal: number;
  /** One per day in `days`; the last is the Food tab's own day. */
  litres: number[];
  /** Today's drinks, in the order they were logged. */
  drinks: { at: Date; oz: number }[];
  containers: { id: string; name: string; oz: number; icon: string; quick: boolean }[];
}
export interface ScoreDayIn { value: number | null; training: number | null; food: number | null; recovery: number | null }
export interface HomeInput {
  now: Date;
  /** 30 local days, oldest first, the last one today. */
  days: string[];
  weightUnit: 'lb' | 'kg';
  water: WaterIn;
  /** One per day in `days`; today's is the Food tab's own day. */
  food: FoodDayIn[];
  /** The meal Home offers to log next, and quick picks for it. */
  nextMeal: { id: string; name: string } | null;
  recentFoods: { name: string; serving: string; kcal: number | null; protein: number | null }[];
  /** Daily weigh-ins, oldest first. */
  weighIns: { day: string; kg: number; at: Date | null }[];
  weightGoalKg: number | null;
  /** Kilograms lifted on each day in `days`, and this week by muscle group. */
  volumeKg: number[];
  volumeByGroupKg: Record<string, number>;
  volumeLastWeekKg: number;
  workoutsThisWeek: number;
  active: ActiveWorkoutIn | null;
  /** The next planned workout, as "Name · N exercises". */
  upNext: string | null;
  health: HealthIn | null;
  detail: HealthDetailIn | null;
  recovery: RecoveryIn | null;
  /** One per day in `days`. */
  score: ScoreDayIn[] | null;
  sources: { activity: string; sleep: string; body: string };
  goals: { steps: number; exercise: number; active: number; sleepHours: number; mindful: number };
}
export type TileReady = Record<string, boolean>;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const last = <T>(list: readonly T[] | null | undefined): T | undefined => list ? list[list.length - 1] : undefined;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
/** "7:40 AM": the tiles keep 12-hour strings and convert for the person's clock themselves. */
export const clock12 = (d: Date) => `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** A moment's local day, `YYYY-MM-DD`. */
export const localDayOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dateOf = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
/** A day's series value, or null for no reading. Null stays null: a tile draws no bar or point for it. */
const series = (list: readonly (number | null)[] | null | undefined, n = DAYS): (number | null)[] => {
  const out: (number | null)[] = Array.from({ length: n }, () => null);
  if (!list) return out;
  const from = Math.max(0, list.length - n);
  for (let i = from; i < list.length; i++) { const v = list[i]; out[n - (list.length - i)] = finite(v) ? v : null; }
  return out;
};
const hourly = (list: readonly (number | null)[] | null | undefined) => Array.from({ length: 24 }, (_, i) => { const v = list?.[i]; return finite(v) ? v : 0; });
/** The usual range of a reading: the middle half of the last 30 days. */
function band(values: readonly (number | null)[]): [number, number] {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (!v.length) return [0, 0];
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  return [Math.round(q(0.25)), Math.round(q(0.75))];
}
const sumOf = (list: readonly number[]) => list.reduce((a, b) => a + b, 0);
const commas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lb = (kg: number) => kg / KG_PER_LB;

/** Says, for each tile, whether today's own reading is there to draw. */
/**
 * Today's food totals that no logged food gives. With nothing logged, today is simply 0 eaten; once something is logged, a
 * total none of it gives is unknown, and a tile that leads with it says so rather than show 0 eaten and the whole goal left.
 */
export function foodUnknown(input: HomeInput): { kcal: boolean; protein: boolean; macros: boolean } {
  const today = last(input.food), logged = !!today && today.meals.some(m => m.count > 0);
  return {
    kcal: logged && !finite(today.kcal), protein: logged && !finite(today.protein),
    macros: logged && !(finite(today.protein) && finite(today.carbs) && finite(today.fat)),
  };
}

export function tileReady(input: HomeInput): TileReady {
  const today = last(input.food), h = input.health, s = last(input.score ?? []);
  const has = (list: readonly (number | null)[] | null | undefined) => finite(last(list ?? []));
  const foodGoal = !!today && finite(today.goalKcal) && today.goalKcal > 0;
  const proteinGoal = !!today && finite(today.goalProtein) && today.goalProtein > 0;
  const unknown = foodUnknown(input);
  return {
    score: !!s && finite(s.value),
    week: !!input.score && input.score.slice(-7).some(d => finite(d.value)),
    next: !!input.active || foodGoal,
    nextup: false,
    volume: true,
    exercise: has(h?.exerciseMinutes),
    active: has(h?.activeKcal),
    steps: has(h?.steps),
    calories: foodGoal && !unknown.kcal,
    logMeal: foodGoal && !!input.nextMeal,
    protein: proteinGoal && !unknown.protein,
    // Water is logged in the app, so the tile always has today's total (0 before the first drink).
    water: true,
    weight: input.weighIns.some(w => input.days.includes(w.day)),
    bodyFat: !!input.detail?.bodyFat?.some(r => input.days.includes(localDayOf(r.at))),
    sleep: has(h?.sleepHours) && !!input.detail?.night,
    sleepScore: has(input.recovery?.sleepScore),
    mindful: has(h?.mindfulMinutes),
    hrv: has(input.recovery?.hrv),
    rhr: has(input.recovery?.rhr),
  };
}

/** The shape every tile reads. Only tiles marked ready in `tileReady` are drawn from it. */
export function buildTileData(input: HomeInput): HomeTileData {
  const { now, days, food, health: h, detail, recovery, goals } = input;
  const today = food[food.length - 1];
  const dates = days.map(dateOf);
  const kcal = food.map(d => d.kcal), protein = food.map(d => d.protein);
  const goalKcal = finite(today?.goalKcal) ? today.goalKcal : 0, goalProtein = finite(today?.goalProtein) ? today.goalProtein : 0;
  const meals = (today?.meals ?? []).filter(m => m.count > 0);
  const nextMeal = input.nextMeal;

  // Weight and body fat: one value per day in the window, null on a day without one. Pounds; the tiles convert to kilograms.
  const inWindow = input.weighIns.filter(w => days.includes(w.day));
  const lastWeigh = last(inWindow);
  const weightSeries = days.map(day => { const w = inWindow.find(x => x.day === day); return w ? round1(lb(w.kg)) : null; });
  const bodyFat = (detail?.bodyFat ?? []).filter(r => days.includes(localDayOf(r.at)));
  const lastFat = last(bodyFat);
  const fatSeries = days.map(day => { const r = bodyFat.filter(x => localDayOf(x.at) === day); return r.length ? round1(r[r.length - 1].percent) : null; });

  const steps = series(h?.steps), active = series(h?.activeKcal), exercise = series(h?.exerciseMinutes);
  const sleepH = series(h?.sleepHours), mindful = series(h?.mindfulMinutes);
  const water = input.water, waterL = days.map((_, i) => { const v = water.litres[water.litres.length - days.length + i]; return finite(v) ? v : 0; });
  // The clock style draws each of today's drinks at its hour.
  const waterHourly = Array.from({ length: 24 }, () => 0);
  for (const d of water.drinks) waterHourly[d.at.getHours()] += d.oz / FLOZ;
  const hrv = series(recovery?.hrv), rhr = series(recovery?.rhr), sleepScore = series(recovery?.sleepScore);
  const night = detail?.night ?? null;
  const nightMinutes = night ? night.stages.filter(s => s[0] !== 'awake').reduce((t, s) => t + s[2] - s[1], 0) : 0;

  const score = input.score ?? [];
  const sToday = last(score), sYesterday = score[score.length - 2];
  const week = dates.slice(-7).map((d, i, all) => {
    const s = score[score.length - 7 + i];
    const frac = (v: number | null | undefined) => finite(v) ? v / 100 : null;
    return { label: WEEKDAYS[d.getDay()], date: d.getDate(), training: frac(s?.training), food: frac(s?.food), recovery: frac(s?.recovery), today: i === all.length - 1 };
  });

  const aw = input.active;
  const elapsed = aw?.startedAt ? Math.max(0, Math.floor((now.getTime() - aw.startedAt.getTime()) / 1000)) : 0;
  const elapsedText = `${Math.floor(elapsed / 60)}:${pad2(elapsed % 60)}`;
  const eaten = finite(today?.kcal) ? today.kcal : 0;

  const volLb = input.volumeKg.slice(-DAYS).map(v => Math.round(lb(v)));
  while (volLb.length < DAYS) volLb.unshift(0);
  const weekLb = sumOf(volLb.slice(-7));

  const bedtimes = series(detail?.bedtimes);

  return {
    now, days: dates, dayLabels: dates.map(d => WEEKDAYS[d.getDay()]),
    calories: {
      unit: 'kcal', goal: goalKcal, today: eaten, series: series(kcal) as number[],
      meals: meals.map(m => ({ name: m.name, kcal: finite(m.kcal) ? Math.round(m.kcal) : null, time: m.loggedAt ? clock12(m.loggedAt) : null })),
      macros: { protein: Math.round(today?.protein ?? 0), carbs: Math.round(today?.carbs ?? 0), fat: Math.round(today?.fat ?? 0) },
    },
    protein: { unit: 'g', goal: goalProtein, today: Math.round(today?.protein ?? 0), series: series(protein) as number[], byMeal: meals.map(m => (finite(m.protein) ? Math.round(m.protein) : null)) },
    water: {
      unit: water.unit, goal: water.goal, today: last(waterL) ?? 0, series: waterL, hourly: waterHourly,
      log: water.drinks.map(d => ({ t: clock12(d.at), oz: d.oz })),
      containers: water.containers.filter(c => c.quick).map(c => ({ id: c.id, name: c.name, oz: c.oz, icon: c.icon, quick: true })),
    },
    weight: {
      unit: 'lb', goal: input.weightGoalKg ? round1(lb(input.weightGoalKg)) : 0,
      today: lastWeigh ? round1(lb(lastWeigh.kg)) : 0, series: weightSeries as number[],
      lastWeighIn: lastWeigh ? whenText(lastWeigh.day, lastWeigh.at, days) : '',
    },
    bodyFat: { unit: '%', today: lastFat ? round1(lastFat.percent) : 0, series: fatSeries as number[], lastReading: lastFat ? `${WEEKDAYS[lastFat.at.getDay()]}, ${MONTHS[lastFat.at.getMonth()]} ${lastFat.at.getDate()}` : '' },
    volume: { unit: 'lb', week: weekLb, lastWeek: Math.round(lb(input.volumeLastWeekKg)), daily: volLb, byGroup: Object.fromEntries(Object.entries(input.volumeByGroupKg).map(([k, v]) => [k, Math.round(lb(v))])), workouts: input.workoutsThisWeek },
    exercise: { unit: 'min', goal: goals.exercise, today: last(exercise) ?? 0, series: exercise as number[], hourly: hourly(detail?.exerciseHourly) },
    active: { unit: 'kcal', goal: goals.active, today: last(active) ?? 0, series: active as number[], hourly: hourly(detail?.activeHourly) },
    steps: { unit: 'steps', goal: goals.steps, today: last(steps) ?? 0, series: steps as number[], hourly: hourly(detail?.stepsHourly), source: input.sources.activity },
    sleep: {
      unit: 'h', need: goals.sleepHours,
      last: { minutes: night ? nightMinutes : Math.round((last(sleepH) ?? 0) * 60), bed: night ? clock12(night.bed) : '', wake: night ? clock12(night.wake) : '', stages: night?.stages ?? [] },
      series: sleepH as number[], bedtimes: bedtimes as number[], source: input.sources.sleep,
      score: { today: last(sleepScore) ?? 0, parts: { duration: 0, stages: 0, consistency: 0 }, source: recovery?.source ?? '', series: sleepScore as number[] },
    },
    mindful: {
      unit: 'min', goal: goals.mindful, today: last(mindful) ?? 0, series: mindful as number[], source: input.sources.activity,
      sessions: (detail?.mindful ?? []).map(s => ({ at: clock12(s.start), min: Math.round(s.minutes) })),
    },
    hrv: { unit: 'ms', today: last(hrv) ?? 0, band: band(hrv), series: hrv as number[], source: recovery?.source ?? '' },
    rhr: { unit: 'bpm', today: last(rhr) ?? 0, band: band(rhr), series: rhr as number[], source: recovery?.source ?? '' },
    score: {
      today: sToday?.value ?? 0, yesterday: finite(sYesterday?.value) ? sYesterday.value : sToday?.value ?? 0,
      series: series(score.map(s => s.value)) as number[],
      pillars: { training: sToday?.training ?? null, food: sToday?.food ?? null, recovery: sToday?.recovery ?? null },
    },
    week,
    next: {
      mode: aw ? 'workout' : 'food',
      title: nextMeal ? `Log ${nextMeal.name.toLowerCase()}` : 'Log a meal',
      sub: `${finite(today?.kcal) || !meals.length ? commas(eaten) : '–'} of ${commas(goalKcal)} kcal so far`,
      workoutTomorrow: input.upNext ?? '',
      activeWorkout: aw ? { name: aw.name, elapsed: elapsedText, setsDone: aw.setsDone, setsTotal: Math.max(aw.setsTotal, aw.setsDone, 1) } : null,
    },
    nextup: { routine: '', window: '', item: '', amount: '', due: '', doneToday: 0, totalToday: 0, routineDone: 0, routineTotal: 0, upcoming: [] },
    mealLog: {
      goal: goalKcal, eaten, pGoal: goalProtein, pEaten: Math.round(today?.protein ?? 0), next: nextMeal?.id ?? '',
      meals: (today?.meals ?? []).map(m => ({ id: m.id, name: m.name, time: m.loggedAt ? clock12(m.loggedAt) : null, kcal: finite(m.kcal) ? Math.round(m.kcal) : m.count ? null : 0, p: finite(m.protein) ? Math.round(m.protein) : m.count ? null : 0, n: m.count })),
      recent: input.recentFoods.slice(0, 6).map(f => ({ n: f.name, q: f.serving, kcal: finite(f.kcal) ? Math.round(f.kcal) : null, p: finite(f.protein) ? Math.round(f.protein) : null })),
      saved: [],
    },
  };
}

/** "Today, 6:52 AM", "Yesterday" or "Sat, Nov 21": when the newest weigh-in was. */
function whenText(day: string, at: Date | null, days: string[]): string {
  const t = days[days.length - 1], y = days[days.length - 2];
  if (day === t) return at ? `Today, ${clock12(at)}` : 'Today';
  if (day === y) return 'Yesterday';
  const d = dateOf(day);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export const _test = { series, band, plural };
