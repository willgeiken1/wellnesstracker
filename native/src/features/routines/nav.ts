import { router } from 'expo-router';

/** Where the Routines screens and sheets live. */
export const routinesRoutes = {
  detail: (routine: string) => router.push({ pathname: '/routines/detail', params: { routine } }),
  reorder: () => router.push('/routines/reorder'),
  history: (routine = 'all') => router.push({ pathname: '/routines/history', params: { routine } }),
  add: (p: { type?: string; routine?: string } = {}) => router.push({ pathname: '/routines/add', params: p }),
  converter: (p: { from?: 'add-item'; amt?: string; unit?: string } = {}) => router.push({ pathname: '/routines/converter', params: p }),
  pause: (routine?: string) => router.push({ pathname: '/routines/pause', params: routine ? { routine } : {} }),
  newRoutine: () => router.push('/routines/new'),
};
/** Puts a sheet or screen away: back to what opened it, or to the Routines tab when it was opened cold. */
export function closeRoutines() { if (router.canGoBack()) router.back(); else router.replace('/routines'); }

/* The tab's text tabs. Kept here so a tile (Supplies, Peptides, Medications) can open one. */
export type RoutinesTab = 'routines' | 'supplements' | 'peptides' | 'medications' | 'other';
let tab: RoutinesTab = 'routines';
const listeners = new Set<() => void>();
export const routinesTab = {
  get: () => tab,
  set(next: RoutinesTab) { if (next === tab) return; tab = next; listeners.forEach(l => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};
