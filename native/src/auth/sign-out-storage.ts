import * as SecureStore from 'expo-secure-store';
import type { SignOutMarker, SignOutStorage } from './sign-out';
const key='insight.sign-out-pending.v1';
/** One small native SecureStore item; deliberately separate from auth session chunks and SQLite. */
export const signOutStorage: SignOutStorage = {
  async read() {
    try {
      const raw=await SecureStore.getItemAsync(key);if(raw===null)return null;
      const value:unknown=JSON.parse(raw);
      if(!value || typeof value!=='object')throw new Error();
      const marker=value as SignOutMarker;
      if(typeof marker.owner!=='string' || !/^(demo|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(marker.owner)
        || !Number.isSafeInteger(marker.startedAt) || marker.startedAt<0
        || !['pending','wiped','session-cleared'].includes(marker.phase))throw new Error();
      return {owner:marker.owner,startedAt:marker.startedAt,phase:marker.phase};
    } catch {throw new Error('Sign-out recovery unavailable.');}
  },
  async write(marker) {
    try {await SecureStore.setItemAsync(key,JSON.stringify(marker),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
    catch {throw new Error('Sign-out recovery unavailable.');}
  },
  async remove() {
    try {await SecureStore.deleteItemAsync(key);}
    catch {throw new Error('Sign-out recovery unavailable.');}
  },
};
