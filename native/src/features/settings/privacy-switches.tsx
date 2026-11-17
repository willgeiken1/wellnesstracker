import { useRef, useState } from 'react';
import { ThemedText } from '../../components/themed-text';
import { t } from '../../i18n/en';
import { PreferenceFields } from '../onboarding/fields';
import { devicePreferencesUnsaved, saveDevicePreferences, useDevicePreferences } from '../onboarding/device-preferences';
/** Send crash reports and Share usage analytics, changeable any time (the privacy policy says so). Saved at once on this phone.
 * A change applies straight away, even if saving fails; then the screen says so, and the next change tries again. */
export function PrivacySwitches() {
  const preferences = useDevicePreferences();
  // Reopened after a change that wasn't saved: still say so.
  const [failed, setFailed] = useState(devicePreferencesUnsaved);
  const latest = useRef(0);
  return <>
    <PreferenceFields value={preferences.value} disabled={!preferences.loaded} onChange={next => {
      if (!preferences.loaded) return;
      preferences.onChange(next);
      const attempt = ++latest.current;
      saveDevicePreferences(next).then(() => { if (attempt === latest.current) setFailed(false); }, () => { if (attempt === latest.current) setFailed(true); });
    }} />
    {failed && <ThemedText accessibilityRole="alert" testID="privacy-save-failed">{t('privacySaveFailed')}</ThemedText>}
  </>;
}
