/*
 * Routines: the model the tab, its tiles and its screens draw from. Pure functions over one state object, so the data
 * layer behind it (store.ts) can change without touching the screens.
 *
 * Times of day are decimal hours (9.5 is 9:30 AM). Days are local calendar days as 'YYYY-MM-DD'. Weekdays are 0 (Sunday)
 * to 6 (Saturday), as Date.getDay() gives them.
 */

export type RoutineColor = 'warning' | 'recovery' | 'sleep' | 'food' | 'training';
export const ROUTINE_COLORS: readonly RoutineColor[] = ['warning', 'sleep', 'recovery', 'food', 'training'];
export type ItemType = 'Supplement' | 'Peptide' | 'Medication' | 'Enhancer' | 'Other';
export const ITEM_TYPES: readonly ItemType[] = ['Supplement', 'Peptide', 'Medication', 'Enhancer', 'Other'];
export type ItemKind = 'dose' | 'check';
/** A check-off on one day: done or skipped. No mark is not done yet (or missed, once the day is over). */
export type Mark = 'd' | 's';

export interface Pause { from: string; until: string; why: string | null }
export interface Routine {
  id: string; name: string;
  /** The window, in decimal hours. */
  from: number; to: number;
  color: RoutineColor;
  /** The weekdays it runs on, 0 Sunday to 6 Saturday. */
  days: number[];
  remind: boolean;
  /** Every pause, oldest first. The routine is paused on a day inside one (from inclusive, until exclusive). */
  pauses: Pause[];
}
/** A routine taken off the tab; its items keep their own tabs. */
export interface HiddenRoutine extends Routine { sub: string }
export interface Item {
  id: string; name: string;
  /** The amount and unit the person typed, for a dose. Never worked out by the app. */
  amt: number | null; unit: string;
  /** What a row shows under the name: "400 mg", "10 min", "Tick when done". */
  dose: string;
  type: ItemType; kind: ItemKind;
  /** The routines it sits in, first one leading. Logging it once covers all of them. */
  routines: string[];
  /** Its time of day. */
  h: number;
  /** The weekdays it is due, or null for every day. */
  days: number[] | null;
  /** On hand: a count (capsules, softgels, grams) or, for a vial, doses left. */
  left?: number;
  /** How much one day uses, for days left. */
  perDay?: number;
  /** Doses a full vial holds. */
  vial?: number;
  /** The word for what is on hand: capsules, softgels, g. */
  sup?: string;
  /** The last injection site. */
  site?: string;
  /** A unit conversion saved from the converter. */
  note?: string | null;
  /** The day it was added; days before it count as not scheduled. */
  created: string;
  mixed?: string;
}
export interface RoutinesState {
  v: 1;
  routines: Routine[];
  hidden: HiddenRoutine[];
  items: Item[];
  /** Check-offs by day, then item id. */
  log: Record<string, Record<string, Mark>>;
  /**
   * What each done mark took off the on-hand count, by day then item id, so taking the tick back puts back exactly that.
   * Saves made before it existed have none; a tick back then puts back one full step, as it always did.
   */
  used?: Record<string, Record<string, number>>;
}
/** The most an on-hand count can be. */
export const MAX_ON_HAND = 99999;

