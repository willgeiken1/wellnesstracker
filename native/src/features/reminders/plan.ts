/* Which reminders go on the phone's schedule, worked out from the Settings choices alone: no React, no notifications
 * module, so tests and the Settings page share one answer. */
import type { SettingsPrefs } from '@/features/settings/prefs-model';
import type { Repository } from '@/data/repository';
import { PlanStore } from '@/features/plans/store';
import { plannedWeek } from '@/features/plans/schedule';
import { t } from '@/i18n/en';

/** One repeating reminder: every week on `weekday` (Monday 0 to Sunday 6) at `hour`:`minute`, on the phone's clock. */
export interface PlannedReminder { id: string; weekday: number; hour: number; minute: number; title: string; body: string }

/** The reminders a switch in Settings can turn on. "At most 2 a day" is a limit, not one of them. */
export const REMINDER_SWITCHES = ['workout', 'rest', 'weekly', 'food', 'oura', 'breakfast', 'lunch', 'dinner'] as const;
export type ReminderSwitch = (typeof REMINDER_SWITCHES)[number];
export const isReminderSwitch = (key: string): key is ReminderSwitch => (REMINDER_SWITCHES as readonly string[]).includes(key);

/** '5:30 PM' as hour and minute on a 24-hour clock; a time that does not read keeps 5:30 PM. */
export function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(time.trim());
  if (!m) return { hour: 17, minute: 30 };
  const h = Number(m[1]) % 12, minute = Number(m[2]);
  return { hour: m[3].toUpperCase() === 'PM' ? h + 12 : h, minute };
}

/**
 * The time-based reminders that are on. The workout reminder only goes on the planned training days (`workoutDays`,
 * Monday 0), at the chosen time; with no planned day it has nothing to remind about. The weekly report comes on
 * Mondays at 8:00 AM. The rest timer, food and Oura reminders depend on what happens (a rest ending, a meal not logged,
 * Oura going quiet), so they are never put on a fixed schedule here.
 */
export function planReminders(rem: SettingsPrefs['rem'], workoutDays: readonly number[] = []): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  if (rem.workout) {
    const { hour, minute } = parseTime(rem.workoutTime);
    for (const day of [...new Set(workoutDays)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort()) {
      out.push({ id: `workout-${day}`, weekday: day, hour, minute, title: t('reminderWorkoutTitle'), body: t('reminderWorkoutBody') });
    }
  }
  if (rem.weekly) out.push({ id: 'weekly', weekday: 0, hour: 8, minute: 0, title: t('reminderWeeklyTitle'), body: t('reminderWeeklyBody') });
  return out;
}

/** The weekdays (Monday 0) the training plan puts a workout on; none without a plan, or if the plan cannot be read. */
export function plannedWorkoutDays(repo: Repository | null | undefined): number[] {
  if (!repo) return [];
  try {
    // Any Monday will do: the weekdays a plan uses do not depend on the week (only which workout lands on them does).
    return plannedWeek('2024-01-01', new PlanStore(repo).read()).map(d => (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7);
  } catch { return []; }
}
