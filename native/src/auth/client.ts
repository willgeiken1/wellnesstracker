import 'react-native-url-polyfill/auto';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { authConfig } from './config';
import { chunkedStorage } from './storage';
let client: SupabaseClient | null | undefined;
export function getAuthClient() {
  if (client !== undefined) return client;
  const config=authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  client=config ? createClient(config.url,config.key,{auth:{storage:chunkedStorage({
    getItemAsync: key => SecureStore.getItemAsync(key),
    setItemAsync: (key,value) => SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
    deleteItemAsync: key => SecureStore.deleteItemAsync(key),
  }),autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:processLock}}) : null;
  return client;
}
