/* Which reminders go on the phone's schedule, worked out from the Settings choices and what they depend on (the
 * training plan, routines, meals logged today, the rest timer): no React, no notifications module, so tests, the
 * Settings page and the app-wide sync share one answer. */
import type { SettingsPrefs } from '@/features/settings/prefs-model';
import type { Repository } from '@/data/repository';
import { PlanStore } from '@/features/plans/store';
import { plannedWeek } from '@/features/plans/schedule';
import { t } from '@/i18n/en';
import { currentPause, dayKey, markOf, nowOf, rItems, type RoutinesState } from '@/features/routines/model';

/**
 * One reminder on the phone's schedule. Without `at` it repeats every week on `weekday` (Monday 0 to Sunday 6) at
 * `hour`:`minute`, on the phone's clock. With `at` (a moment in milliseconds) it comes once, then; `weekday`, `hour` and
 * `minute` still say when that is on the phone's clock.
 */
export interface PlannedReminder { id: string; weekday: number; hour: number; minute: number; at?: number; title: string; body: string }

/** The reminders a switch in Settings can turn on. "At most 2 a day" is a limit, not one of them. */
export const REMINDER_SWITCHES = ['workout', 'rest', 'weekly', 'food', 'oura', 'breakfast', 'lunch', 'dinner'] as const;
export type ReminderSwitch = (typeof REMINDER_SWITCHES)[number];
export const isReminderSwitch = (key: string): key is ReminderSwitch => (REMINDER_SWITCHES as readonly string[]).includes(key);
/**
 * Whether the Reconnect Oura alert can work yet. It needs to notice that Oura stopped sending new days, which only the
 * server can see while the app is closed (the phone keeps no reliable "last Oura day" of its own), so for now the switch
 * is shown as coming later and never counts as on.
 */
export const OURA_ALERT_AVAILABLE = false;
/** The reminders the "{n} are on" counts read: one each, the meals counting under Food. */
export const COUNTED_REMINDERS = (['workout', 'rest', 'weekly', 'food', 'oura'] as const).filter(key => key !== 'oura' || OURA_ALERT_AVAILABLE);
/** How many reminders are on, as Settings shows it. */
export const remindersOn = (rem: SettingsPrefs['rem']) => COUNTED_REMINDERS.filter(key => rem[key]).length;

/** The meals Food reminders nudge about, and when (fixed times, as Settings shows them). */
export const MEAL_REMINDERS = [
  { key: 'breakfast', hour: 9, minute: 30 }, { key: 'lunch', hour: 13, minute: 30 }, { key: 'dinner', hour: 20, minute: 0 },
] as const;
export type MealKey = (typeof MEAL_REMINDERS)[number]['key'];
/** "At most 2 a day". */
export const DAILY_CAP = 2;
/** iOS keeps at most 64 of an app's scheduled notifications. */
export const MAX_SCHEDULED = 64;

/** '5:30 PM' as hour and minute on a 24-hour clock; a time that does not read keeps 5:30 PM. */
export function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(time.trim());
  if (!m) return { hour: 17, minute: 30 };
  const h = Number(m[1]) % 12, minute = Number(m[2]);
  return { hour: m[3].toUpperCase() === 'PM' ? h + 12 : h, minute };
}

/** What else the plan reads besides the switches. Each part is optional; without it, its reminders have nothing to go on. */
export interface ReminderContext {
  /** The moment the plan is made for (milliseconds). Today, and what is still ahead today, are read from it. */
  now?: number;
  /** The routines, for the ones whose Remind me is on. */
  routines?: RoutinesState | null;
  /** The meals already logged today (the phone's calendar day). */
  mealsLogged?: readonly MealKey[];
  /** The running rest timer, if any. */
  timer?: { endAt: number; ended?: boolean } | null;
}

/** A reminder that comes on some weekdays at one time. `conditional` ones are only needed while something is open:
 * `neededToday` says whether it still is today. */
interface Slot { id: string; days: number[]; hour: number; minute: number; title: string; body: string; conditional?: boolean; neededToday?: boolean }

