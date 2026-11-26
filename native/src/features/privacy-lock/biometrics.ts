import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import type { LocalAuthenticationOptions, LocalAuthenticationResult } from 'expo-local-authentication';

/** The parts of expo-local-authentication the lock uses, so tests can stand in for the phone. */
export interface Biometrics {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(options?: LocalAuthenticationOptions): Promise<LocalAuthenticationResult>;
}
const device: Biometrics | null = Platform.OS === 'web' ? null : LocalAuthentication;

/** ok: it was them. cancelled: they closed the prompt. unavailable: this phone can't ask (no Face ID or Touch ID set up,
 * no passcode, or the web), so nothing may lock. failed: it asked and didn't get through. */
export type AuthResult = 'ok' | 'cancelled' | 'unavailable' | 'failed';

/** Whether this phone can ask for Face ID (or Touch ID) at all. The web and phones without it never lock. */
export async function lockAvailable(bio: Biometrics | null = device): Promise<boolean> {
  if (!bio) return false;
  try { return (await bio.hasHardwareAsync()) && (await bio.isEnrolledAsync()); } catch { return false; }
}

let prompting = false;
/** True while Insight's own Face ID prompt is up: the app goes inactive under it, and that is not switching apps. */
export const isPrompting = () => prompting;

const UNAVAILABLE = new Set(['not_enrolled', 'not_available', 'passcode_not_set', 'invalid_context']);
const CANCELLED = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

/** Asks for Face ID, with the iPhone passcode as the fallback the system offers. */
export async function authenticate(reason: string, bio: Biometrics | null = device): Promise<AuthResult> {
  if (!(await lockAvailable(bio)) || !bio) return 'unavailable';
  prompting = true;
  try {
    const res = await bio.authenticateAsync({ promptMessage: reason, disableDeviceFallback: false });
    if (res.success) return 'ok';
    if (UNAVAILABLE.has(res.error)) return 'unavailable';
    return CANCELLED.has(res.error) ? 'cancelled' : 'failed';
  } catch { return 'failed'; }
  finally { prompting = false; }
}
