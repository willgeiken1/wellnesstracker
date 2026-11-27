import { estimateTargets, type Activity, type ProfileInput, type Unit } from '../model';

/*
 * First setup after sign-in: About you (name, body), Goals (goals, targets), Connect, Routines (three questions and a
 * suggested routine) and the finale (palette and icon). Pure state and rules here; the screens are in flow.tsx and
 * the writes in save.ts. Field names follow the app's data (ONBOARDING.md section 4).
 */

export const KG = 2.2046226218487757;
export const FLOW = ['name', 'body', 'goals', 'targets', 'connect', 'quiz', 'quiz-2', 'quiz-3', 'routine', 'finale'] as const;
export type Step = (typeof FLOW)[number];
/** How much of the mountain is lit on arrival: six sections, name and body are one, the quiz is one. */
export const LIT: Record<Step, number> = { name: 0, body: 1 / 6, goals: 2 / 6, targets: 2.5 / 6, connect: 3 / 6, quiz: 4 / 6, 'quiz-2': 4.33 / 6, 'quiz-3': 4.66 / 6, routine: 5 / 6, finale: 1 };

export type Plan = 'cut' | 'maintain' | 'bulk';
export const PLAN_FACTOR: Record<Plan, number> = { cut: 0.85, maintain: 1, bulk: 1.1 };
/** '' not chosen; 'none' is "Prefer not to say", saved as ''. */
export type SexChoice = '' | 'female' | 'male' | 'none';
export type GoalId = 'train' | 'eat' | 'sleep' | 'routines';
export type HabitId = 'water' | 'stretch' | 'outside' | 'read' | 'screens' | 'supps';
/** Daily targets as the screen shows them: kcal and grams. `est` is true when worked out from the basics. */
/** `own` marks the numbers the person set, or that follow only from numbers they set. An estimate from an Apple Health
 * weight is a Health-derived value, so only targets that are wholly their own are saved (see save.ts). */
export interface Macros { kcal: number; p: number; c: number; f: number; est: boolean; own?: Partial<Record<MacroKey, true>> }
export type MacroKey = 'kcal' | 'p' | 'c' | 'f';
/** Every number is the person's own: none still rests on the estimate. */
export const allOwn = (t: Macros) => !!(t.own?.kcal && t.own.p && t.own.c && t.own.f);

export interface FlowDraft {
  name: string; unit: Unit;
  /** Height in inches, as the menu picks it (centimetres are kept as inches to three places). */
  heightIn: number | null;
  weight: string; age: string; sex: SexChoice; activity: Activity | '';
  filled: boolean;
  /** The Apple Health reading (kg) that filled the weight, while the field still holds it (converted when units change);
   * null once a weight is typed. That reading is already kept in the Health store, so setup never saves it again. */
  healthKg: number | null;
  goals: Record<GoalId, boolean>;
  plan: Plan; t: Macros | null; edited: boolean;
  quiz: { wake: string; keep: Partial<Record<HabitId, boolean>>; wind: string };
  /** The suggested routines were added to Routines. */
  routine: boolean;
  skipped: { about: boolean; goals: boolean };
}

export function blankDraft(unit: Unit = 'lb'): FlowDraft {
  return { name: '', unit, heightIn: null, weight: '', age: '', sex: '', activity: '', filled: false, healthKg: null,
    goals: { train: false, eat: false, sleep: false, routines: false }, plan: 'maintain', t: null, edited: false,
    quiz: { wake: '', keep: {}, wind: '' }, routine: false, skipped: { about: false, goals: false } };
}

export const anyGoal = (d: FlowDraft) => Object.values(d.goals).some(Boolean);
export const anyHabit = (d: FlowDraft) => Object.values(d.quiz.keep).some(Boolean);

/* ---------- body basics ---------- */

const num = (s: string) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
export function kgOf(d: Pick<FlowDraft, 'weight' | 'unit'>): number | null { const w = num(d.weight); if (!(w > 0)) return null; return d.unit === 'kg' ? w : w / KG; }
export const ageOf = (d: Pick<FlowDraft, 'age'>) => { const a = parseInt(d.age, 10); return Number.isFinite(a) && a > 0 ? a : null; };
/** The birth date the app keeps for an age in years: 1 January of the year they were born, near enough. */
export const dobFor = (age: number, year = new Date().getFullYear()) => `${year - age}-01-01`;

/** Switching units converts the weight already typed (one decimal) and keeps the height. */
export function switchUnit(d: FlowDraft, unit: Unit): FlowDraft {
  if (unit === d.unit) return d;
  const w = num(d.weight);
  return { ...d, unit, weight: w > 0 ? (unit === 'kg' ? w / KG : w * KG).toFixed(1) : d.weight, t: null };
}

