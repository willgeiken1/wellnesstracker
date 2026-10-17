import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { getAuthClient, clearLocalSession } from '../src/auth/client';
jest.mock('@supabase/supabase-js',()=>({createClient:jest.fn(()=>({})),processLock:jest.fn()}));
jest.mock('../src/auth/config',()=>({authConfig:()=>({url:'http://127.0.0.1:54321',key:'sb_publishable_fixture'})}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),deleteItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
test('client wires chunked SecureStore auth storage and persistent native session options',async()=>{
 getAuthClient();
 const options=jest.mocked(createClient).mock.calls[0][2]!;
 expect(options.auth).toMatchObject({persistSession:true,autoRefreshToken:true,detectSessionInUrl:false});
 const storage=options.auth!.storage!;
 const values=new Map<string,string>();
 jest.mocked(SecureStore.getItemAsync).mockImplementation(async key=>values.get(key)??null);
 jest.mocked(SecureStore.setItemAsync).mockImplementation(async(key,value)=>{values.set(key,value);});
 jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key=>{values.delete(key);});
 const session='fixture'.repeat(500);
 await storage.setItem('auth-fixture',session);
 expect(values.size).toBeGreaterThan(3);
 for(const [key,value] of values)if(key.includes('.part.'))expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(1600);
 expect(await storage.getItem('auth-fixture')).toBe(session);
 expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String),expect.any(String),{keychainAccessible:6});
 await storage.removeItem('auth-fixture');expect(values.size).toBe(0);
});

test('forced local cleanup removes session chunks even when remote sign-out did not remove storage',async()=>{
 getAuthClient();const options=jest.mocked(createClient).mock.calls[0][2]!;
 const storage=options.auth!.storage!,key=options.auth!.storageKey!;
 const values=new Map<string,string>();
 jest.mocked(SecureStore.getItemAsync).mockImplementation(async k=>values.get(k)??null);
 jest.mocked(SecureStore.setItemAsync).mockImplementation(async(k,v)=>{values.set(k,v);});
 jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async k=>{values.delete(k);});
 await storage.setItem(key,'synthetic'.repeat(500));await storage.setItem(key+'-user','synthetic user');
 await storage.setItem(key+'-code-verifier','synthetic verifier');
 await clearLocalSession();expect(values.size).toBe(0);expect(await storage.getItem(key)).toBeNull();
});
