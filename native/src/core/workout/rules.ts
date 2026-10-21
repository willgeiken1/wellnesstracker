export type Unit = 'lb' | 'kg';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';
export interface WorkingSet {
  weight: number;
  reps: number;
  done: boolean;
  warmup?: boolean;
}
export const WEEKLY_TARGET = {
  min: 10,
  max: 20
} as const;
export const toKg = (value: number, unit: Unit) => unit === 'lb' ? value * 0.45359237 : value;
export const fromKg = (value: number, unit: Unit) => unit === 'lb' ? value / 0.45359237 : value;
export const rounded = (n: number) => Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
/** Display-only rounding per plan §9; never write this back on a unit switch. */
export function displayWeight(kg: number, unit: Unit) {
  if (!Number.isFinite(kg)) return 0;
  const quantum = unit === 'lb' ? .5 : .25;
  return Math.round(fromKg(kg, unit) / quantum) * quantum;
}
export function step(equipment: Equipment, unit: Unit, stack?: number) {
  if (equipment === 'bodyweight' || equipment === 'other') return 0;
  return equipment === 'machine' || equipment === 'cable' ? stack ?? (unit === 'lb' ? 10 : 5) : unit === 'lb' ? 5 : 2.5;
}
const working = (sets: WorkingSet[]) => sets.filter(s => s.done && !s.warmup);
export interface SuggestionContext {
  /** Finished sessions for this exercise, including previous; dates are local YYYY-MM-DD. */
  sessions?: { day: string; sets: WorkingSet[]; easedIn?: boolean }[];
  paused?: { start: string; end: string }[];
  today?: string;
  /** Last training day across all exercises, not just this exercise. */
  lastTrainingDay?: string;
}
const meetsTarget = (sets: WorkingSet[], target?: number) => sets.every(s => s.reps >= (target ?? s.reps));
export function suggestion(previous: WorkingSet[], equipment: Equipment, unit: Unit, targetReps?: number, stack?: number, context: SuggestionContext = {}) {
  const sets = working(previous);
  const last = sets.at(-1);
  if (!last) return {
    weight: null,
    jump: false,
    previous: null,
    target: targetReps ?? null,
    count: 0
  };
  const jump = step(equipment, unit, stack);
  const hit = meetsTarget(sets, targetReps);
  // UTC arithmetic on strict local day strings counts calendar days across DST.
  const dayStamp = (day: string) => {
    const stamp = Date.parse(day);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(stamp)
      && new Date(stamp).toISOString().slice(0, 10) === day ? stamp : NaN;
  };
  let gap = 0;
  if (context.today !== undefined && context.lastTrainingDay !== undefined) {
    gap = (dayStamp(context.today) - dayStamp(context.lastTrainingDay)) / 86400000;
    if (!Number.isFinite(gap) || gap < 0) {
      console.warn('Workout suggestion: invalid gap date; using conservative ease-in.');
      gap = 21;
    }
  }
  const recent = jump > 0 ? (context.sessions ?? [])
    .filter(s => {
      const sessionSets = working(s.sets);
      const success = sessionSets.length > 0 && meetsTarget(sessionSets, targetReps);
      return success || !(context.paused ?? []).some(p => p.start <= s.day && s.day <= p.end);
    })
    .sort((a, b) => a.day.localeCompare(b.day)).slice(-2) : [];
  const twoMisses = recent.length === 2 && recent.every(s => {
    const sessionSets = working(s.sets);
    return !s.easedIn && sessionSets.length > 0 && !meetsTarget(sessionSets, targetReps);
  });
  // Ease-in wins over step-back: never compound the two reductions or add a jump.
  const factor = gap >= 21 ? .8 : gap >= 7 || twoMisses ? .9 : 1;
  const reduce = jump > 0 && factor < 1;
  return {
    weight: rounded(reduce ? Math.max(jump, Math.min(last.weight, Math.round(last.weight * factor / jump) * jump)) : last.weight + (hit ? jump : 0)),
    jump: !reduce && hit && jump > 0,
    previous: last.weight,
    target: targetReps ?? last.reps,
    count: sets.length
  };
}
export const cardKey = (exercise: string, weight: number, unit: Unit) => `${exercise.trim().toLowerCase()}:${rounded(toKg(weight, unit))}`;
export function shouldShowCard(exercise: string, s: ReturnType<typeof suggestion>, unit: Unit, seen: string[]) {
  return s.jump && s.weight !== null && !seen.includes(cardKey(exercise, s.weight, unit));
}
export interface LoadContext {
  equipment?: Equipment;
  /** Latest weigh-in at the session date, in the same unit as WorkingSet.weight. */
  bodyweight?: number;
}
function loadFor(set: WorkingSet, context: LoadContext) {
  if (context.equipment !== 'bodyweight') return set.weight;
  const bodyweight = context.bodyweight;
  return bodyweight !== undefined && Number.isFinite(bodyweight) && bodyweight > 0 ? bodyweight + set.weight : null;
}
/** Pure row metrics; null means unknown/ineligible, never a fabricated load. */
export function setMetrics(set: WorkingSet, context: LoadContext = {}) {
  const perHand = context.equipment === 'dumbbell';
  const load = loadFor(set, context);
  const eligible = set.done && !set.warmup && set.reps >= 1;
  return {
    reps: eligible ? set.reps : 0,
    volume: !eligible ? 0 : load === null ? null : load * set.reps * (perHand ? 2 : 1),
    e1rm: eligible && set.reps <= 12 && load !== null ? load * (1 + set.reps / 30) : null,
    perHand,
    /** Only meaningful for bodyweight: the weigh-in needed for total load is unknown. */
    est: load === null
  };
}
/** Weight PRs compare added load only; e1RM uses total load for bodyweight.
 * Supply separate prior context when the historical weigh-in differs. */
