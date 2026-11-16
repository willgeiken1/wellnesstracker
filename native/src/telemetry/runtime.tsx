import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { onDevicePreferencesSaved, readDevicePreferences } from '../features/onboarding/device-preferences';
import { applyTelemetry, setTelemetryUser, track } from './sdk';
import type { USAGE_TABS } from './scrub';

/** Which tab a route belongs to, or nothing for screens that are not a tab. */
export function tabForPath(pathname:string|undefined):(typeof USAGE_TABS)[number]|undefined{
  if(pathname==='/'||pathname==='')return 'home';
  const first=pathname?.split('/')[1];
  return first==='workouts'||first==='food'||first==='progress'||first==='insights'||first==='settings'?first:undefined;
}

/** Keeps crash reports and analytics in step with the switches in Settings > Privacy. Renders nothing. */
export function TelemetryRuntime({userId}:{userId?:string}){
  useEffect(()=>{
    let active=true;
    readDevicePreferences().then(prefs=>{if(active)applyTelemetry(prefs);}).catch(()=>{/* Stay off when the switches can't be read. */});
    const stop=onDevicePreferencesSaved(applyTelemetry);
    return ()=>{active=false;stop();};
  },[]);
  useEffect(()=>{setTelemetryUser(userId);},[userId]);
  const pathname=usePathname();
  const tab=tabForPath(pathname);
  useEffect(()=>{if(tab)track('tab_viewed',{tab});},[tab]);
  return null;
}
