import { useEffect, useRef, useState } from 'react';
import { openLocalDatabase } from '../../data/database';
import type { DevicePreferences } from './model';
/** No crash-report or analytics service is in the app, so there is nothing to consent to: the switches stay
 * hidden and nothing is saved. Turn this on in the same change that adds Sentry or PostHog with its scrub tests
 * (AGENTS.md rule 1), so the first saved answer is one the person actually gave. */
export const TELEMETRY_IN_BUILD = false;
/** Installation namespace, not the signed-in owner; never enters settings/outbox. */
export async function saveDevicePreferences(value:DevicePreferences,changed=true) {
  if(!TELEMETRY_IN_BUILD)return;
  const database=await openLocalDatabase();const device=database.forOwner('device');
  if(changed||!device.localGet('devicePreferences'))device.localSave('devicePreferences',value);
}

/** Display saved consent and preserve it unless this form changes it. */
export function useDevicePreferences() {
  const [value,setValue]=useState<DevicePreferences>({crashReports:true,analytics:false});
  const changed=useRef(false);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const database=await openLocalDatabase();
        const stored=database.forOwner('device').localGet<DevicePreferences>('devicePreferences');
        if(active&&stored&&!changed.current)setValue(stored);
      }catch { /* Consent is saved only on successful submission. */ }
    })();
    return ()=>{active=false;};
  },[]);
  return {value,onChange:(next:DevicePreferences)=>{changed.current=true;setValue(next);},save:()=>saveDevicePreferences(value,changed.current)};
}
