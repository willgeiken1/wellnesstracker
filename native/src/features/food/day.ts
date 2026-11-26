import type { IconName } from '@/components/kit';
import type { Repository } from '../../data/repository';
import type { Row } from '../../data/rows';
import { attributedDay, foodTargets, meals as mealList, shiftDay, type Food } from './model';

/** Energy is stored in kilojoules; the Food tab shows kilocalories. */
export const KJ = 4.184;
export const kcalOf = (kj: unknown) => typeof kj === 'number' && Number.isFinite(kj) ? kj / KJ : null;
const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const add = (a: number, b: number | null) => a + (b ?? 0);

/** A whole number with thousands commas: 1,364. */
export const num = (v: number) => Math.round(v).toLocaleString('en-US');
/** Grams to one place only when under ten: 7.5 g, 92 g. */
export const grams = (v: number) => v < 10 && Math.round(v * 10) % 10 ? (Math.round(v * 10) / 10).toFixed(1) : num(v);
/** A clock time in the person's locale, 12 hour: 7:40 AM. */
export const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const plural = (count: number, one: string, many: string) => `${num(count)} ${count === 1 ? one : many}`;

const ICONS: Record<string, IconName> = {
  'fd000000-0000-4000-8000-000000000000': 'fd-sunrise', 'fd000000-0000-4000-8000-000000000001': 'sun',
  'fd000000-0000-4000-8000-000000000003': 'pillar-food', 'fd000000-0000-4000-8000-000000000002': 'moon',
};
/** Breakfast is a sunrise, lunch the sun, a snack an apple, dinner the moon; a meal the person added is a plate. */
export const mealIcon = (id: string): IconName => ICONS[id] ?? 'meal';

export interface FoodItem {
  id: string; name: string; kcal: number | null; p: number | null; c: number | null; f: number | null; fib: number | null;
  sugar: number | null; sodium: number | null; grams: number | null; at: number; data: Food;
}
export interface MealView {
  id: string; name: string; icon: IconName; time: number | null;
  kcal: number; p: number; c: number; f: number; fib: number; items: FoodItem[]; empty: boolean;
}
export interface Goals { kcal: number; p: number; c: number; f: number; fib: number; set: boolean }
export interface DayView {
  day: string; today: boolean; eaten: number; goal: number; left: number; burned: number | null;
  p: number; c: number; f: number; fib: number; goals: Goals; meals: MealView[]; logged: number; items: FoodItem[];
}

export function item(row: Row): FoodItem {
  const d = row.data;
  return { id: row.id, name: String(d.name ?? ''), kcal: kcalOf(d.energy_kj), p: n(d.protein_g), c: n(d.carbs_g), f: n(d.fat_g), fib: n(d.fiber_g),
    sugar: n(d.sugar_g), sodium: n(d.sodium_mg), grams: n(d.amount_g), at: row.updated_at, data: d };
}
/** The foods logged on a day, oldest first. */
export function dayItems(repo: Repository, day: string): FoodItem[] {
  return repo.list('food_entries').filter(r => r.data.day === day).sort((a, b) => a.updated_at - b.updated_at).map(item);
}

/** When no targets are set or can be worked out yet, the day is read against a plain 2,000 kcal day. */
const FALLBACK = { kcal: 2000, p: 100, c: 250, f: 67 };
export function goalsFor(repo: Repository, day: string): Goals {
  const { targets } = foodTargets(repo, day);
  const g = targets ? { kcal: targets.energy_kj / KJ, p: targets.protein_g, c: targets.carbs_g, f: targets.fat_g } : FALLBACK;
  // No fiber target is stored: 14 g for every 1,000 kcal, the usual guide.
  return { ...g, fib: Math.round(g.kcal / 1000 * 14), set: !!targets };
}

const sum = (items: FoodItem[], key: 'kcal' | 'p' | 'c' | 'f' | 'fib') => items.reduce((a, i) => add(a, i[key]), 0);

export function dayView(repo: Repository, day: string, { today = attributedDay(), burned = null }: { today?: string; burned?: number | null } = {}): DayView {
  const items = dayItems(repo, day), goals = goalsFor(repo, day);
  const views = mealList(repo).map(m => {
    const mine = items.filter(i => i.data.meal_id === m.id);
    return { id: m.id, name: m.name, icon: mealIcon(m.id), time: mine.length ? Math.min(...mine.map(i => i.at)) : null,
      kcal: sum(mine, 'kcal'), p: sum(mine, 'p'), c: sum(mine, 'c'), f: sum(mine, 'f'), fib: sum(mine, 'fib'), items: mine, empty: !mine.length };
  });
  const eaten = sum(items, 'kcal');
  return { day, today: day === today, eaten, goal: goals.kcal, left: goals.kcal - eaten, burned,
    p: sum(items, 'p'), c: sum(items, 'c'), f: sum(items, 'f'), fib: sum(items, 'fib'), goals, meals: views, logged: views.filter(m => !m.empty).length, items };
}

