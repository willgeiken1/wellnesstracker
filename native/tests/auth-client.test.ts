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

test('uses the exact existing SDK storage key for SecureStore writes and cleanup',async()=>{
 getAuthClient();const options=jest.mocked(createClient).mock.calls[0][2]!;
 expect(options.auth!.storageKey).toBe('sb-127-auth-token');
 await options.auth!.storage!.setItem('sb-127-auth-token','synthetic session');
 expect(SecureStore.setItemAsync).toHaveBeenCalledWith('sb-127-auth-token.part.0','synthetic session',{keychainAccessible:6});
 await clearLocalSession();
 expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('sb-127-auth-token.ready');
});

test('boot cleanup clears SecureStore without creating an auto-restoring auth client',async()=>{
 await jest.isolateModulesAsync(async()=>{
  const sdk=require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  const secure=require('expo-secure-store') as typeof import('expo-secure-store');
  jest.mocked(sdk.createClient).mockClear();jest.mocked(secure.deleteItemAsync).mockClear();
  jest.mocked(secure.getItemAsync).mockResolvedValue(null);
  const auth=require('../src/auth/client') as typeof import('../src/auth/client');
  await auth.clearLocalSession();
  expect(sdk.createClient).not.toHaveBeenCalled();
  expect(secure.deleteItemAsync).toHaveBeenCalledWith('sb-127-auth-token.ready');
  expect(secure.deleteItemAsync).toHaveBeenCalledWith('sb-127-auth-token-user.ready');
  expect(secure.deleteItemAsync).toHaveBeenCalledWith('sb-127-auth-token-code-verifier.ready');
 });
});

test('account recovery fails closed if configuration cannot identify its stored session; demo cleanup remains available',async()=>{
 await jest.isolateModulesAsync(async()=>{
  const configuration=require('../src/auth/config') as typeof import('../src/auth/config');
  const unavailable=jest.spyOn(configuration,'authConfig').mockReturnValue(null);
  try {
   const auth=require('../src/auth/client') as typeof import('../src/auth/client');
   await expect(auth.clearLocalSession(true)).rejects.toThrow('Session storage unavailable.');
   await expect(auth.clearLocalSession()).resolves.toBeUndefined();
  } finally {unavailable.mockRestore();}
 });
});

test.each(['demo','account'])('unconfigured %s boot recovery preserves unrelated session storage and handles marker strictly',async kind=>{
 await jest.isolateModulesAsync(async()=>{
  const configuration=require('../src/auth/config') as typeof import('../src/auth/config');
  const unavailable=jest.spyOn(configuration,'authConfig').mockReturnValue(null);
  const secure=require('expo-secure-store') as typeof import('expo-secure-store');
  const values=new Map([['sb-synthetic-auth-token.ready','1'],['sb-synthetic-auth-token.part.0','synthetic session']]);
  jest.mocked(secure.getItemAsync).mockImplementation(async key=>values.get(key)??null);
  jest.mocked(secure.deleteItemAsync).mockImplementation(async key=>{values.delete(key);});
  const auth=require('../src/auth/client') as typeof import('../src/auth/client');
  const {recoverSignOut}=require('../src/auth/sign-out') as typeof import('../src/auth/sign-out');
  const owner=kind==='demo'?'demo':'10000000-0000-4000-8000-000000000001';
  let marker:import('../src/auth/sign-out').SignOutMarker|null={owner,startedAt:1,phase:'wiped'};
  const storage={read:async()=>marker,write:async(next:NonNullable<typeof marker>)=>{marker=next;},remove:jest.fn(async()=>{marker=null;})};
  try {
   const flight=recoverSignOut({forOwner:()=>({owner} as import('../src/data/repository').Repository)},storage,id=>auth.clearLocalSession(id!=='demo'));
   if(kind==='demo'){await flight;expect(marker).toBeNull();expect(storage.remove).toHaveBeenCalledTimes(1);}
   else {await expect(flight).rejects.toThrow('Session storage unavailable.');expect(marker).not.toBeNull();expect(storage.remove).not.toHaveBeenCalled();}
   expect(values.get('sb-synthetic-auth-token.ready')).toBe('1');expect(values.get('sb-synthetic-auth-token.part.0')).toBe('synthetic session');
  } finally {unavailable.mockRestore();}
 });
});
