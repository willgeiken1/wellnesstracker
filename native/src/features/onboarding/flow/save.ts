import type { Repository } from '@/data/repository';
import { compareRows } from '@/data/rows';
import { SETTINGS_PREFS_KEY, loadSettingsPrefs, withPref } from '@/features/settings/prefs';
import type { RoutinesStore } from '@/features/routines/store';
import type { RoutinesState } from '@/features/routines/model';
import { ageOn, estimateTargets, today, type Targets } from '../model';
import { ageOf, allOwn, dobFor, kgOf, profileInput, routinePlan, type FlowDraft, type GoalId, type Macros, type RoutineItemKey } from './model';

/*
 * What setup writes (ONBOARDING.md section 4). Everything is written when they tap Open Insight, except the routines
 * (on Add to Routines) and the connections (on Connect). Nothing from a skipped section is written. A profile row is
 * always written, so an account that has been through setup is never sent through it again.
 */

export const ONBOARDING_COMPLETE = 'onboardingComplete';
export const ONBOARDING_SKIPPED = 'onboardingSkipped';
export const ONBOARDING_GOALS = 'onboardingGoals';
/** Read by Home: show the three first-Home tips once. */
export const ONBOARDING_TIPS = 'onboarding:tips';

/** Whether this account has been set up already: it has a profile, or finished setup on this phone. */
export function isSetUp(repo: Repository): boolean {
  return !!repo.localGet(ONBOARDING_COMPLETE) || repo.list('profile').length > 0;
}
export function readSkipped(repo: Repository): { about: boolean; goals: boolean } {
  const s = repo.localGet<{ about?: unknown; goals?: unknown }>(ONBOARDING_SKIPPED);
  return { about: s?.about === true, goals: s?.goals === true };
}

/** The first word of the name, trimmed. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

function savePrefs(repo: Repository, values: Record<string, unknown>) {
  let prefs = loadSettingsPrefs(repo);
  for (const [path, value] of Object.entries(values)) prefs = withPref(prefs, path, value);
  repo.localSave(SETTINGS_PREFS_KEY, prefs);
}

/** About you: name, birth date from age, units and height on the profile; today's weight; sex and activity on this phone. */
function saveAbout(repo: Repository, d: FlowDraft, day: string) {
  const current = repo.list('profile').sort(compareRows).at(-1);
  const age = ageOf(d), kg = kgOf(d);
  repo.save('profile', { ...current?.data, name: firstName(d.name) || null, dob: age ? dobFor(age, Number(day.slice(0, 4))) : null, weight_unit: d.unit,
    height_m: d.heightIn ? Math.round(d.heightIn * 0.0254 * 10000) / 10000 : null }, current?.id);
  repo.localSave('profileExtras', { sex: d.sex === 'female' || d.sex === 'male' ? d.sex : '', activity: d.activity || 'light' });
  // A weight filled from Apple Health is a Health reading the connect import already keeps in the Health store; saving it
  // here as a typed weigh-in would put it in the backed-up, synced database. Only a weight typed here is saved.
  if (kg && d.healthKg === null) repo.save('weigh_ins', { day, weight_kg: kg, entered_value: Number(String(d.weight).replace(',', '.')), entered_unit: d.unit, source: 'app' });
  savePrefs(repo, { 'units.weight': d.unit, 'units.height': d.unit === 'kg' ? 'cm' : 'ftin', 'units.distance': d.unit === 'kg' ? 'km' : 'mi' });
}

/** Goals: the goal choices for Home's first tiles, and the daily targets in Food's table (mirrored to Settings' goals). */
function saveGoals(repo: Repository, d: FlowDraft, t: Macros, day: string) {
  repo.localSave(ONBOARDING_GOALS, { train: !!d.goals.train, eat: !!d.goals.eat, sleep: !!d.goals.sleep, routines: !!d.goals.routines } satisfies Record<GoalId, boolean>);
  // Targets sync, so numbers worked out from an Apple Health weight are never saved (as Food's own estimates never use
  // one). Food estimates them again from the first weight typed in. Only targets that are wholly the person's own are
  // saved: changing one number keeps the others the estimate made from the Health weight.
  if (t.est && d.healthKg !== null && !allOwn(t)) {
    repo.localSave('targetBasis', 'estimated');
    repo.localSave('targetPlan', d.plan);
    return;
  }
  const targets: Targets = { energy_kj: t.kcal * 4.184, protein_g: t.p, carbs_g: t.c, fat_g: t.f };
  const row = repo.list('food_targets').find(r => r.data.day === day);
  repo.save('food_targets', { day, ...targets }, row?.id);
  // Estimated only when it is exactly what Food would work out from the saved basics; a plan or an edit makes it the person's own.
  const auto = !d.skipped.about ? estimateTargets(profileInput(d, Number(day.slice(0, 4))), day) : null;
  const same = !!auto && !d.edited && d.plan === 'maintain' && (Object.keys(targets) as (keyof Targets)[]).every(k => Math.abs(targets[k] - auto[k]) < 1e-6);
  repo.localSave('targetBasis', same ? 'estimated' : 'manual');
  repo.localSave('targetPlan', d.plan);
  savePrefs(repo, { 'goals.kcal': t.kcal, 'goals.protein': t.p });
}

