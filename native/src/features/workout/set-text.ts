import type { Unit } from '../../core/workout/rules';

/** A weight as people write it: 245, 52.5, 1,025. */
export function weightText(w: number) {
  if (!Number.isFinite(w)) return '0';
  const r = Math.round(w * 100) / 100;
  return r.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
/** "245 lb × 5", or "× 12" for a bodyweight set with no added weight. */
export function setText(weight: number, reps: number, unit: Unit) {
  return weight > 0 ? `${weightText(weight)} ${unit} × ${reps}` : `× ${reps}`;
}