/* ---------- days and times ---------- */

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const dateOf = (day: string) => new Date(`${day}T12:00:00`);
export const addDays = (day: string, n: number) => { const d = dateOf(day); d.setDate(d.getDate() + n); return dayKey(d); };
export const weekdayOf = (day: string) => dateOf(day).getDay();
/** Decimal hours of a moment. */
export const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;
/** "Sun, Nov 22". */
export const shortDate = (day: string) => dateOf(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** "Nov 22". */
export const monthDay = (day: string) => dateOf(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

let clock24 = false;
/** Settings, Units, Clock: times follow it. */
export function setClock24(on: boolean) { clock24 = on; }
export const is24 = () => clock24;

/** A time of day in the person's clock: "9:30 PM" or "21:30". */
export function h12(h: number) {
  const m = Math.round(h * 60), H = Math.floor(m / 60) % 24, M = m % 60;
  if (clock24) return `${pad2(H)}:${pad2(M)}`;
  return `${((H + 11) % 12) + 1}:${pad2(M)} ${H >= 12 ? 'PM' : 'AM'}`;
}
/** A compact axis label: 5a, 2p, or 05, 14. */
export function hax(h: number) {
  if (clock24) return pad2(Math.round(h) % 24);
  return `${((h + 11) % 12) + 1}${h % 24 >= 12 ? 'p' : 'a'}`;
}
const dropRepeat = (a: number, b: number) => h12(a).replace(/ (AM|PM)$/, x => (h12(b).slice(-3) === x ? '' : x));
/** "3:00 to 5:00 PM". */
export const rng = (a: number, b: number) => `${dropRepeat(a, b)} to ${h12(b)}`;
/** A routine's window: "5:00 to 11:00 AM", or "From 9:30 PM" when it runs to bedtime. */
export function win12(r: Pick<Routine, 'from' | 'to'>) { return r.to >= 23 && r.from > 18 ? `From ${h12(r.from)}` : rng(r.from, r.to); }
/** The same, lower case at the start for the middle of a sentence. */
export function win(r: Pick<Routine, 'from' | 'to'>) { const w = win12(r); return w.charAt(0).toLowerCase() + w.slice(1); }
/** "in 5 hr 18 min", or "Due now". */
export function until(h: number, now: number) {
  const m = Math.round((h - now) * 60); if (m <= 0) return 'Due now';
  const H = Math.floor(m / 60), M = m % 60;
  return `in ${H ? `${H} hr${M ? ' ' : ''}` : ''}${M ? `${M} min` : ''}`;
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
/** "Every day", "Weekdays", or "4 days a week". */
export function daysLabel(days: readonly number[]) {
  const set = new Set(days);
  if (set.size === 7) return 'Every day';
  if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Weekdays';
  return `${set.size} ${set.size === 1 ? 'day' : 'days'} a week`;
}
const WL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** An item's days as letters: "M W F", or "Daily". */
export const daysWord = (days: number[] | null) => (days ? days.map(w => WL[w]).join(' ') : 'Daily');
export const weekLetter = (w: number) => WL[w];

/* ---------- reading the state ---------- */

/** The moment the screens read "now" from. Tests replace it. */
export const clock = { now: () => new Date() };
export interface Now { day: string; h: number; wd: number }
export function nowOf(d: Date = clock.now()): Now { return { day: dayKey(d), h: hourOf(d), wd: d.getDay() }; }

export const rById = (s: RoutinesState, id: string | undefined) => s.routines.find(r => r.id === id) ?? null;
export const itemById = (s: RoutinesState, id: string) => s.items.find(i => i.id === id) ?? null;
export function pauseOn(r: Routine, day: string): Pause | null { return r.pauses.find(p => p.from <= day && day < p.until) ?? null; }
/** The pause running today or starting later, if any. */
export function currentPause(r: Routine, today: string): Pause | null { return r.pauses.find(p => today < p.until) ?? null; }
export const isPaused = (r: Routine, day: string) => !!pauseOn(r, day);
const dueOnWd = (i: Item, wd: number) => !i.days || i.days.includes(wd);
/** Whether a routine runs on a weekday. */
const runsOnWd = (r: Routine, wd: number) => r.days.includes(wd);
/** Whether some routine the item sits in runs on a weekday, pauses aside. */
const inRoutineOnWd = (s: RoutinesState, i: Item, wd: number) => i.routines.some(id => { const r = rById(s, id); return !!r && runsOnWd(r, wd); });
/**
 * Whether an item is due on a day: its own weekdays (if set) allow it, and some routine it sits in runs that weekday and
 * is not paused that day.
 */
const dueOn = (s: RoutinesState, i: Item, day: string) => {
  const wd = weekdayOf(day);
  return dueOnWd(i, wd) && i.routines.some(id => { const r = rById(s, id); return !!r && runsOnWd(r, wd) && !isPaused(r, day); });
};
export const markOf = (s: RoutinesState, day: string, id: string): Mark | null => s.log[day]?.[id] ?? null;
export const isDone = (s: RoutinesState, n: Now, i: Item) => markOf(s, n.day, i.id) === 'd';
export const isSkipped = (s: RoutinesState, n: Now, i: Item) => markOf(s, n.day, i.id) === 's';
const byTime = (a: Item, b: Item) => a.h - b.h;

/** Today's items across every running routine, by time. */
export function todayItems(s: RoutinesState, n: Now) {
  return s.items.filter(i => dueOn(s, i, n.day)).sort(byTime);
}
/** A routine's items: due today (the routine runs today and the item's own days allow it), or (all) every one of them. */
export function rItems(s: RoutinesState, rid: string, n: Now, all = false) {
  const r = rById(s, rid), runs = !r || runsOnWd(r, n.wd);
  return s.items.filter(i => i.routines.includes(rid) && (all || (runs && dueOnWd(i, n.wd)))).sort(byTime);
}
/** The next item to do: the first still open from now on, else the first still open today. */
export function nextItem(s: RoutinesState, n: Now) {
  const open = todayItems(s, n).filter(i => !markOf(s, n.day, i.id));
  return open.find(i => i.h >= n.h) ?? open[0] ?? null;
}
export function count(s: RoutinesState, rid: string, n: Now) {
  const t = rItems(s, rid, n);
  return { done: t.filter(i => isDone(s, n, i)).length, n: t.length };
}
export const byType = (s: RoutinesState, type: ItemType) => s.items.filter(i => i.type === type).sort(byTime);
export const routineOf = (s: RoutinesState, i: Item) => rById(s, i.routines[0]);

/* ---------- history ---------- */

/** One day of one item: done, skipped, missed, not scheduled, or later today. */
export type DayState = 'd' | 's' | 'm' | 'o' | 'u';
export const HISTORY_DAYS = 30;

/** An item's last 30 days, oldest first, today last. */
export function hist(s: RoutinesState, i: Item, n: Now): DayState[] {
  const out: DayState[] = [];
  for (let k = 0; k < HISTORY_DAYS; k++) {
    const day = addDays(n.day, k - (HISTORY_DAYS - 1));
    if (day < i.created || !dueOn(s, i, day)) { out.push('o'); continue; }
    const m = markOf(s, day, i.id);
    if (m) { out.push(m); continue; }
    out.push(day === n.day && i.h > n.h ? 'u' : 'm');
  }
  return out;
}
export interface Stats { pct: number; done: number; sched: number; streak: number; days: { s: number; d: number }[] }
/** Done share, counts and the streak of full days for a set of items over the last 30 days. */
export function stats(s: RoutinesState, items: Item[], n: Now): Stats {
  let done = 0, sched = 0;
  const days = Array.from({ length: HISTORY_DAYS }, () => ({ s: 0, d: 0 }));
  items.forEach(i => hist(s, i, n).forEach((x, d) => {
    if (x === 'o' || x === 'u') return;
    days[d].s++; sched++;
    if (x === 'd') { days[d].d++; done++; }
  }));
  let streak = 0;
  for (let k = HISTORY_DAYS - 2; k >= 0; k--) { if (days[k].s && days[k].d < days[k].s) break; streak++; }
  const last = days[HISTORY_DAYS - 1];
  if (last.s && last.d === last.s) streak++;
  return { pct: sched ? Math.round((done / sched) * 100) : 0, done, sched, streak, days };
}
/** The longest run of full days in the window. */
export function bestRun(st: Stats) {
  let best = 0, run = 0;
  st.days.forEach(x => { if (!x.s || x.d >= x.s) { run++; best = Math.max(best, run); } else run = 0; });
  return best;
}

/* ---------- supplies and peptides ---------- */

export interface Supply { i: Item; days: number; hand: string }
export const fmt = (v: number) => v.toLocaleString('en-US');
/** Every item with an on-hand count, fewest days left first. */
export function supplies(s: RoutinesState): Supply[] {
  return s.items.filter(i => i.left != null && (i.perDay || i.vial)).map(i => {
    const perDay = i.vial ? (i.days ? i.days.length / 7 : 1) : (i.perDay ?? 1);
    return { i, days: Math.floor((i.left ?? 0) / perDay), hand: i.vial ? `${i.left} of ${i.vial} doses` : `${fmt(i.left ?? 0)} ${i.sup || i.unit}` };
  }).sort((a, b) => a.days - b.days);
}
/** Days left for a supplement row, or null when nothing is on hand. */
export const daysLeft = (i: Item) => (i.perDay && i.left != null ? Math.floor(i.left / i.perDay) : null);

export interface PeptideNext { i: Item; r: Routine | null; nextDay: number; when: string }
export function peptides(s: RoutinesState, n: Now): PeptideNext[] {
  return byType(s, 'Peptide').map(i => {
    const r = routineOf(s, i), done = isDone(s, n, i);
    // Its own days and its routines' days both count; an item in no routine on the tab goes by its own days alone.
    const placed = i.routines.some(id => rById(s, id));
    const on = (wd: number) => dueOnWd(i, wd) && (!placed || inRoutineOnWd(s, i, wd));
    let nextDay = 0;
    if (!(on(n.wd) && !done)) for (let k = 1; k <= 7; k++) if (on((n.wd + k) % 7)) { nextDay = k; break; }
    const when = `${nextDay === 0 ? 'Today' : nextDay === 1 ? 'Tomorrow' : WD[(n.wd + nextDay) % 7]} ${h12(i.h)}`;
    return { i, r, nextDay, when };
  }).sort((a, b) => a.nextDay - b.nextDay || a.i.h - b.i.h);
}

/* ---------- this week ---------- */

export type CellState = 'f' | 'p' | 'm' | 'o' | 'l' | 'o2';
export interface WeekCell { r: Routine; s: number; d: number; st: CellState }
export interface WeekDay { day: string; wd: number; today: boolean; cells: WeekCell[] }
/** The last seven days, or the seven ahead, routine by routine (the first three). */
export function weekData(s: RoutinesState, n: Now, ahead: boolean): WeekDay[] {
  const rs = s.routines.slice(0, 3), out: WeekDay[] = [];
  const statsOf = new Map(rs.map(r => [r.id, stats(s, rItems(s, r.id, n, true), n)]));
  for (let k = 0; k < 7; k++) {
    const back = ahead ? -(k + 1) : 6 - k, day = addDays(n.day, -back), wd = weekdayOf(day);
    out.push({ day, wd, today: back === 0, cells: rs.map(r => {
      const all = rItems(s, r.id, n, true);
      if (ahead) { const sch = runsOnWd(r, wd) ? all.filter(i => dueOnWd(i, wd)).length : 0; return { r, s: sch, d: 0, st: sch ? 'o2' : 'o' }; }
      const x = statsOf.get(r.id)!.days[HISTORY_DAYS - 1 - back], c = count(s, r.id, n);
      if (back === 0 && c.done < c.n && !x.s) return { r, s: c.n, d: c.done, st: 'l' };
      if (back === 0 && c.done < c.n) return { r, s: c.n, d: c.done, st: c.done ? 'p' : 'l' };
      return { r, s: x.s, d: x.d, st: !x.s ? 'o' : x.d >= x.s ? 'f' : x.d ? 'p' : 'm' };
    }) });
  }
  return out;
}

/* ---------- amounts (Add item and the converter) ---------- */

export const UNITS = ['mcg', 'mg', 'IU', 'mL', 'units'] as const;
const STEPS = [[0.25, 0.5, 1], [1, 5, 10], [10, 50, 100]] as const;
export const stepsFor = (v: number | null) => (v == null || v < 10 ? STEPS[0] : v < 100 ? STEPS[1] : STEPS[2]);
export const smallSteps = (v: number | null) => stepsFor(v) === STEPS[0];
/** An amount as typed: quarters as fractions (2½), thousands with commas. */
export function pretty(v: number | null) {
  if (v == null) return '';
  const q = Math.round(v * 4);
  if (Math.abs(v * 4 - q) < 1e-9 && v < 1000) {
    const w = Math.floor(q / 4), f = ['', '¼', '½', '¾'][q % 4];
    return w ? `${w}${f}` : (f || '0');
  }
  const r = +v.toFixed(3), dec = String(r).split('.')[1]?.length ?? 0;
  return r.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function parseAmt(text: string): number | null {
  const v = String(text).replace(/,/g, '').replace(/¼/g, '.25').replace(/½/g, '.5').replace(/¾/g, '.75').replace(/[^0-9.]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** A nudge step applied, or null once it reaches zero. */
export function nudge(v: number | null, d: number) { const n = Math.round(((v ?? 0) + d) * 1e6) / 1e6; return n <= 0 ? null : n; }

export const CONVERT_UNITS = ['mg', 'mcg', 'IU', 'mL'] as const;
export type ConvertUnit = (typeof CONVERT_UNITS)[number];
export const IU_FOR = {
  d3: { n: 'Vitamin D3', perMcg: 40, line: '1 mcg vitamin D3 = 40 IU' },
  a: { n: 'Vitamin A', perMcg: 10 / 3, line: '1 mcg retinol = 3.33 IU' },
  e: { n: 'Vitamin E', perMcg: 1.49 / 1000, line: '1 mg natural vitamin E = 1.49 IU' },
} as const;
export type Vitamin = keyof typeof IU_FOR;
/** A number with commas and up to six decimals. */
export function fnum(v: number) {
  if (!Number.isFinite(v)) return '';
  const r = Math.round(Math.abs(v) * 1e6) / 1e6, t = r.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  const p = t.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (v < 0 ? '-' : '') + p.join('.');
}
export interface Conversion { ok: boolean; v?: number; rate?: string; detail?: string; lines: string[] }
/** Converts units only: mg, mcg, IU (for a named vitamin) and mL. It never works out a dose. */
export function convert(c: { amt: number | null; from: ConvertUnit | null; to: ConvertUnit | null; vit: Vitamin }): Conversion {
  if (c.amt == null || !c.from || !c.to) return { ok: false, detail: 'Enter an amount and pick both units.', lines: [] };
  const a = c.amt, f = c.from, t = c.to, lines = [`Amount: ${fnum(a)} ${f}`];
  if (f === t) return { ok: true, v: a, rate: `1 ${f} = 1 ${t}`, lines: [...lines, `${fnum(a)} ${f} = ${fnum(a)} ${t}. Same unit.`] };
  if (f === 'mL' || t === 'mL') return { ok: false, detail: 'mL measures volume, so it doesn’t convert to mg, mcg or IU. Pick mL for both, or a weight or IU.', lines: [] };
  if (f !== 'IU' && t !== 'IU') {
    const up = f === 'mcg', v = up ? a / 1000 : a * 1000;
    return { ok: true, v, rate: `1 ${f} = ${up ? '0.001' : '1,000'} ${t}`, lines: [...lines, '1 mg = 1,000 mcg', `${fnum(a)} ${f}${up ? ' ÷ 1,000 = ' : ' × 1,000 = '}${fnum(v)} ${t}`] };
  }
  const k = IU_FOR[c.vit];
  if (f === 'IU') {
    const m = a / k.perMcg, res = t === 'mcg' ? m : m / 1000;
    return { ok: true, v: res, rate: `1 IU = ${fnum(t === 'mcg' ? 1 / k.perMcg : 1 / k.perMcg / 1000)} ${t}`,
      lines: [...lines, k.line, `${fnum(a)} IU ÷ ${fnum(t === 'mcg' ? k.perMcg : k.perMcg * 1000)} = ${fnum(res)} ${t}`] };
  }
  const mcg = f === 'mcg' ? a : a * 1000, res = mcg * k.perMcg, per = f === 'mcg' ? k.perMcg : k.perMcg * 1000;
  return { ok: true, v: res, rate: `1 ${f} = ${fnum(per)} IU`, lines: [...lines, k.line, `${fnum(a)} ${f} × ${fnum(per)} = ${fnum(res)} IU`] };
}
/** Whether the converter asks what the IU is for. */
export const needsVitamin = (from: ConvertUnit, to: ConvertUnit) => (from === 'IU') !== (to === 'IU') && from !== 'mL' && to !== 'mL';

/* ---------- the starting state and the demo ---------- */

const R = (id: string, name: string, from: number, to: number, color: RoutineColor): Routine =>
  ({ id, name, from, to, color, days: [...ALL_DAYS], remind: true, pauses: [] });
/** A new person starts with three empty routines. */
export function emptyState(): RoutinesState {
  return { v: 1, routines: [R('morning', 'Morning', 5, 11, 'warning'), R('midday', 'Midday', 12, 14, 'recovery'), R('night', 'Night', 21.5, 23, 'sleep')], hidden: [], items: [], log: {} };
}

/** A sample set for Look around first: eleven items over three routines, a month of history, and today ticked up to now. */
export function demoState(n: Now = nowOf()): RoutinesState {
  const s = emptyState(), since = addDays(n.day, -90);
  const it = (id: string, name: string, amt: number | null, unit: string, dose: string, type: ItemType, kind: ItemKind, rt: string, h: number, extra: Partial<Item> = {}): Item =>
    ({ id, name, amt, unit, dose, type, kind, routines: [rt], h, days: null, created: since, ...extra });
  s.hidden = [{ ...R('stack', 'Supplement & enhancer stack', 15, 16, 'food'), sub: 'Its 3 items now live on their tabs' }];
  s.items = [
    it('vd3', 'Vitamin D3', 2000, 'IU', '2,000 IU', 'Supplement', 'dose', 'morning', 7 + 10 / 60, { left: 48, perDay: 1, sup: 'softgels' }),
    it('k2', 'Vitamin K2', 100, 'mcg', '100 mcg', 'Supplement', 'dose', 'morning', 7 + 10 / 60, { left: 52, perDay: 1, sup: 'capsules' }),
    it('pepa', 'Peptide A', 250, 'mcg', '250 mcg', 'Peptide', 'dose', 'morning', 7.75, { vial: 20, left: 13, site: 'L abdomen' }),
    it('crea', 'Creatine', 5, 'g', '5 g', 'Supplement', 'dose', 'morning', 8, { left: 310, perDay: 5, sup: 'g' }),
    it('str', 'Stretch', null, '', '10 min', 'Other', 'check', 'morning', 9),
    it('fish', 'Fish oil', 1000, 'mg', '1,000 mg', 'Supplement', 'dose', 'midday', 12.5, { left: 64, perDay: 2, sup: 'softgels' }),
    it('walk', 'Walk', null, '', '15 min', 'Other', 'check', 'midday', 13),
    it('mag', 'Magnesium glycinate', 400, 'mg', '400 mg', 'Supplement', 'dose', 'night', 21.5, { left: 9, perDay: 1, sup: 'capsules' }),
    it('gly', 'Glycine', 3, 'g', '3 g', 'Supplement', 'dose', 'night', 21.75, { left: 180, perDay: 3, sup: 'g' }),
    it('read', 'Read', null, '', '20 min', 'Other', 'check', 'night', 22),
    it('pepb', 'Peptide B', 100, 'mcg', '100 mcg', 'Peptide', 'dose', 'night', 22, { days: [1, 3, 5], vial: 10, left: 6, site: 'R thigh' }),
    it('scr', 'Screens off', null, '', 'All screens', 'Other', 'check', 'night', 22.5),
  ];
  // The last few days of each routine were kept in full; before that a steady, slightly uneven record.
  const P: Record<string, number> = { morning: 0.94, midday: 0.88, night: 0.84 }, KEPT: Record<string, number> = { morning: 11, midday: 8, night: 6 };
  const rnd = (a: number, b: number) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
  s.items.forEach((i, ix) => {
    const rk = i.routines[0], kept = KEPT[rk] ?? 0, first = rItems(s, rk, n)[0];
    for (let d = 0; d < HISTORY_DAYS - 1; d++) {
      const day = addDays(n.day, d - (HISTORY_DAYS - 1));
      if (i.days && !i.days.includes(weekdayOf(day))) continue;
      let m: Mark | null;
      if (d >= HISTORY_DAYS - 1 - kept) m = 'd';
      else if (d === HISTORY_DAYS - 2 - kept && i === first) m = null;
      else { const p = P[rk] ?? 0.85, v = rnd(ix + 3, d + 1); m = v < p ? 'd' : v < p + 0.05 ? 's' : null; }
      if (m) (s.log[day] ??= {})[i.id] = m;
    }
    if (dueOnWd(i, n.wd) && i.h < n.h) (s.log[n.day] ??= {})[i.id] = 'd';
  });
  return s;
}

/** Reads a stored state, mending anything missing so a bad write never breaks the tab. */
export function normalize(raw: unknown): RoutinesState | null {
  const s = raw as Partial<RoutinesState> | null | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.routines) || !Array.isArray(s.items)) return null;
  const fixR = (r: Routine): Routine => ({ ...r, days: Array.isArray(r.days) && r.days.length ? r.days : [...ALL_DAYS], pauses: Array.isArray(r.pauses) ? r.pauses : [], remind: r.remind !== false });
  return {
    v: 1, routines: s.routines.filter(r => r && r.id && r.name).map(fixR),
    hidden: Array.isArray(s.hidden) ? s.hidden.filter(r => r && r.id).map(r => ({ ...fixR(r), sub: r.sub ?? '' })) : [],
    items: s.items.filter(i => i && i.id && i.name && Array.isArray(i.routines)),
    log: s.log && typeof s.log === 'object' ? s.log : {},
    ...(s.used && typeof s.used === 'object' ? { used: s.used } : {}),
  };
}
