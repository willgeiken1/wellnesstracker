import type { MuscleGroup } from '../workout/training-data';

/** One exercise of a preset day: [library name, sets, fewest reps, most reps]. Names are the exercise library's own. */
export type PresetExercise = readonly [name: string, sets: number, repMin: number, repMax: number];
export interface PresetDay { name: string; focus: readonly MuscleGroup[] | null; ex: readonly PresetExercise[] }
export type PresetKey = 'ppl' | 'ul' | 'fb' | 'arnold' | 'bro' | 'phul';
export interface SplitPreset {
  key: PresetKey;
  name: string;
  blurb: string;
  level: string;
  /** The weekly target the preset starts on. */
  perWeek: number;
  /** A typical week, Monday first: the day index trained that weekday, or -1 for rest. Used when it runs by weekdays. */
  week: readonly number[];
  days: readonly PresetDay[];
}

const d = (name: string, focus: readonly MuscleGroup[] | null, ex: readonly PresetExercise[]): PresetDay => ({ name, focus, ex });

/**
 * The six preset splits of the design (Insight Mockup v21, pages/splits.js), every one starting in Rotate in order. The
 * mockup's exercise names are mapped onto the library's (Back squat is Squat, Lat pulldown is Lat Pulldown Machine ...),
 * so each day's muscles, equipment and the weekly sets come from the same bank the picker browses.
 */
