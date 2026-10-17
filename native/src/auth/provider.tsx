import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getAuthClient } from './client';
import { openLocalDatabase } from '../data/database';
import type { Repository } from '../data/repository';
import { SyncEngine, syncTriggers, type SyncStatus } from '../data/sync/engine';
import { SupabaseTransport } from '../data/sync/supabase';
import { seedDemo } from '../../fixtures/demo';
export interface AuthState {
  session: Session | null; demo: boolean; ready: boolean; configured: boolean; configError: string | null;
  repository: Repository | null; pending: number; conflicts: number; syncStatus: SyncStatus;
  lookAround(): void; signIn(email: string,password: string): Promise<string | null>;
  createAccount(email: string,password: string): Promise<string | null>; signOut(): Promise<void>; syncNow(): Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() { const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider is required.');return value; }
export function AuthProvider({children, client: supplied}: PropsWithChildren<{client?: SupabaseClient | null}>) {
  const [clientState]=useState(()=>{
    try {return {client:supplied===undefined?getAuthClient():supplied,error:null};}
    catch(error) {return {client:null,error: error instanceof Error ? error.message : 'Invalid sign-in configuration.'};}
  });
  const client=clientState.client;
  const [session,setSession]=useState<Session|null>(null), [demo,setDemo]=useState(false), [authReady,setAuthReady]=useState(!client);
  const [repository,setRepository]=useState<Repository|null>(null),[dataError,setDataError]=useState(false);
  useEffect(()=>{
    let active=true, received=false;
    if(!client)return;
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{received=true;if(active){setSession(next);setAuthReady(true);if(next)setDemo(false);}});
    void client.auth.getSession().then(({data,error})=>{if(active&&!received){setSession(error?null:data.session);setAuthReady(true);}}).catch(()=>{if(active)setAuthReady(true);});
    const refresh=(state:string)=>{if(state==='active')client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();};
    refresh(AppState.currentState ?? 'background');
    const listener=AppState.addEventListener('change',refresh);
    return ()=>{active=false;subscription.unsubscribe();listener.remove();client.auth.stopAutoRefresh();};
  },[client]);
  const owner=session?.user.id ?? (demo?'demo':'guest');
  useEffect(()=>{
    let active=true;
    void openLocalDatabase().then(database=>{
      if(!active)return;
      const repo=database.forOwner(owner);
      if(owner==='demo')seedDemo(repo);
      setRepository(repo);setDataError(false);
    }).catch(()=>{if(active)setDataError(true);});
    return ()=>{active=false;};
  },[owner]);
  // Never expose the previous owner's repository during the render before effect cleanup.
  const currentRepo=repository?.owner===owner?repository:null;
  const userId=session?.user.id;
  const engine=useMemo(()=>currentRepo&&client&&userId ? new SyncEngine(currentRepo,new SupabaseTransport(client,userId)):null,[currentRepo,client,userId]);
  const pending=useSyncExternalStore(useCallback(listener=>currentRepo?.subscribe(listener)??(()=>{}),[currentRepo]),()=>currentRepo?.pending().length??0);
  const conflicts=useSyncExternalStore(useCallback(listener=>currentRepo?.subscribe(listener)??(()=>{}),[currentRepo]),()=>currentRepo?.conflicts().length??0);
  const syncStatus=useSyncExternalStore(useCallback(listener=>engine?.subscribe(listener)??(()=>{}),[engine]),()=>engine?.status??'idle');
  useEffect(()=>{
    if(!engine)return;
    const triggers=syncTriggers(engine);
    const app=AppState.addEventListener('change',state=>{if(state==='active')void triggers.foreground();});
    let connected=false;
    const network=Network.addNetworkStateListener(state=>{
      const next=state.isConnected===true;if(next&&!connected)void triggers.reconnect();connected=next;
    });
    void triggers.foreground();
    return ()=>{app.remove();network.remove();triggers.stop();};
  },[engine]);
  const value: AuthState={session,demo,ready:authReady&&!!currentRepo,configured:!!client,configError:clientState.error ?? (dataError?'Local data is unavailable.':null),repository:currentRepo,pending,conflicts,syncStatus,
    lookAround:()=>{setDemo(true);},
    signIn:async(email,password)=>{
      if(!client)return 'authUnavailable';
      try{const {error}=await client.auth.signInWithPassword({email,password});return error?'authFailed':null;}catch{return 'authFailed';}
    },
    createAccount:async(email,password)=>{
      if(!client)return 'authUnavailable';
      try{const {data,error}=await client.auth.signUp({email,password});return error?'authFailed':data.session?null:'confirmEmail';}catch{return 'authFailed';}
    },
    signOut:async()=>{
      if(client && session) {
        try {
          const {error}=await client.auth.signOut({scope:'local'});
          if(error)throw new Error('Sign-out unavailable.');
        } catch { throw new Error('Sign-out unavailable.'); }
      }
      engine?.close();setDemo(false);
      // A late completion belongs to the account that initiated it, never a newer auth event.
      setSession(current => current?.user.id === session?.user.id ? null : current);
    },
    syncNow:()=>engine?.sync()??Promise.resolve(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
