import type { OuraSource } from '../features/health/oura';

/** The free iPhone build has no account, so Oura is never offered. */
export function oura(): OuraSource | null { return null; }