export function detectPR(current: WorkingSet[], prior: WorkingSet[], context: LoadContext = {}, priorContext: LoadContext = context) {
  const eligible = (sets: WorkingSet[]) => working(sets).filter(s => s.reps >= 1);
  const best = (sets: WorkingSet[], context: LoadContext) => ({
    weight: Math.max(0, ...sets.map(s => s.weight)),
    e1rm: Math.max(0, ...sets.map(s => setMetrics(s, context).e1rm ?? 0))
  });
  const before = eligible(prior), now = best(eligible(current), context), old = best(before, priorContext);
  return {
    weight: before.length > 0 && now.weight > old.weight + 1e-7,
    e1rm: before.some(s => setMetrics(s, priorContext).e1rm !== null) && now.e1rm > old.e1rm + 1e-7,
    bestWeight: now.weight,
    bestE1rm: now.e1rm
  };
}
export function attribute(exercises: {
  main?: string;
  helpers: string[];
  sets: WorkingSet[];
}[]) {
  const totals: Record<string, number> = {};
  for (const e of exercises) {
    const count = working(e.sets).length;
    if (!count || !e.main) continue;
    totals[e.main] = (totals[e.main] ?? 0) + count;
    for (const m of new Set(e.helpers.filter(m => m !== e.main))) totals[m] = (totals[m] ?? 0) + count * .5;
  }
  return totals;
}
export function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekOf(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return localDay(start);
}
export function plates(weight: number, unit: Unit) {
  const bar = unit === 'lb' ? 45 : 20,
    sizes = unit === 'lb' ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25];
  // Reject legacy/invalid drafts before constructing a plate list.
  if (!Number.isFinite(weight) || weight < 0 || toKg(weight, unit) > 1000) return { bar, plates: [], remainder: 0 };
  let remainder = (weight - bar) / 2;
  const result: number[] = [];
  for (const plate of sizes) while (remainder + 1e-8 >= plate && result.length < 1000) {
    result.push(plate);
    remainder -= plate;
  }
  return {
    bar,
    plates: result,
    remainder: rounded(remainder)
  };
}
/** Allows an unfinished decimal while keeping keypad edits inside the entry limits. */
export function validKeypadValue(value: string, decimal: boolean, unit: Unit) {
  if (value === '') return true;
  const pattern = decimal ? unit === 'lb' ? /^\d+(?:\.\d{0,1})?$/ : /^\d+(?:\.\d{0,2})?$/ : /^\d+$/;
  return pattern.test(value) && Number.isFinite(Number(value)) && (decimal ? toKg(Number(value), unit) <= 1000 : Number(value) <= 100);
}
export function keypad(value: string, key: string, decimal: boolean, unit: Unit = 'lb') {
  if (key === 'backspace') return value.slice(0, -1);
  let next = value;
  if (key === '.' && decimal && !value.includes('.')) next = value ? `${value}.` : '0.';
  else if (/^\d$/.test(key)) next = value === '0' ? key : value + key;
  return validKeypadValue(next, decimal, unit) ? next : value;
}
export function validateSet(weight: string, reps: string, unit: Unit, previousKg?: number) {
  const w = Number(weight),
    r = Number(reps);
  const valid = weight.trim() !== '' && reps.trim() !== '' && Number.isFinite(w) && w >= 0 && toKg(w, unit) <= 1000 && Number.isInteger(r) && r >= 0 && r <= 100;
  const warning: 'highReps' | 'weightJump' | null = r > 50 ? 'highReps' : previousKg !== undefined && previousKg > 0 && toKg(w, unit) > previousKg * 1.5 ? 'weightJump' : null;
  return {
    valid,
    warning
  };
}
export const validateDate = (stamp: number, now = Date.now()) => Number.isFinite(stamp) && stamp >= 0 && stamp <= now;
export function nextField(field: 'weight' | 'reps', index: number, count: number) {
  return field === 'weight' ? {
    field: 'reps' as const,
    index
  } : index + 1 < count ? {
    field: 'weight' as const,
    index: index + 1
  } : null;
}
export const remainingSeconds = (endAt: number, now = Date.now()) => Number.isFinite(endAt - now) ? Math.max(0, Math.ceil((endAt - now) / 1000)) : 0;