export interface HeightOption { v: number; l: string }
/** The height menu: 4 ft 6 in to 7 ft 0 in, or 140 to 210 cm. Values are inches. */
export function heightOptions(unit: Unit): HeightOption[] {
  const out: HeightOption[] = [];
  if (unit === 'kg') for (let c = 140; c <= 210; c++) out.push({ v: +(c / 2.54).toFixed(3), l: `${c} cm` });
  else for (let i = 54; i <= 84; i++) out.push({ v: i, l: `${Math.floor(i / 12)} ft ${i % 12} in` });
  return out;
}
export function heightLabel(heightIn: number | null, unit: Unit): string {
  if (!heightIn) return '';
  if (unit === 'kg') return `${Math.round(heightIn * 2.54)} cm`;
  const r = Math.round(heightIn);
  return `${Math.floor(r / 12)} ft ${r % 12} in`;
}
/** Which menu row is ticked: the stored height in the menu's own steps, or 5 ft 10 in / 178 cm when none is set. */
export function heightMenuValue(heightIn: number | null, unit: Unit): number {
  if (unit === 'kg') return +((heightIn ? Math.round(heightIn * 2.54) : 178) / 2.54).toFixed(3);
  return heightIn ? Math.round(heightIn) : 70;
}

/* ---------- targets: estimateTargets (model.ts), then the plan ---------- */

/** The draft as the app's profile input, for estimateTargets. Missing basics stay blank. */
export function profileInput(d: FlowDraft, year = new Date().getFullYear()): ProfileInput {
  const age = ageOf(d);
  return { name: d.name, dob: age ? dobFor(age, year) : '', unit: d.unit,
    height: d.heightIn ? String(d.unit === 'kg' ? d.heightIn * 2.54 : d.heightIn) : '',
    weight: kgOf(d) ? String(d.weight).replace(',', '.') : '', sex: d.sex === 'female' || d.sex === 'male' ? d.sex : '', activity: d.activity || 'light' };
}

const fatFor = (kcal: number) => Math.round(kcal * 0.25 / 9);
const carbsFor = (kcal: number, p: number, f: number) => Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));

/** The suggestion for a plan. Without the basics, the app's current targets are the starting point. */
export function suggest(d: FlowDraft, plan: Plan, fallback: { kcal: number; p: number }, day?: string): Macros {
  const e = estimateTargets(profileInput(d, day ? Number(day.slice(0, 4)) : undefined), day, plan);
  if (!e) { const kcal = Math.round(fallback.kcal), p = Math.round(fallback.p), f = fatFor(kcal); return { kcal, p, f, c: carbsFor(kcal, p, f), est: false }; }
  return { kcal: Math.round(e.energy_kj / 4.184), p: e.protein_g, c: e.carbs_g, f: e.fat_g, est: true };
}
/** Calories moved with the stepper: protein stays, fat is 25 percent, carbs take the rest. */
export function withKcal(t: Macros, kcal: number): Macros {
  const f = fatFor(kcal);
  // Fat follows calories alone; carbs also follow protein, so they are the person's own only when protein is.
  return { ...t, kcal, f, c: carbsFor(kcal, t.p, f), own: { ...t.own, kcal: true, f: true, ...(t.own?.p ? { c: true } : { c: undefined }) } };
}
/** A macro typed in grams: calories follow, to the nearest ten. */
export function withMacro(t: Macros, key: 'p' | 'c' | 'f', grams: number): Macros {
  const n = { ...t, [key]: Math.max(0, Math.round(grams) || 0) }, own = { ...t.own, [key]: true as const };
  // Calories follow all three macros, so they are the person's own only when every macro is.
  return { ...n, kcal: Math.round((n.p * 4 + n.c * 4 + n.f * 9) / 10) * 10, own: { ...own, kcal: own.p && own.c && own.f ? true : undefined } };
}
export const KCAL_STEP = { step: 50, min: 1200, max: 5000 };
export function macroShare(t: Macros) {
  const p = t.p * 4, c = t.c * 4, f = t.f * 9, all = p + c + f || 1;
  return { p: Math.round(p / all * 100), c: Math.round(c / all * 100), f: Math.round(f / all * 100), weights: [p, c, f] as const };
}

/* ---------- order, back and skip ---------- */

