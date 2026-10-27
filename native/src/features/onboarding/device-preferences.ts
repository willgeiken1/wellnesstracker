import { useEffect, useRef, useState } from 'react';
import { openLocalDatabase } from '../../data/database';
import type { DevicePreferences } from './model';
/** Installation namespace, not the signed-in owner; never enters settings/outbox. */
export async function saveDevicePreferences(value:DevicePreferences,changed=true) {
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
