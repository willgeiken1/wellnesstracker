import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Speak a short message with VoiceOver or TalkBack. Does nothing when no screen reader is on.
 * iOS does not read `accessibilityLiveRegion` (Android only), so anything that changes without
 * the person moving focus has to be announced on purpose.
 *
 * `queue` waits for what VoiceOver is already saying (such as the name of the key just pressed)
 * instead of cutting it off. iOS only; Android always queues.
 */
export function announce(text: string | null | undefined, { queue = false }: { queue?: boolean } = {}) {
  const message = text?.trim();
  if (!message) return;
  if (Platform.OS === 'ios' && queue) AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  else AccessibilityInfo.announceForAccessibility(message);
}
