import 'react-native-url-polyfill/auto';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { authConfig } from './config';
import { chunkedStorage } from './storage';
let client: SupabaseClient | null | undefined;
let localSession: {storage: ReturnType<typeof chunkedStorage>; key: string} | undefined;
/** Also used after network failure: server revocation must not prevent device erasure. */
export async function clearLocalSession() {
  if (!localSession) return;
  const {storage,key}=localSession;
  for (const suffix of ['', '-user', '-code-verifier']) await storage.removeItem(key+suffix);
}
export function getAuthClient() {
  if (client !== undefined) return client;
  const config=authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!config) {client=null;return client;}
  const storage=chunkedStorage({
    getItemAsync: key => SecureStore.getItemAsync(key),
    setItemAsync: (key,value) => SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
    deleteItemAsync: key => SecureStore.deleteItemAsync(key),
  });
  // Explicitly preserve supabase-js's existing default key for installed sessions.
  const key=`sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`;
  localSession={storage,key};
  client=createClient(config.url,config.key,{auth:{storage,storageKey:key,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:processLock}});
  return client;
}
