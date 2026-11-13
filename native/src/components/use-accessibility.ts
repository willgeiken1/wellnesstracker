import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

type Setting = 'screenReaderChanged' | 'darkerSystemColorsChanged';
const READ = {
  screenReaderChanged: () => AccessibilityInfo.isScreenReaderEnabled(),
  darkerSystemColorsChanged: () => Platform.OS === 'ios' ? AccessibilityInfo.isDarkerSystemColorsEnabled() : Promise.resolve(false),
} as const;

/** Follows one iOS accessibility switch. Off until the system answers; an event that arrives first wins. */
function useSystemSetting(event: Setting) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true, heard = false;
    const subscription = AccessibilityInfo.addEventListener(event, (value: boolean) => { heard = true; setOn(value); });
    READ[event]().then(value => { if (live && !heard) setOn(value); }).catch(() => {});
    return () => { live = false; subscription.remove(); };
  }, [event]);
  return on;
}
/** True while VoiceOver (or TalkBack) is running. */
export const useScreenReader = () => useSystemSetting('screenReaderChanged');
/** True while iOS Settings › Accessibility › Display › Increase Contrast is on. */
export const useIncreaseContrast = () => useSystemSetting('darkerSystemColorsChanged');