export const SPLIT_PRESETS: readonly SplitPreset[] = [
  { key: 'ppl', name: 'Push Pull Legs', blurb: 'Pressing, pulling and legs, each twice in a six-day cycle.', level: 'Intermediate', perWeek: 5, week: [0, 1, 2, 3, 4, 5, -1],
    days: [
      d('Push A', null, [['Bench Press', 4, 3, 5], ['Overhead Press', 3, 6, 8], ['Incline Dumbbell Press', 3, 8, 10], ['Dumbbell Lateral Raise', 4, 12, 15], ['Cable Tricep Pulldown', 3, 10, 12]]),
      d('Pull A', null, [['Barbell Row', 4, 6, 8], ['Pull-Up', 4, 5, 8], ['Lat Pulldown Machine', 3, 8, 10], ['Face Pull', 4, 12, 15], ['Hammer Curl', 4, 8, 10]]),
      d('Legs A', null, [['Squat', 4, 3, 5], ['Romanian Deadlift', 3, 6, 8], ['Dumbbell Walking Lunge', 3, 8, 10], ['Leg Press', 3, 8, 12], ['Lying Leg Curl', 3, 10, 12], ['Standing Calf Raise', 2, 12, 15]]),
      d('Push B', null, [['Incline Dumbbell Press', 3, 8, 10], ['Overhead Press', 3, 6, 8], ['Bar Dip', 3, 6, 8], ['Cable Fly', 3, 10, 12], ['Dumbbell Lateral Raise', 3, 12, 15], ['Cable Tricep Pulldown', 3, 10, 12]]),
      d('Pull B', null, [['Deadlift', 3, 3, 5], ['Chest-Supported Dumbbell Row', 4, 8, 10], ['Lat Pulldown Machine', 4, 8, 10], ['Face Pull', 3, 12, 15], ['Barbell Curl', 4, 8, 10]]),
      d('Legs B', null, [['Squat', 5, 5, 5], ['Hip Thrust', 4, 8, 10], ['Bulgarian Split Squat', 3, 8, 10], ['Leg Extension', 3, 10, 12], ['Seated Calf Raise', 3, 12, 15]]),
    ] },
  { key: 'ul', name: 'Upper Lower', blurb: 'Upper body and lower body on alternating days, four a week.', level: 'All levels', perWeek: 4, week: [0, 1, -1, 2, 3, -1, -1],
    days: [
      d('Upper A', ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'], [['Bench Press', 4, 5, 8], ['Barbell Row', 4, 6, 8], ['Overhead Press', 3, 8, 10], ['Lat Pulldown Machine', 3, 10, 12], ['Barbell Curl', 2, 10, 12], ['Cable Tricep Pulldown', 2, 10, 12]]),
      d('Lower A', ['Quads', 'Hamstrings', 'Glutes', 'Calves'], [['Squat', 4, 5, 8], ['Romanian Deadlift', 3, 8, 10], ['Leg Press', 3, 10, 12], ['Lying Leg Curl', 3, 10, 12], ['Standing Calf Raise', 3, 12, 15]]),
      d('Upper B', ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'], [['Incline Dumbbell Press', 4, 8, 10], ['Pull-Up', 4, 6, 8], ['Cable Close Grip Seated Row', 3, 10, 12], ['Dumbbell Lateral Raise', 3, 12, 15], ['Hammer Curl', 2, 10, 12], ['EZ Bar Lying Triceps Extension', 2, 10, 12]]),
      d('Lower B', ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'], [['Deadlift', 3, 3, 5], ['Front Squat', 3, 6, 8], ['Bulgarian Split Squat', 3, 8, 10], ['Leg Extension', 3, 12, 15], ['Seated Calf Raise', 3, 12, 15], ['Cable Crunch', 3, 12, 15]]),
    ] },
  { key: 'fb', name: 'Full body', blurb: 'Everything in each session, three times a week. The best start.', level: 'Beginner', perWeek: 3, week: [0, -1, 1, -1, 2, -1, -1],
    days: [
      d('Full body A', ['Quads', 'Chest', 'Back', 'Shoulders'], [['Squat', 3, 5, 8], ['Bench Press', 3, 5, 8], ['Barbell Row', 3, 8, 10], ['Dumbbell Lateral Raise', 2, 12, 15], ['Lying Leg Curl', 2, 10, 12], ['Cable Crunch', 2, 12, 15]]),
      d('Full body B', ['Back', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps'], [['Deadlift', 3, 3, 5], ['Overhead Press', 3, 6, 8], ['Lat Pulldown Machine', 3, 8, 10], ['Dumbbell Walking Lunge', 2, 10, 12], ['Hammer Curl', 2, 10, 12], ['Cable Tricep Pulldown', 2, 10, 12]]),
      d('Full body C', ['Quads', 'Chest', 'Back', 'Glutes'], [['Front Squat', 3, 6, 8], ['Incline Dumbbell Press', 3, 8, 10], ['Chest-Supported Dumbbell Row', 3, 8, 10], ['Hip Thrust', 3, 8, 10], ['Face Pull', 2, 12, 15], ['Standing Calf Raise', 2, 12, 15]]),
    ] },
  { key: 'arnold', name: 'Arnold split', blurb: 'Chest and back, shoulders and arms, then legs. Twice through a week.', level: 'Advanced', perWeek: 6, week: [0, 1, 2, 0, 1, 2, -1],
    days: [
      d('Chest & back', ['Chest', 'Back'], [['Bench Press', 4, 6, 8], ['Pull-Up', 4, 6, 8], ['Incline Dumbbell Press', 3, 8, 10], ['Barbell Row', 3, 8, 10], ['Cable Fly', 3, 12, 15], ['Lat Pulldown Machine', 3, 10, 12]]),
      d('Shoulders & arms', ['Shoulders', 'Biceps', 'Triceps'], [['Overhead Press', 4, 6, 8], ['Dumbbell Lateral Raise', 4, 12, 15], ['Barbell Curl', 3, 8, 10], ['EZ Bar Lying Triceps Extension', 3, 8, 10], ['Hammer Curl', 3, 10, 12], ['Cable Tricep Pulldown', 3, 10, 12]]),
      d('Legs', ['Quads', 'Hamstrings', 'Glutes', 'Calves'], [['Squat', 4, 6, 8], ['Romanian Deadlift', 3, 8, 10], ['Leg Press', 3, 10, 12], ['Lying Leg Curl', 3, 10, 12], ['Standing Calf Raise', 4, 12, 15], ['Cable Crunch', 3, 12, 15]]),
    ] },
  { key: 'bro', name: 'Bro split', blurb: 'One muscle group a day, five days a week, lots of sets for each.', level: 'Intermediate', perWeek: 5, week: [0, 1, 2, 3, 4, -1, -1],
    days: [
      d('Chest', ['Chest'], [['Bench Press', 4, 6, 8], ['Incline Dumbbell Press', 3, 8, 10], ['Bar Dip', 3, 8, 10], ['Cable Fly', 3, 12, 15], ['Pec Fly Machine', 2, 12, 15]]),
      d('Back', ['Back'], [['Deadlift', 3, 3, 5], ['Pull-Up', 4, 6, 8], ['Barbell Row', 3, 8, 10], ['Lat Pulldown Machine', 3, 10, 12], ['Cable Close Grip Seated Row', 3, 10, 12]]),
      d('Shoulders', ['Shoulders'], [['Overhead Press', 4, 6, 8], ['Arnold Press', 3, 8, 10], ['Dumbbell Lateral Raise', 4, 12, 15], ['Face Pull', 3, 12, 15], ['Rear Deltoid Fly Machine', 3, 12, 15]]),
      d('Arms', ['Biceps', 'Triceps'], [['Barbell Curl', 4, 8, 10], ['EZ Bar Lying Triceps Extension', 4, 8, 10], ['EZ Bar Preacher Curl', 3, 10, 12], ['Cable Tricep Pulldown', 3, 10, 12], ['Hammer Curl', 3, 10, 12]]),
      d('Legs', ['Quads', 'Hamstrings', 'Glutes', 'Calves'], [['Squat', 4, 6, 8], ['Leg Press', 3, 10, 12], ['Romanian Deadlift', 3, 8, 10], ['Leg Extension', 3, 12, 15], ['Lying Leg Curl', 3, 10, 12], ['Standing Calf Raise', 4, 12, 15]]),
    ] },
  { key: 'phul', name: 'PHUL', blurb: 'Power upper and lower early in the week, size work after. Strength and muscle.', level: 'Intermediate', perWeek: 4, week: [0, 1, -1, 2, 3, -1, -1],
    days: [
      d('Upper power', ['Chest', 'Back', 'Shoulders'], [['Bench Press', 4, 3, 5], ['Barbell Row', 4, 3, 5], ['Overhead Press', 3, 5, 8], ['Pull-Up', 3, 5, 8], ['Barbell Curl', 2, 6, 10], ['EZ Bar Lying Triceps Extension', 2, 6, 10]]),
      d('Lower power', ['Quads', 'Hamstrings', 'Glutes', 'Calves'], [['Squat', 4, 3, 5], ['Deadlift', 3, 3, 5], ['Leg Press', 3, 8, 10], ['Lying Leg Curl', 3, 6, 10], ['Standing Calf Raise', 4, 6, 10]]),
      d('Upper size', ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'], [['Incline Dumbbell Press', 4, 8, 12], ['Cable Fly', 3, 10, 15], ['Cable Close Grip Seated Row', 4, 8, 12], ['Lat Pulldown Machine', 3, 8, 12], ['Dumbbell Lateral Raise', 3, 10, 15], ['Hammer Curl', 3, 10, 15], ['Cable Tricep Pulldown', 3, 10, 15]]),
      d('Lower size', ['Quads', 'Hamstrings', 'Glutes', 'Calves'], [['Front Squat', 4, 8, 12], ['Bulgarian Split Squat', 3, 8, 12], ['Leg Extension', 3, 10, 15], ['Lying Leg Curl', 3, 10, 15], ['Seated Calf Raise', 4, 10, 15], ['Hip Thrust', 3, 8, 12]]),
    ] },
];
export const splitPreset = (key: unknown) => SPLIT_PRESETS.find(p => p.key === key) ?? null;

/** The kinds of day in a split, in words ("Push · Pull · Legs"): each day's name without its A, B or number. */
export function dayKinds(days: readonly { name: string }[]) {
  const seen: string[] = [];
  for (const x of days) { const k = x.name.replace(/\s+(day\s+)?([A-C]|\d)$/, ''); if (!seen.includes(k)) seen.push(k); }
  return seen;
}

/** A typical week for n training days, Monday first, for a split moved onto set weekdays (3: Monday, Wednesday, Friday). */
export const DEFAULT_WEEKDAYS: Readonly<Record<number, readonly number[]>> = {
  1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
};
/** Weekdays switched on, with the split's days laid onto them in order (round again when there are more weekdays). */
export function spreadWeek(on: readonly boolean[], dayCount: number): number[] {
  let k = 0;
  return Array.from({ length: 7 }, (_, i) => on[i] && dayCount > 0 ? (k++) % dayCount : -1);
}
export function defaultWeek(dayCount: number, perWeek = dayCount): number[] {
  const on = DEFAULT_WEEKDAYS[Math.max(1, Math.min(7, perWeek))] ?? DEFAULT_WEEKDAYS[3];
  return spreadWeek(Array.from({ length: 7 }, (_, i) => on.includes(i)), dayCount);
}

/** Two suggested exercises for a muscle when a built split asks for them: the presets' own picks first, in the order they
 * appear, so a blank split starts with the same staples. */
export function suggestFor(muscle: MuscleGroup, groupOf: (exercise: string) => MuscleGroup | null, n = 2): PresetExercise[] {
  const out: PresetExercise[] = [];
  for (const p of SPLIT_PRESETS) for (const day of p.days) for (const e of day.ex) {
    if (out.length >= n) return out;
    if (groupOf(e[0]) === muscle && !out.some(x => x[0] === e[0])) out.push([e[0], 3, 8, 12]);
  }
  return out;
}