/** A string with its `{name}` slots filled. */
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
/** A decimal hour (9.5) as hour and minute, kept inside the day. */
const hm = (h: number) => { const m = Math.min(24 * 60 - 1, Math.max(0, Math.round(h * 60))); return { hour: Math.floor(m / 60), minute: m % 60 }; };
const validDays = (days: readonly number[]) => [...new Set(days)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
/** A Sunday-0 weekday (Date.getDay, routines) as Monday 0. */
const monday0 = (sunday0: number) => (sunday0 + 6) % 7;

/** The routine reminders: at the start of each running routine's window on its days, then once more later in the window
 * while something in it is still open today. Paused routines and days with nothing due are left out. */
function routineSlots(s: RoutinesState, nowDate: Date): { starts: Slot[]; lefts: Slot[] } {
  const today = dayKey(nowDate), n = nowOf(nowDate), starts: Slot[] = [], lefts: Slot[] = [];
  for (const r of s.routines) {
    if (!r.remind || currentPause(r, today)) continue;
    // Only the weekdays where some item of the routine is due (rItems reads only the weekday from `Now`).
    const days = validDays(r.days.filter(wd => rItems(s, r.id, { day: today, h: 0, wd }).length).map(monday0));
    if (!days.length) continue;
    const left = rItems(s, r.id, n).some(i => !markOf(s, today, i.id));
    // The second nudge: an hour before the window closes, and at least half an hour after it opens.
    starts.push({ id: `routine-${r.id}`, days, ...hm(r.from), title: fill(t('reminderRoutineTitle'), { name: r.name }), body: fill(t('reminderRoutineBody'), { name: r.name }) });
    lefts.push({ id: `routine-${r.id}-left`, days, ...hm(Math.max(r.from + 0.5, r.to - 1)), conditional: true, neededToday: left,
      title: fill(t('reminderRoutineLeftTitle'), { name: r.name }), body: fill(t('reminderRoutineLeftBody'), { name: r.name }) });
  }
  return { starts, lefts };
}

/**
 * The reminders that are on, in the order that matters most first: the workout reminder (only on planned training
 * days, `workoutDays`, Monday 0, at the chosen time), each routine whose Remind me is on (at its window's start, then
 * once if something is left), the weekly report (Mondays at 8:00 AM), then the food reminders (each meal that is on, at
 * its time, only while that meal is not logged). With "At most 2 a day" on, each day keeps the first two that fall on it.
 * The rest timer alert comes once, when the running rest ends, and is never held back by the limit, since it answers a
 * rest just started. The Reconnect Oura alert is not available yet (OURA_ALERT_AVAILABLE).
 *
 * The phone cannot check later whether something is still open, so a reminder that is only needed while something is
 * open repeats every week as usual, except on today's weekday once nothing is open today: then it waits for the same
 * day next week. Insight plans again whenever something changes and each time it opens.
 */
export function planReminders(rem: SettingsPrefs['rem'], workoutDays: readonly number[] = [], ctx: ReminderContext = {}): PlannedReminder[] {
  const now = ctx.now ?? Date.now(), nowDate = new Date(now), todayWd = monday0(nowDate.getDay());
  const slots: Slot[] = [];
  if (rem.workout) {
    const days = validDays(workoutDays);
    if (days.length) slots.push({ id: 'workout', days, ...parseTime(rem.workoutTime), title: t('reminderWorkoutTitle'), body: t('reminderWorkoutBody') });
  }
  if (ctx.routines) { const { starts, lefts } = routineSlots(ctx.routines, nowDate); slots.push(...starts, ...lefts); }
  if (rem.weekly) slots.push({ id: 'weekly', days: [0], hour: 8, minute: 0, title: t('reminderWeeklyTitle'), body: t('reminderWeeklyBody') });
  if (rem.food) {
    for (const m of MEAL_REMINDERS) {
      if (!rem[m.key]) continue;
      const meal = t(m.key === 'breakfast' ? 'reminderMealBreakfast' : m.key === 'lunch' ? 'reminderMealLunch' : 'reminderMealDinner');
      slots.push({ id: `food-${m.key}`, days: [0, 1, 2, 3, 4, 5, 6], hour: m.hour, minute: m.minute, conditional: true,
        neededToday: !(ctx.mealsLogged ?? []).includes(m.key), title: fill(t('reminderMealTitle'), { meal }), body: t('reminderMealBody') });
    }
  }

  const atToday = (sl: Slot, weeks = 0) => new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 7 * weeks, sl.hour, sl.minute).getTime();
  /** Whether a slot still counts today: it is not one that waits on something open, it is still needed, or its time has
   * passed (it may already have come, so it keeps its place under the limit). */
  const countsToday = (sl: Slot) => !sl.conditional || !!sl.neededToday || atToday(sl) <= now;
  /** The slots that come on a weekday: the first two under the limit. */
  const pick = (wd: number, from: Slot[]) => { const on = from.filter(sl => sl.days.includes(wd)); return new Set(rem.cap ? on.slice(0, DAILY_CAP) : on); };
  const today = pick(todayWd, slots.filter(countsToday)), nextWeek = pick(todayWd, slots);
  const other = new Map<number, Set<Slot>>();
  for (let wd = 0; wd < 7; wd++) if (wd !== todayWd) other.set(wd, pick(wd, slots));

  const out: PlannedReminder[] = [];
  for (const sl of slots) {
    for (const wd of sl.days) {
      const base = { id: sl.id === 'weekly' ? 'weekly' : `${sl.id}-${wd}`, weekday: wd, hour: sl.hour, minute: sl.minute, title: sl.title, body: sl.body };
      if (wd !== todayWd) { if (other.get(wd)!.has(sl)) out.push(base); continue; }
      const inToday = today.has(sl), inNext = nextWeek.has(sl), todayAt = atToday(sl);
      // Every week, today included; once today only; or not today, from the same day next week.
      if (inToday && inNext) out.push(base);
      else if (inToday && todayAt > now) out.push({ ...base, at: todayAt });
      else if (!inToday && inNext) out.push({ ...base, at: atToday(sl, 1) });
    }
  }
  if (rem.rest && ctx.timer && !ctx.timer.ended && Number.isFinite(ctx.timer.endAt) && ctx.timer.endAt > now) {
    const end = new Date(ctx.timer.endAt);
    out.splice(MAX_SCHEDULED - 1);
    out.push({ id: 'rest', at: ctx.timer.endAt, weekday: monday0(end.getDay()), hour: end.getHours(), minute: end.getMinutes(), title: t('reminderRestTitle'), body: t('reminderRestBody') });
  }
  return out.slice(0, MAX_SCHEDULED);
}

/** The weekdays (Monday 0) the training plan puts a workout on; none without a plan, or if the plan cannot be read. */
export function plannedWorkoutDays(repo: Repository | null | undefined): number[] {
  if (!repo) return [];
  try {
    // Any Monday will do: the weekdays a plan uses do not depend on the week (only which workout lands on them does).
    return plannedWeek('2024-01-01', new PlanStore(repo).read()).map(d => (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7);
  } catch { return []; }
}