/** True when the age typed is under 13: nothing is saved and setup stops. */
export function underThirteen(d: FlowDraft, day = today()): boolean {
  const age = ageOf(d);
  // The birth date kept is 1 January of the birth year, so the age on it is the age typed.
  return age !== null && (ageOn(dobFor(age, Number(day.slice(0, 4))), day) ?? age) < 13;
}

/** Saves the whole setup when they tap Open Insight. */
export function saveOnboarding(repo: Repository, d: FlowDraft, day = today()) {
  if (underThirteen(d, day)) throw new Error('Under 13.');
  repo.atomic(() => {
    if (!d.skipped.about) saveAbout(repo, d, day);
    else {
      // The name may have been given before About you was skipped. A profile row marks the account as set up.
      const current = repo.list('profile').sort(compareRows).at(-1);
      const name = firstName(d.name);
      if (!current || name) repo.save('profile', { ...current?.data, name: name || (current?.data.name ?? null) }, current?.id);
    }
    if (!d.skipped.goals && d.t) saveGoals(repo, d, d.t, day);
    repo.localSave(ONBOARDING_SKIPPED, { about: d.skipped.about, goals: d.skipped.goals });
    repo.localSave(ONBOARDING_COMPLETE, true);
    repo.localSave(ONBOARDING_TIPS, '1');
  });
}

/** Saves what a resumed setup (from Home's nudge) filled in, and what is still skipped. */
export function saveResumed(repo: Repository, d: FlowDraft, was: { about: boolean; goals: boolean }, day = today()) {
  if (underThirteen(d, day)) throw new Error('Under 13.');
  repo.atomic(() => {
    if (was.about && !d.skipped.about) saveAbout(repo, d, day);
    if (was.goals && !d.skipped.goals && d.t) saveGoals(repo, d, d.t, day);
    repo.localSave(ONBOARDING_SKIPPED, { about: was.about && d.skipped.about, goals: was.goals && d.skipped.goals });
  });
}

/** The routine item names, as they are written. */
export type ItemNames = Record<RoutineItemKey, string> & { morning: string; night: string };
/**
 * Adds the suggested Morning and Night routines, each item a check-off (never a dose), on every day, with reminders
 * off. A new account already has empty Morning and Night routines, so those are used rather than doubled; otherwise
 * the store adds new ones. Items go in through the store; the windows are then written in one change through `write`
 * (the Routines document's own storage, which the store reads back at once). Each add waits a moment so the store's
 * time-based ids never repeat.
 */
export async function addSuggestedRoutines(store: RoutinesStore, quiz: FlowDraft['quiz'], names: ItemNames, write: (next: RoutinesState) => void,
  pause = () => new Promise<void>(r => setTimeout(r, 2))) {
  const plan = routinePlan(quiz), windows: Record<string, { from: number; to: number }> = {};
  for (const [name, w, color] of [[names.morning, plan.am, 'warning'], [names.night, plan.pm, 'sleep']] as const) {
    const s = store.read();
    const empty = s.routines.find(r => r.name === name && !s.items.some(i => i.routines.includes(r.id)));
    const id = empty?.id ?? store.addRoutine({ name, from: w.from, to: Math.min(24, w.to), days: [...ALL], color, items: [] }).id;
    windows[id] = { from: w.from, to: Math.min(24, w.to) };
    for (const key of w.items) {
      await pause();
      store.addItem({ name: names[key], type: 'Other', kind: 'check', amt: null, unit: '', routines: [id], time: w.from, hand: '', mixed: '', note: null });
    }
    await pause();
  }
  const s = store.read();
  write({ ...s, routines: s.routines.map(r => windows[r.id] ? { ...r, ...windows[r.id], days: [...ALL], remind: false } : r) });
}
const ALL = [0, 1, 2, 3, 4, 5, 6];
