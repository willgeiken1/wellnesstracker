import { Platform } from 'react-native';
import { t, type MessageKey } from '@/i18n/en';
import { authenticate, type AuthResult } from './biometrics';

/**
 * Settings, Privacy: turning Face ID lock on asks for Face ID first and saves only once it goes through, so the switch
 * never says On for a lock this phone can't open. Off saves at once. The web has no Face ID and never locks, so its
 * switch just keeps the choice. Returns what to tell the person, or null.
 */
export async function switchLock(on: boolean, save: (on: boolean) => void,
  auth: (reason: string) => Promise<AuthResult> = authenticate, web = Platform.OS === 'web'): Promise<MessageKey | null> {
  if (!on || web) { save(on); return null; }
  const result = await auth(t('privacyLockTurnOnReason'));
  if (result === 'ok') { save(true); return null; }
  return result === 'unavailable' ? 'settingsFaceIdUnavailable' : 'settingsFaceIdNotConfirmed';
}
