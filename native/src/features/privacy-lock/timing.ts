/**
 * When Face ID lock asks again (Settings, Privacy: "Face ID lock" and "Require Face ID"). Pure, so it is tested
 * without a phone: the app records when it went to the background, and on return locks once the chosen time has
 * passed. "Immediately" is 0 minutes. Inactive (Control Center, a call banner, the Face ID prompt itself) is not
 * leaving: only the background counts, so the prompt never locks the app again behind itself.
 */

export type LockAfter = '0' | '1' | '5' | '15';
export interface LockPrefs { enabled: boolean; after: string }
export interface LockState { locked: boolean; awayAt: number | null }
export type AppPhase = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

/** The wait before the lock asks again, in milliseconds. A choice the app doesn't know asks at once. */
export function lockDelayMs(after: string): number {
  const minutes = Number(after);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
}

/** Whether coming back now, after leaving at `awayAt`, asks for Face ID. */
export function shouldLock(prefs: LockPrefs, awayAt: number | null, now: number): boolean {
  return prefs.enabled && awayAt != null && now - awayAt >= lockDelayMs(prefs.after);
}

/** On opening Insight the lock asks first, when it is on and this phone can use it. */
export function lockAtLaunch(prefs: LockPrefs, available: boolean): LockState {
  return { locked: prefs.enabled && available, awayAt: null };
}

/** The lock after the app moves to `phase` at `now`. */
export function nextLock(state: LockState, phase: AppPhase, prefs: LockPrefs, available: boolean, now: number): LockState {
  if (!prefs.enabled || !available) return { locked: false, awayAt: null };
  if (phase === 'background') return state.awayAt == null ? { ...state, awayAt: now } : state;
  if (phase === 'active') return { locked: state.locked || shouldLock(prefs, state.awayAt, now), awayAt: null };
  return state;
}
