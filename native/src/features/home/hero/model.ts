import { t } from '@/i18n/en';
import { clamp, type Triple } from './field';

/**
 * What the Home hero shows, as plain values: the day score, the three pillars with their real amounts and goals, and the week.
 * Pure: everything comes in through `HeroInput`, so it can be checked without a phone.
 *
 * Each pillar's value is its progress toward today's goal, 0 to 1.05 (Training minutes, Food energy, Sleep). A day with
 * training at zero while food or sleep was logged is a rest day: Training reads Rest and the score leaves it out.
 */
export type PillarKey = 'training' | 'food' | 'sleep';
export const PILLARS: readonly PillarKey[] = ['training', 'food', 'sleep'];
/** One logged day. A null is no reading (no sleep recorded), never drawn as zero. */
export interface HeroDayIn { trainMin: number | null; kcal: number | null; sleepMin: number | null }
export interface HeroGoals { kcal: number; trainMin: number; sleepMin: number }
export interface HeroInput {
  now: Date;
  /** The last 7 days, oldest first; the last one is today. */
  days: readonly HeroDayIn[];
  goals: HeroGoals;
  energy: 'kcal' | 'kJ';
  /** Hide numbers: energy shows as dots. */
  hide: boolean;
}
/** A value line in parts: text, 'v' for a number or 'u' for a unit, and the gap before it in points. */
export type Part = readonly [text: string, kind: 'v' | 'u', dx: number];
export interface HeroPillar {
  key: PillarKey; label: string; value: number; met: boolean; rest: boolean; missing: boolean;
  /** The value on the arc, its goal under the end cap, the full readout and its status line. */
  arc: Part[]; goal: string; cap: string; status: string; spoken: string;
}
export interface HeroWeekDay {
  i: number; short: string; long: string; today: boolean; values: Triple; pct: number; rest: boolean; empty: boolean; met: [boolean, boolean, boolean]; label: string;
}
export interface HeroView {
  dateLine: string; greeting: string; caption: string; today: boolean; sel: number; rest: boolean; allMet: boolean; empty: boolean;
  pct: number; values: Triple; pillars: [HeroPillar, HeroPillar, HeroPillar];
  /** The empty state's two lines, when nothing was logged. */
  emptyTitle: string; emptyLine: string;
  label: string; week: HeroWeekDay[]; weekNote: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LABEL: Record<PillarKey, () => string> = { training: () => t('homeHeroTraining'), food: () => t('homeHeroFood'), sleep: () => t('homeHeroSleep') };

export const greeting = (hour: number) => t(hour >= 5 && hour < 12 ? 'goodMorning' : hour >= 12 && hour < 18 ? 'goodAfternoon' : 'goodEvening');
export const dateLine = (d: Date) => t('homeDateLine').replace('{weekday}', WEEKDAYS[d.getDay()]).replace('{month}', MONTHS[d.getMonth()]).replace('{day}', String(d.getDate()));

const fin = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const commas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** Energy is kept in kcal and only shown in kJ (x 4.184, to the nearest 10). */
export const energyValue = (kcal: number, unit: 'kcal' | 'kJ') => unit === 'kJ' ? Math.round(kcal * 4.184 / 10) * 10 : Math.round(kcal);
const enN = (kcal: number, unit: 'kcal' | 'kJ') => commas(energyValue(kcal, unit));
/** "8h" or "6h 53m". */
export const hoursText = (m: number) => { const h = Math.floor(m / 60), mm = Math.round(m % 60); return mm ? `${h}h ${mm < 10 ? '0' : ''}${mm}m` : `${h}h`; };
export function hoursParts(m: number): Part[] {
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return mm ? [[String(h), 'v', 0], ['h', 'u', 0.5], [(mm < 10 ? '0' : '') + mm, 'v', 3], ['m', 'u', 0.5]] : [[String(h), 'v', 0], ['h', 'u', 0.5]];
}

/** A day's three values against the goals, 0 to 1.05 each. */
export function dayValues(d: HeroDayIn | undefined, g: HeroGoals): Triple {
  const v = (n: number | null | undefined, goal: number) => fin(n) && goal > 0 ? clamp(n / goal, 0, 1.05) : 0;
  return [v(d?.trainMin, g.trainMin), v(d?.kcal, g.kcal), v(d?.sleepMin, g.sleepMin)];
}
export const isRest = (v: Triple) => v[0] === 0 && (v[1] > 0 || v[2] > 0);
/** The day score: the mean of the pillars' progress, capped at each goal; a rest day leaves Training out. */
export function dayScore(v: Triple) {
  const list = isRest(v) ? v.slice(1) : v.slice();
  return Math.round(list.reduce((s, x) => s + Math.min(1, x), 0) / list.length * 100);
}
const pc = (v: number) => `${Math.round(Math.min(1, v) * 100)}%`;
const fill = (s: string, map: Record<string, string | number>) => Object.entries(map).reduce((o, [k, v]) => o.split(`{${k}}`).join(String(v)), s);

function pillarsFor(day: HeroDayIn | undefined, v: Triple, input: HeroInput): [HeroPillar, HeroPillar, HeroPillar] {
  const g = input.goals, eu = input.energy, hid = input.hide, rest = isRest(v);
  const tMin = fin(day?.trainMin) ? Math.round(day.trainMin) : 0, kc = fin(day?.kcal) ? Math.round(day.kcal) : 0;
  const sleepMissing = !fin(day?.sleepMin), sMin = sleepMissing ? 0 : Math.round(day!.sleepMin!);
  const made = (key: PillarKey, i: number, p: Omit<HeroPillar, 'key' | 'label' | 'value' | 'met' | 'spoken'> & { said: string }): HeroPillar => {
    const met = v[i] >= 1, label = LABEL[key]();
    const tail = met ? `, ${t('homeHeroGoalMetSpoken')}` : (i === 0 && rest) ? '' : `, ${pc(v[i])}`;
    const { said, ...rest2 } = p;
    return { key, label, value: v[i], met, ...rest2, spoken: `${label}, ${said}${tail}. ${t('homeHeroShowDetails')}` };
  };
  const training = rest
    ? made('training', 0, { rest: true, missing: false, arc: [[t('homeHeroRest'), 'v', 0]], goal: '', cap: String(g.trainMin), status: t('homeHeroRecovery'), said: t('homeHeroRestSpoken') })
    : made('training', 0, {
      rest: false, missing: false, arc: [[String(tMin), 'v', 0], ['min', 'u', 2.5]], goal: `${g.trainMin} min`, cap: String(g.trainMin),
      status: tMin <= 0 ? t('homeHeroNothing') : v[0] >= 1 ? t('homeHeroSessionDone') : fill(t('homeHeroMinLeft'), { n: Math.max(0, g.trainMin - tMin), pct: pc(v[0]) }),
      said: fill(t('homeHeroMinutes'), { n: tMin, goal: g.trainMin }),
    });
  const food = made('food', 1, {
    rest: false, missing: false, arc: [[hid ? '•••' : enN(kc, eu), 'v', 0], [eu, 'u', 2.5]], goal: `${enN(g.kcal, eu)} ${eu}`, cap: enN(g.kcal, eu),
    status: hid ? t('homeHeroHidden') : kc <= 0 ? t('homeHeroNothing') : kc >= g.kcal ? t('homeHeroGoalMet') : fill(t('homeHeroEnergyLeft'), { n: enN(g.kcal - kc, eu), u: eu, pct: pc(v[1]) }),
    said: hid ? fill(t('homeHeroHiddenSpoken'), { goal: enN(g.kcal, eu), u: eu }) : fill(t('homeHeroEnergySpoken'), { n: enN(kc, eu), goal: enN(g.kcal, eu), u: eu }),
  });
  // No sleep reading is said as such, never drawn as 0h.
  const sleep = made('sleep', 2, {
    rest: false, missing: sleepMissing, arc: sleepMissing ? [[t('homeHeroNoData'), 'v', 0]] : hoursParts(sMin), goal: hoursText(g.sleepMin), cap: hoursText(g.sleepMin),
    status: sMin <= 0 ? t('homeHeroNoSleep') : sMin >= g.sleepMin ? t('homeHeroGoalMet') : fill(t('homeHeroSleepBelow'), { n: hoursText(g.sleepMin - sMin), pct: pc(v[2]) }),
    said: sleepMissing ? t('homeHeroNoSleep') : fill(t('homeHeroSleepSpoken'), { n: hoursText(sMin), goal: hoursText(g.sleepMin) }),
  });
  return [training, food, sleep];
}

function describe(date: string, v: Triple) {
  if (!v.some(x => x > 0)) return `${date}. ${t('homeHeroNothing')}.`;
  return `${date}. ${PILLARS.map((k, i) => `${LABEL[k]()} ${pc(v[i])}${v[i] >= 1 ? `, ${t('homeHeroGoalMetSpoken')}` : ''}`).join(', ')}.`;
}

/** Everything the hero shows for the selected day (0 oldest .. 6 today). */
export function heroView(input: HeroInput, sel = 6): HeroView {
  const n = input.days.length, today = sel === n - 1, now = input.now;
  const dateOf = (i: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
  const long = (i: number) => WEEKDAYS[dateOf(i).getDay()];
  const v = dayValues(input.days[sel], input.goals), rest = isRest(v), empty = !v.some(x => x > 0);
  const pillars = pillarsFor(input.days[sel], v, input);
  const allMet = !empty && pillars.every((p, i) => p.met || (i === 0 && rest));
  const pct = dayScore(v);
  const caption = (today ? t('homeHeroToday') : long(sel)) + (rest ? ` · ${t('homeHeroRestDay')}` : '') + (allMet ? ` · ${t('homeHeroAllMet')}` : '');
  const name = today ? t('homeHeroToday') : long(sel);
  const label = `${describe(name, v)} ${t('homeHeroDayScore').replace('{n}', String(pct))} ${pillars.map((p, i) => `${p.label} ${i === 0 && rest ? t('homeHeroRestSpoken') : p.spoken.split(', ')[1].replace(/\. .*$/, '')}`).join(', ')}.`;
  const week = input.days.map((d, i): HeroWeekDay => {
    const wv = dayValues(d, input.goals), isToday = i === n - 1, lg = long(i);
    return {
      i, short: isToday ? t('homeHeroToday') : lg.slice(0, 3), long: lg, today: isToday, values: wv, pct: dayScore(wv), rest: isRest(wv),
      empty: !wv.some(x => x > 0), met: [wv[0] >= 1, wv[1] >= 1, wv[2] >= 1],
      label: `${lg}${isToday ? t('homeHeroTodaySuffix') : ''}. ${PILLARS.map((k, j) => `${LABEL[k]()} ${pc(wv[j])}`).join(', ')}.`,
    };
  });
  return {
    dateLine: dateLine(now), greeting: greeting(now.getHours()), caption, today, sel, rest, allMet, empty, pct, values: v, pillars,
    emptyTitle: today ? t('homeHeroClearSky') : t('homeHeroQuietDay'), emptyLine: t('homeHeroNothing'),
    label, week, weekNote: today ? t('homeHeroWeekNote') : t('homeHeroWeekShowing').replace('{day}', long(sel)),
  };
}
