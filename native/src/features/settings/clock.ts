import type { SettingsPrefs } from './prefs-model';

/** Settings, Units, Time: 12 or 24 hour. */
export type ClockUnit = SettingsPrefs['units']['clock'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** An hour and minute in the person's clock: "6:21 AM" or "06:21". Hours past 24 wrap. */
export function clockHM(h: number, m: number, c: ClockUnit): string {
  const H = ((Math.floor(h) % 24) + 24) % 24;
  return c === '24' ? `${pad2(H)}:${pad2(m)}` : `${H % 12 || 12}:${pad2(m)} ${H < 12 ? 'AM' : 'PM'}`;
}

/** Decimal hours in the person's clock, rounded to the minute: 18.5 is "6:30 PM" or "18:30". */
export function clockH(hours: number, c: ClockUnit): string {
  const t = Math.round(hours * 60);
  return clockHM(Math.floor(t / 60), ((t % 60) + 60) % 60, c);
}

/** A moment in the person's clock. */
export function clockMs(ms: number, c: ClockUnit): string {
  const d = new Date(ms);
  return clockHM(d.getHours(), d.getMinutes(), c);
}

/** A whole hour as an axis mark: "6 AM", "Noon" and "Midnight" on a 12-hour clock, "06:00" on a 24-hour one. */
export function hourMark(h: number, c: ClockUnit): string {
  const H = ((Math.round(h) % 24) + 24) % 24;
  if (c === '24') return `${pad2(H)}:00`;
  return H === 12 ? 'Noon' : H === 0 ? 'Midnight' : `${H % 12} ${H < 12 ? 'AM' : 'PM'}`;
}
