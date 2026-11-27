import { useSyncExternalStore } from 'react';
import type { TileOptionValues, TileSize } from '@/features/tiles/types';
import { buildTileData, tileReady, type HomeInput, type TileReady } from './data';
import type { HomeTileData } from './data-types';
import type { StudioUnits } from './studio';

/** Why a tile shows its empty state instead of a reading. Each has one line of copy (see empty.tsx). */
export type EmptyReason = 'connect' | 'today' | 'night' | 'targets' | 'next' | 'score' | 'weigh' | 'bodyFat' | 'routines' | 'detail' | 'goalWeight' | 'sleepStages' | 'noStages';

/** Home's tile data and what each tile can show, shared by every tile on Home and in the tray while Home is open. */
export interface HomeTileState {
  data: HomeTileData;
  ready: TileReady;
  why: Record<string, EmptyReason>;
  units: StudioUnits;
  /** Which finer readings could be read, for the styles that need them. */
  has: { stepsHourly: boolean; activeHourly: boolean; exerciseHourly: boolean; mindfulSessions: boolean; sleepScore: boolean; weightGoal: boolean };
  /** Quick-log buttons inside tiles. */
  onAction: (data: Record<string, string>) => void;
  /** Hide numbers (Settings, Privacy): weight and energy figures on Home show as dots until a tap (see ../hide-numbers.ts). */
  hide: boolean;
}

const HEALTH = new Set(['steps', 'active', 'exercise', 'mindful']), NIGHT = new Set(['sleep', 'sleepScore', 'hrv', 'rhr']);
/** The empty-state reason for each tile that is not ready. */
export function reasons(input: HomeInput, ready: TileReady): Record<string, EmptyReason> {
  const connected = !!input.health || !!input.recovery;
  const out: Record<string, EmptyReason> = {};
  for (const [id, ok] of Object.entries(ready)) {
    if (ok) continue;
    out[id] = HEALTH.has(id) ? (input.health ? 'today' : 'connect')
      // Asleep last night, but with no stage timeline to draw: say why rather than "nothing recorded".
      : id === 'sleep' && input.health?.sleepHours?.at(-1) != null ? (input.recovery?.source === 'Oura' ? 'sleepStages' : 'noStages')
      : NIGHT.has(id) ? (connected ? 'night' : 'connect')
      : id === 'bodyFat' ? (input.detail ? 'bodyFat' : 'connect')
      : id === 'calories' || id === 'protein' || id === 'logMeal' ? 'targets'
      : id === 'next' ? 'next' : id === 'score' || id === 'week' ? 'score' : id === 'weight' ? 'weigh' : 'routines';
  }
  return out;
}

export function buildState(input: HomeInput, units: StudioUnits, onAction: HomeTileState['onAction'], hide = false): HomeTileState {
  const ready = tileReady(input), d = input.detail;
  return {
    data: buildTileData(input), ready, why: reasons(input, ready), units, onAction, hide,
    has: {
      stepsHourly: !!d?.stepsHourly, activeHourly: !!d?.activeHourly, exerciseHourly: !!d?.exerciseHourly,
      mindfulSessions: !!d?.mindful, sleepScore: !!input.recovery?.sleepScore?.some(v => v !== null), weightGoal: !!input.weightGoalKg,
    },
  };
}

/**
 * What one tile draws: its own reading, or the reason it cannot. A style that needs finer detail than the health source shares
 * (an hour-by-hour chart, sleep score parts) says so rather than drawing that detail as empty. Options a reading cannot fill
 * (a goal weight, a sleep score) fall back to the ones it can.
 */
export function tileView(s: HomeTileState, id: string, style: string, size: TileSize, options: TileOptionValues): { empty: EmptyReason } | { options: TileOptionValues } {
  if (!s.ready[id]) return { empty: s.why[id] ?? 'today' };
  const h = s.has, A = style === 'A', B = style === 'B', D = style === 'D';
  const detail = (id === 'steps' && !h.stepsHourly) || (id === 'active' && (A || B || D) && !h.activeHourly)
    || (id === 'exercise' && B && !h.exerciseHourly)
    || (id === 'mindful' && (A || B || D) && !h.mindfulSessions)
    // Sleep score parts (duration, stages, consistency) are not read from any source yet.
    || (id === 'sleepScore' && (A || B || (style === 'C' && size === 'L')));
  if (detail) return { empty: 'detail' };
  if (id === 'weight' && D && !h.weightGoal) return { empty: 'goalWeight' };
  const o = { ...options };
  if (id === 'weight' && !h.weightGoal) o.goal = 'off';
  if (id === 'sleep' && !h.sleepScore) o.show = 'hours';
  return { options: o };
}

let current: HomeTileState | null = null;
const listeners = new Set<() => void>();
export function setHomeTileState(next: HomeTileState | null) { if (next === current) return; current = next; listeners.forEach(l => l()); }
export const homeTileState = () => current;
export function subscribeHomeTileState(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export const useHomeTileState = () => useSyncExternalStore(subscribeHomeTileState, () => current, () => current);
