import { openLocalDatabase } from '../../data/database';
import type { DevicePreferences } from './model';
/** Installation namespace, not the signed-in owner; never enters settings/outbox. */
export async function saveDevicePreferences(value:DevicePreferences) {
  const database=await openLocalDatabase();database.forOwner('device').localSave('devicePreferences',value);
}
