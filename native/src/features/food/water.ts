import type { Repository } from '../../data/repository';
import { shiftDay } from './model';
import { loadSettingsPrefs, SETTINGS_PREFS_KEY, withPref } from '../settings/prefs-model';

/**
 * Water on the phone: the person's containers (one tap each), their unit, their goal and the drinks of each day.
 * Kept in the app's local store under one key; a drink keeps the size it had when it was logged.
 */
export const FLOZ = 33.814;
export const WATER_KEY = 'foodWater';
export type WaterIconName = 'glass' | 'bottle' | 'tumbler' | 'jug';
export const WATER_ICONS: readonly WaterIconName[] = ['glass', 'bottle', 'tumbler', 'jug'];
export type WaterUnit = 'oz' | 'ml';
export interface Container { id: string; name: string; oz: number; icon: WaterIconName; quick: boolean }
export interface Drink { id: string; c: string | null; name: string; oz: number; icon: WaterIconName; at: number }
export interface WaterState { v: 1; unit: WaterUnit; goal: number; containers: Container[]; log: Record<string, Drink[]> }

export const DEFAULT_CONTAINERS: readonly Container[] = [
  { id: 'glass', name: 'Glass', oz: 8, icon: 'glass', quick: true }, { id: 'bottle', name: 'Bottle', oz: 16.9, icon: 'bottle', quick: true },
  { id: 'tumbler', name: 'Tumbler', oz: 24, icon: 'tumbler', quick: true }, { id: 'large', name: 'Large bottle', oz: 32, icon: 'jug', quick: true },
];
/** 100 fl oz a day, in litres, unless the person sets another goal. */
export const DEFAULT_GOAL = 100 / FLOZ;
export const QUICK_MAX = 4, QUICK_MIN = 2;
/** Drinks are kept for this many days, enough for the week charts. */
const KEEP_DAYS = 60;

/** Keeps 2 to 4 containers on quick add: turns the first ones on when too few, the last ones off when too many. */
export function fixQuick(cs: Container[]): Container[] {
  const out = cs.map(c => ({ ...c }));
  let q = out.filter(c => c.quick).length;
  for (let i = 0; q < Math.min(QUICK_MIN, out.length) && i < out.length; i++) if (!out[i].quick) { out[i].quick = true; q++; }
  for (let i = out.length - 1; q > QUICK_MAX && i >= 0; i--) if (out[i].quick) { out[i].quick = false; q--; }
  return out;
}
const valid = (c: Partial<Container> | null | undefined): c is Container =>
  !!c && !!c.id && !!c.name && typeof c.oz === 'number' && c.oz > 0 && WATER_ICONS.includes(c.icon as WaterIconName);

export function readWater(repo: Repository): WaterState {
  const s = repo.localGet<Partial<WaterState>>(WATER_KEY);
  const containers = Array.isArray(s?.containers) && s.containers.length && s.containers.every(valid) ? s.containers : DEFAULT_CONTAINERS;
  return { v: 1, unit: s?.unit === 'ml' ? 'ml' : 'oz', goal: typeof s?.goal === 'number' && s.goal > 0.5 && s.goal < 8 ? s.goal : DEFAULT_GOAL,
    containers: fixQuick(containers.map(c => ({ id: String(c.id), name: String(c.name), oz: +c.oz, icon: c.icon, quick: !!c.quick }))),
    log: s?.log && typeof s.log === 'object' ? s.log : {} };
}
function write(repo: Repository, next: WaterState, today?: string) {
  const log = today ? Object.fromEntries(Object.entries(next.log).filter(([d, l]) => d >= shiftDay(today, -KEEP_DAYS) && l.length)) : next.log;
  repo.localSave(WATER_KEY, { ...next, log });
}

export const drinksOn = (s: WaterState, day: string) => s.log[day] ?? [];
/** Litres drunk on a day. */
export const litresOn = (s: WaterState, day: string) => drinksOn(s, day).reduce((a, d) => a + d.oz, 0) / FLOZ;
export const quickContainers = (s: WaterState) => s.containers.filter(c => c.quick);

let seq = 0;
const newId = (now: number) => `w${now.toString(36)}${(seq++).toString(36)}`;

/** Logs a drink and returns what undoes it. */
export function addDrink(repo: Repository, day: string, what: { c: Container } | { oz: number }, now = Date.now()) {
  const s = readWater(repo);
  const drink: Drink = 'c' in what ? { id: newId(now), c: what.c.id, name: what.c.name, oz: what.c.oz, icon: what.c.icon, at: now }
    : { id: newId(now), c: null, name: 'Other amount', oz: what.oz, icon: 'glass', at: now };
  write(repo, { ...s, log: { ...s.log, [day]: [...drinksOn(s, day), drink] } }, day);
  return { drink, undo: () => { removeDrink(repo, day, drink.id); } };
}
/** Takes a drink off a day and returns what puts it back where it was. */
export function removeDrink(repo: Repository, day: string, id: string) {
  const s = readWater(repo), list = drinksOn(s, day), at = list.findIndex(d => d.id === id);
  if (at < 0) return { drink: null, undo: () => {} };
  const drink = list[at];
  write(repo, { ...s, log: { ...s.log, [day]: list.filter(d => d.id !== id) } });
  return { drink, undo: () => {
    const now = readWater(repo), cur = drinksOn(now, day);
    if (cur.some(d => d.id === id)) return;
    write(repo, { ...now, log: { ...now.log, [day]: [...cur.slice(0, at), drink, ...cur.slice(at)] } });
  } };
}
export function setContainers(repo: Repository, containers: Container[], unit?: WaterUnit) {
  const s = readWater(repo);
  write(repo, { ...s, containers: fixQuick(containers), unit: unit ?? s.unit });
}
/** One water unit for the app: the water logger's and Settings, Units' are kept the same, whichever changes it. */
export function setWaterUnit(repo: Repository, unit: WaterUnit) {
  const s = readWater(repo), pref = unit === 'ml' ? 'ml' : 'floz', prefs = loadSettingsPrefs(repo);
  repo.atomic(() => {
    if (s.unit !== unit) write(repo, { ...s, unit });
    if (prefs.units.water !== pref) repo.localSave(SETTINGS_PREFS_KEY, withPref(prefs, 'units.water', pref));
  });
}
export function setWaterGoal(repo: Repository, litres: number) { if (litres > 0.5 && litres < 8) write(repo, { ...readWater(repo), goal: litres }); }

/* Amounts as the person reads them: 57 oz or 1,680 mL. Totals round to whole ounces or 10 mL; sizes keep one decimal (16.9 oz). */
const fmt = (v: number) => v.toLocaleString('en-US');
export const unitLabel = (u: WaterUnit) => u === 'ml' ? 'mL' : 'oz';
export const waterNum = (litres: number, u: WaterUnit) => u === 'ml' ? fmt(Math.round(litres * 100) * 10) : fmt(Math.round(litres * FLOZ));
export const waterAmt = (litres: number, u: WaterUnit) => `${waterNum(litres, u)} ${unitLabel(u)}`;
export const sizeNum = (oz: number, u: WaterUnit) => u === 'ml' ? fmt(Math.round(oz / FLOZ * 1000)) : String(Math.round(oz * 10) / 10);
export const sizeText = (oz: number, u: WaterUnit) => `${sizeNum(oz, u)} ${unitLabel(u)}`;
export const sizeSpoken = (oz: number, u: WaterUnit) => u === 'ml' ? `${Math.round(oz / FLOZ * 1000)} milliliters` : `${Math.round(oz * 10) / 10} fluid ounces`;