/** Which meal comes next: the first meal of the day with nothing logged, or dinner once every meal has food. */
export function nextMealId(view: Pick<DayView, 'meals'>): string {
  return (view.meals.find(m => m.empty) ?? view.meals.find(m => m.id === 'fd000000-0000-4000-8000-000000000002') ?? view.meals[view.meals.length - 1]).id;
}

/** Food names for a meal's one-line summary: Greek yogurt, blueberries, granola. */
/** Each name up to its first comma, so Greek yogurt, plain 2% reads as Greek yogurt. */
export const foodsLine = (items: FoodItem[]) => items.map((i, k) => { const n = i.name.split(',')[0].trim(); return k ? n.charAt(0).toLowerCase() + n.slice(1) : n; }).join(', ');

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const parts = (day: string) => day.split('-').map(Number) as [number, number, number];
export const weekday = (day: string) => { const [y, m, d] = parts(day); return (new Date(y, m - 1, d).getDay() + 6) % 7; };
export const fullDate = (day: string) => { const [y, m, d] = parts(day); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); };
export const shortDate = (day: string) => { const [y, m, d] = parts(day); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
export const weekdayName = (day: string) => { const [y, m, d] = parts(day); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' }); };
export const monthDay = (day: string) => { const [y, m, d] = parts(day); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); };

/** The Monday that starts the week holding `day`. */
export const weekStart = (day: string) => shiftDay(day, -weekday(day));
/** The day strip: last week and this week, Monday first. Days after today are shown but cannot be picked. */
export function stripDays(today: string) {
  const start = shiftDay(weekStart(today), -7);
  return Array.from({ length: 14 }, (_, i) => {
    const day = shiftDay(start, i);
    return { day, wd: WD[i % 7], date: parts(day)[2], today: day === today, future: day > today };
  });
}
/** This week, Monday to Sunday. */
export const weekDays = (day: string) => Array.from({ length: 7 }, (_, i) => shiftDay(weekStart(day), i));

/** Calories and protein a day, for charts. Days with nothing logged are null so they draw as no reading. */
export function daySums(repo: Repository, days: readonly string[]) {
  const rows = repo.list('food_entries'), by = new Map<string, FoodItem[]>();
  for (const r of rows) { const d = String(r.data.day); if (days.includes(d)) by.set(d, [...(by.get(d) ?? []), item(r)]); }
  return days.map(day => { const it = by.get(day); return it?.length ? { day, kcal: sum(it, 'kcal'), p: sum(it, 'p'), meals: new Set(it.map(i => String(i.data.meal_id))).size } : { day, kcal: null, p: null, meals: 0 }; });
}

/** Days in a row with food logged (or every meal logged), counting back from today. An empty today does not break it yet. */
export function streak(repo: Repository, today: string, full = false) {
  const all = repo.list('food_entries'), mealCount = mealList(repo).length, by = new Map<string, Set<string>>();
  for (const r of all) { const d = String(r.data.day); by.set(d, (by.get(d) ?? new Set()).add(String(r.data.meal_id))); }
  const ok = (day: string) => { const s = by.get(day); return !!s && (full ? s.size >= mealCount : s.size > 0); };
  let day = ok(today) ? today : shiftDay(today, -1), count = 0;
  while (ok(day) && count < 3650) { count++; day = shiftDay(day, -1); }
  return { count, today: ok(today), done: (d: string) => ok(d) };
}

/** Foods logged most often, by name, with their latest serving. */
export function oftenFoods(repo: Repository, limit = 6) {
  const counts = new Map<string, { food: Food; count: number; at: number }>();
  for (const r of repo.list('food_entries')) {
    const key = String(r.data.name ?? '').trim().toLowerCase(); if (!key) continue;
    const was = counts.get(key);
    counts.set(key, { food: !was || r.updated_at > was.at ? r.data : was.food, count: (was?.count ?? 0) + 1, at: Math.max(was?.at ?? 0, r.updated_at) });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || b.at - a.at).slice(0, limit);
}

/** The eating window: the first and last food logged, in ms. */
export function eatingWindow(view: DayView) {
  if (!view.items.length) return null;
  const times = view.items.map(i => i.at);
  return { first: Math.min(...times), last: Math.max(...times) };
}
