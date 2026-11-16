import { useEffect, useRef, useState } from 'react';
import { openLocalDatabase } from '../../data/database';
import type { DevicePreferences } from './model';
const listeners=new Set<(value:DevicePreferences)=>void>();
/** Hear about saved switch changes (crash reports and analytics follow them at once). */
export function onDevicePreferencesSaved(listener:(value:DevicePreferences)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}

/** The saved switches, or the defaults when nothing was saved yet. */
export async function readDevicePreferences():Promise<DevicePreferences> {
  const database=await openLocalDatabase();
  return database.forOwner('device').localGet<DevicePreferences>('devicePreferences')??{crashReports:true,analytics:false};
}

/** Installation namespace, not the signed-in owner; never enters settings/outbox.
 * A change takes effect at once, before it is saved, so switching crash reports or analytics off stops them
 * even if saving then fails. A failed save still throws, so the screen can say it was not kept. */
export async function saveDevicePreferences(value:DevicePreferences,changed=true) {
  if(changed)for(const listener of listeners)listener(value);
  const database=await openLocalDatabase();const device=database.forOwner('device');
  if(changed||!device.localGet('devicePreferences')){device.localSave('devicePreferences',value);if(!changed)for(const listener of listeners)listener(value);}
}

/** Display saved consent and preserve it unless this form changes it. */
export function useDevicePreferences() {
  const [value,setValue]=useState<DevicePreferences>({crashReports:true,analytics:false});
  // False until the saved switches are read, so a press can't save the defaults over them.
  const [loaded,setLoaded]=useState(false);
  const changed=useRef(false);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const database=await openLocalDatabase();
        const stored=database.forOwner('device').localGet<DevicePreferences>('devicePreferences');
        if(active&&stored&&!changed.current)setValue(stored);
      }catch { /* Consent is saved only on successful submission. */ }
      finally {if(active)setLoaded(true);}
    })();
    return ()=>{active=false;};
  },[]);
  return {value,loaded,onChange:(next:DevicePreferences)=>{changed.current=true;setValue(next);},save:()=>saveDevicePreferences(value,changed.current)};
}
