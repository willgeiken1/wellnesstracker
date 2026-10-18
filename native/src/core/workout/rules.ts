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
export function suggestion(previous: WorkingSet[], equipment: Equipment, unit: Unit, targetReps?: number, stack?: number) {
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
  const hit = sets.every(s => s.reps >= (targetReps ?? s.reps));
  return {
    weight: rounded(last.weight + (hit ? jump : 0)),
    jump: hit && jump > 0,
    previous: last.weight,
    target: targetReps ?? last.reps,
    count: sets.length
  };
}
export const cardKey = (exercise: string, weight: number, unit: Unit) => `${exercise.trim().toLowerCase()}:${rounded(toKg(weight, unit))}`;
export function shouldShowCard(exercise: string, s: ReturnType<typeof suggestion>, unit: Unit, seen: string[]) {
  return s.jump && s.weight !== null && !seen.includes(cardKey(exercise, s.weight, unit));
}
export function detectPR(current: WorkingSet[], prior: WorkingSet[]) {
  const eligible = (sets: WorkingSet[]) => working(sets).filter(s => s.reps >= 1);
  const best = (sets: WorkingSet[]) => ({
    weight: Math.max(0, ...sets.map(s => s.weight)),
    e1rm: Math.max(0, ...sets.map(s => s.weight * (1 + s.reps / 30)))
  });
  const before = eligible(prior),
    now = best(eligible(current)),
    old = best(before);
  return {
    weight: before.length > 0 && now.weight > old.weight + 1e-7,
    e1rm: before.length > 0 && now.e1rm > old.e1rm + 1e-7,
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
