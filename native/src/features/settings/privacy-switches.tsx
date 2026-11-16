import { PreferenceFields } from '../onboarding/fields';
import { saveDevicePreferences, useDevicePreferences } from '../onboarding/device-preferences';
/** Send crash reports and Share usage analytics, changeable any time (the privacy policy says so). Saved at once on this phone. */
export function PrivacySwitches() {
  const preferences = useDevicePreferences();
  return <PreferenceFields value={preferences.value} onChange={next => {
    preferences.onChange(next);
    void saveDevicePreferences(next).catch(() => { /* The switch stays as shown; the next change saves again. */ });
  }} />;
}