/** The step after this one, or null when the flow ends (a resumed flow ends after the skipped sections). */
export function nextOf(step: Step, d: FlowDraft, resume = false): Step | null {
  if (resume) {
    if (step === 'name') return 'body';
    if (step === 'body') return d.skipped.goals ? 'goals' : null;
    if (step === 'goals') return 'targets';
    return null;
  }
  const i = FLOW.indexOf(step);
  return FLOW[i + 1] ?? null;
}
/** The step Back returns to, skipping skipped steps; null leaves the flow (to welcome, or Home when resumed). */
export function prevOf(step: Step, d: FlowDraft, resume = false): Step | null {
  // Resumed from Home: Back leaves the flow, except from targets to goals.
  if (resume) return step === 'targets' ? 'goals' : null;
  const i = FLOW.indexOf(step);
  if (i <= 0) return null;
  let p: Step = FLOW[i - 1];
  if (p === 'targets' && d.skipped.goals) p = 'goals';
  if (p === 'body' && d.skipped.about) p = 'name';
  if (step === 'finale' && p === 'routine' && !d.routine && !d.quiz.wind) p = 'quiz';
  return p;
}
/** Where a skip control goes. */
export function skipTarget(step: Step, d: FlowDraft, resume = false): Step | null {
  if (step === 'name' || step === 'body') return resume ? (d.skipped.goals ? 'goals' : null) : 'goals';
  if (step === 'goals' || step === 'targets') return resume ? null : 'connect';
  return 'finale';
}
/** The draft after a skip: About you or Goals is marked skipped; the routines quiz marks nothing. */
export function markSkip(step: Step, d: FlowDraft): FlowDraft {
  if (step === 'name' || step === 'body') return { ...d, skipped: { ...d.skipped, about: true } };
  if (step === 'goals' || step === 'targets') return { ...d, skipped: { ...d.skipped, goals: true } };
  return d;
}
/** The draft after Continue: the section is no longer skipped. */
export function markDone(step: Step, d: FlowDraft): FlowDraft {
  if (step === 'name' || step === 'body') return { ...d, skipped: { ...d.skipped, about: false } };
  if (step === 'goals' || step === 'targets') return { ...d, skipped: { ...d.skipped, goals: false } };
  return d;
}
/** Whether Continue is on. */
export function canContinue(step: Step, d: FlowDraft): boolean {
  if (step === 'name') return !!d.name.trim();
  if (step === 'goals') return anyGoal(d);
  if (step === 'quiz') return !!d.quiz.wake;
  if (step === 'quiz-2') return anyHabit(d);
  if (step === 'quiz-3') return !!d.quiz.wind;
  return true;
}

/* ---------- routines ---------- */

export const WAKE = ['5.5', '6.5', '7.5', '8.5'] as const;
export const WIND = ['20.5', '21.5', '22.5', '23'] as const;
export const HABITS: readonly HabitId[] = ['water', 'stretch', 'outside', 'read', 'screens', 'supps'];
export type RoutineItemKey = 'water' | 'stretch' | 'outside' | 'read' | 'screens';
export interface RoutinePlan { am: { from: number; to: number; items: RoutineItemKey[] }; pm: { from: number; to: number; items: RoutineItemKey[] }; supps: boolean }
/** Morning starts at the wake answer for an hour; night is the hour before wind-down. Never a dose. */
export function routinePlan(q: FlowDraft['quiz']): RoutinePlan {
  const wake = parseFloat(q.wake || '6.5'), wind = parseFloat(q.wind || '21.5'), k = q.keep;
  const am: RoutineItemKey[] = (['water', 'stretch', 'outside'] as const).filter(x => k[x]);
  const pm: RoutineItemKey[] = (['read', 'screens'] as const).filter(x => k[x]);
  return { am: { from: wake, to: wake + 1, items: am.length ? am : ['water'] }, pm: { from: wind - 1, to: wind, items: pm.length ? pm : ['screens'] }, supps: !!k.supps };
}

/** "6:30 AM", or "06:30" on the 24 hour clock. */
export function clockTime(h: number, clock24 = false): string {
  let H = Math.floor(h), m = Math.round((h - H) * 60);
  if (m >= 60) { m -= 60; H += 1; }
  H = ((H % 24) + 24) % 24;
  const mm = String(m).padStart(2, '0');
  return clock24 ? `${String(H).padStart(2, '0')}:${mm}` : `${H % 12 || 12}:${mm} ${H < 12 ? 'AM' : 'PM'}`;
}
/** The quiz's time answers: "Before 6 AM", "6 to 7 AM", "After 8 AM" (or "Before 06:00" on the 24 hour clock). */
export function slotLabel(kind: 'wake' | 'wind', value: string, clock24 = false): string {
  const v = parseFloat(value), list = (kind === 'wake' ? WAKE : WIND).map(Number), i = list.indexOf(v);
  const lo = Math.floor(v), first = i === 0, last = i === list.length - 1;
  const hr = (h: number) => clock24 ? `${String(h % 24).padStart(2, '0')}:00` : `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`;
  const bare = (h: number) => clock24 ? `${String(h % 24).padStart(2, '0')}:00` : String(h % 12 || 12);
  if (first) return `Before ${hr(lo + 1)}`;
  if (last) return `After ${hr(Math.ceil(v) === v ? v : lo)}`;
  const same = (lo < 12) === (lo + 1 < 12);
  return `${same ? bare(lo) : hr(lo)} to ${hr(lo + 1)}`;
}
