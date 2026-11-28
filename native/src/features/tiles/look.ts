import type { ThemeColors } from '@/design/tokens';
import { unitOverrideOf, type UnitKey, type UnitOverride } from '@/features/settings/unit-override';
import type { TileDef, TileOptionValues, TilePageConfig, TilePageId } from './types';

/**
 * A tile's own look beside its style, size and options: its units and its colour (the tile editor's Units and Colour).
 * Both live in the tile's saved options under keys no tile option uses: 'u.weight', 'u.energy', 'u.water', 'u.distance',
 * 'u.height', 'u.clock' (absent: follow Settings) and 'tint' (absent: the tile's own colour, a theme colour token).
 */
export const TINT_KEY = 'tint';
export const isExtraKey = (k: string) => k === TINT_KEY || k.startsWith('u.');
/** Just the units and colour of a saved options object. */
export function extrasOf(o: TileOptionValues | undefined): TileOptionValues {
  const r: TileOptionValues = {};
  if (o) for (const [k, v] of Object.entries(o)) if (isExtraKey(k)) r[k] = v;
  return r;
}

/** The theme colours a tile can take, in the order the editor lists them. */
export const SWATCHES = ['accent', 'accent-2', 'training', 'food', 'recovery', 'sleep', 'water'] as const;
export type Swatch = (typeof SWATCHES)[number];
export const isSwatch = (v: unknown): v is Swatch => typeof v === 'string' && (SWATCHES as readonly string[]).includes(v);

/**
 * The colour token each Home tile draws its figures in (its dial, bars, numbers). Home's tiles are one shared drawing
 * code, so the token is not always the catalogue colour; recolouring swaps this token too.
 */
const HOME_TOKEN: Record<string, keyof ThemeColors> = {
  next: 'training', volume: 'training', exercise: 'training', active: 'training', workout: 'training',
  nextup: 'accent', weight: 'accent', bodyFat: 'accent',
  steps: 'recovery', hrv: 'recovery', rhr: 'recovery',
  calories: 'food', protein: 'food', logMeal: 'food', water: 'water',
  sleep: 'sleep', sleepScore: 'sleep', mindful: 'sleep',
};
/** Home's Insight Score and Week draw every pillar in its own colour, so they keep their colours. */
export const canTint = (cfg: TilePageConfig, def: TileDef) => !(cfg.variant === 'home' && (def.id === 'score' || def.id === 'week'));
/** Colours a tile draws in besides its own, which its colour of its own replaces too: the Goal tile's gauge takes the colour of the goal it shows. */
const TINT_ALSO: Partial<Record<string, readonly (keyof ThemeColors)[]>> = { 'progress:goal': ['training', 'sleep'] };
/** The colour token the editor shows for a tile with no colour of its own. */
export function ownToken(cfg: TilePageConfig, def: TileDef): keyof ThemeColors {
  return (cfg.variant === 'home' ? HOME_TOKEN[def.id] : undefined) ?? def.color;
}

/** The theme colours a tile is drawn with: its tokens swapped for the colour it was given, the theme's as they are otherwise. */
export function tintedColors(cfg: TilePageConfig, def: TileDef, colors: ThemeColors, tint: string | undefined): ThemeColors {
  if (!isSwatch(tint) || !canTint(cfg, def)) return colors;
  const to = colors[tint], keys = new Set<keyof ThemeColors>([def.color, ownToken(cfg, def), ...(TINT_ALSO[`${cfg.id}:${def.id}`] ?? [])]);
  let same = true;
  for (const k of keys) if (colors[k] !== to) same = false;
  if (same) return colors;
  const out = { ...colors };
  for (const k of keys) (out as Record<string, string>)[k as string] = to as string;
  return out;
}

/** The tile's own units, or null when it follows Settings. */
export const tileUnits = (o: TileOptionValues | undefined): UnitOverride | null => unitOverrideOf(o);

/**
 * The units each tile shows, so the editor offers only those. Found by drawing each tile in both units of each kind, and
 * tests/tile-editor-units.test.tsx keeps it honest both ways. Clock times on the Training, Food, Progress and Routines
 * tiles are 12-hour today and follow no setting, so those tiles list no Time. Progress shows lengths in the unit its
 * weights use, so a Progress tile's Weight also sets its lengths and Measurements' Length also sets its weights.
 */
export const TILE_UNITS: Partial<Record<`${TilePageId}:${string}`, readonly UnitKey[]>> = {
  'home:next': ['energy', 'clock'], 'home:workout': ['weight'], 'home:volume': ['weight'], 'home:exercise': ['clock'], 'home:active': ['energy', 'clock'],
  'home:steps': ['clock'], 'home:calories': ['energy', 'clock'], 'home:logMeal': ['energy', 'clock'], 'home:water': ['water', 'clock'],
  'home:weight': ['weight'], 'home:bodyFat': ['weight'], 'home:sleep': ['clock'], 'home:sleepScore': ['clock'], 'home:mindful': ['clock'],
  'training:session': ['weight'], 'training:week': ['weight'], 'training:next': ['weight'], 'training:e1rm': ['weight'], 'training:recent': ['weight'],
  'training:records': ['weight'], 'training:muscles': ['weight'], 'training:cardio': ['distance'],
  'food:cal': ['energy'], 'food:protein': ['energy'], 'food:meals': ['energy'], 'food:week': ['energy'], 'food:quick': ['energy'], 'food:net': ['energy'],
  'food:fits': ['energy'], 'food:water': ['water'],
  'progress:weight': ['weight'], 'progress:bodyfat': ['weight'], 'progress:goal': ['weight'], 'progress:weekly': ['weight'], 'progress:records': ['weight'],
  'progress:photos': ['weight'], 'progress:training': ['weight'], 'progress:trend': ['weight'], 'progress:measure': ['height'],
};
export type GoalKey = 'kcal' | 'protein' | 'train' | 'sleep' | 'weight' | 'water';
/** The shared goal each tile measures against, where it has one. */
export const TILE_GOALS: Partial<Record<`${TilePageId}:${string}`, readonly GoalKey[]>> = {
  'home:calories': ['kcal'], 'home:protein': ['protein'], 'home:water': ['water'], 'home:exercise': ['train'], 'home:weight': ['weight'], 'home:sleep': ['sleep'],
  'food:cal': ['kcal'], 'food:net': ['kcal'], 'food:protein': ['protein'], 'food:water': ['water'], 'food:week': ['kcal'],
  'training:week': ['train'], 'progress:goal': ['weight'], 'progress:weight': ['weight'], 'progress:recovery': ['sleep'],
};
/** The goals a tile measures against as it is set up now: Progress's Goal tile follows the goal it shows. */
export function tileGoals(page: TilePageId, id: string, options: Readonly<Record<string, string>> | undefined): readonly GoalKey[] {
  if (page === 'progress' && id === 'goal') { const g = options?.goal ?? 'weight'; return g === 'sleep' ? ['sleep'] : g === 'plan' ? [] : ['weight']; }
  return TILE_GOALS[`${page}:${id}`] ?? [];
}
