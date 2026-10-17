import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getAuthClient, clearLocalSession } from './client';
import { openLocalDatabase } from '../data/database';
import type { Repository } from '../data/repository';
import { SyncEngine, syncTriggers, type SyncStatus } from '../data/sync/engine';
import { SupabaseTransport } from '../data/sync/supabase';
import { syncBeforeSignOut } from './sign-out-sync';
import { beginSignOut, completeSignOut, recoverSignOut } from './sign-out';
import { signOutStorage } from './sign-out-storage';
import { seedDemo } from '../../fixtures/demo';
export interface AuthState {
  session: Session | null; demo: boolean; ready: boolean; configured: boolean; configError: string | null;
  repository: Repository | null; pending: number; conflicts: number; syncStatus: SyncStatus;
  lookAround(): void; signIn(email: string,password: string): Promise<string | null>;
  createAccount(email: string,password: string): Promise<string | null>; signOut(discardUnsynced?: boolean): Promise<void>; syncNow(): Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() { const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider is required.');return value; }
export function AuthProvider({children, client: supplied}: PropsWithChildren<{client?: SupabaseClient | null}>) {
  const [clientState,setClientState]=useState<{client:SupabaseClient|null;error:string|null}>({client:null,error:null});
  const [bootReady,setBootReady]=useState(false),[departurePending,setDeparturePending]=useState(false);
  const departingOwner=useRef<string|null>(null);
  const client=clientState.client;
  const [session,setSession]=useState<Session|null>(null), [demo,setDemo]=useState(false), [authReady,setAuthReady]=useState(false);
  const [repository,setRepository]=useState<Repository|null>(null),[dataError,setDataError]=useState(false);
  const activeSession=useRef<Session|null>(null);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const database=await openLocalDatabase();
        await recoverSignOut(database,signOutStorage,owner=>clearLocalSession(owner!=='demo'));
        if(!active)return;
        // createClient may restore/refresh immediately: it must come AFTER recovery.
        let next:SupabaseClient|null=null,error:string|null=null;
        try {next=supplied===undefined?getAuthClient():supplied;}
        catch {error='Invalid sign-in configuration.';}
        setClientState({client:next,error});setBootReady(true);if(!next)setAuthReady(true);
      } catch {if(active)setDataError(true);}
    })();
    return ()=>{active=false;};
  },[supplied]);
  useEffect(()=>{
    let active=true, received=false;
    if(!bootReady||!client)return;
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{received=true;if(next?.user.id===departingOwner.current)return;if(active){activeSession.current=next;setSession(next);setAuthReady(true);if(next)setDemo(false);}});
    void client.auth.getSession().then(({data,error})=>{if(active&&!received){activeSession.current=error?null:data.session;setSession(activeSession.current);setAuthReady(true);}}).catch(()=>{if(active)setAuthReady(true);});
    const refresh=(state:string)=>{if(state==='active'&&!departingOwner.current)client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();};
    refresh(AppState.currentState ?? 'background');
    const listener=AppState.addEventListener('change',refresh);
    return ()=>{active=false;subscription.unsubscribe();listener.remove();client.auth.stopAutoRefresh();};
  },[client,bootReady]);
  const owner=session?.user.id ?? (demo?'demo':'guest');
  useEffect(()=>{
    let active=true;
    if(!bootReady)return;
    void openLocalDatabase().then(database=>{
      if(!active)return;
      const repo=database.forOwner(owner);
      if(owner==='demo')seedDemo(repo);
      setRepository(repo);setDataError(false);
    }).catch(()=>{if(active)setDataError(true);});
    return ()=>{active=false;};
  },[owner,bootReady]);
  // Never expose the previous owner's repository during the render before effect cleanup.
  const currentRepo=repository?.owner===owner?repository:null;
  const userId=session?.user.id;
  const engine=useMemo(()=>!departurePending&&currentRepo&&client&&userId ? new SyncEngine(currentRepo,new SupabaseTransport(client,userId)):null,[currentRepo,client,userId,departurePending]);
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
  const value: AuthState={session,demo,ready:bootReady&&authReady&&!!currentRepo&&!departurePending,configured:!!client,configError:clientState.error ?? (dataError?'Local data is unavailable.':null),repository:currentRepo,pending,conflicts,syncStatus,
    lookAround:()=>{if(bootReady&&!departingOwner.current)setDemo(true);},
    signIn:async(email,password)=>{
      if(!bootReady||departingOwner.current||!client)return 'authUnavailable';
      try{const {error}=await client.auth.signInWithPassword({email,password});return error?'authFailed':null;}catch{return 'authFailed';}
    },
    createAccount:async(email,password)=>{
      if(!bootReady||departingOwner.current||!client)return 'authUnavailable';
      try{const {data,error}=await client.auth.signUp({email,password});return error?'authFailed':data.session?null:'confirmEmail';}catch{return 'authFailed';}
    },
    signOut:async(discardUnsynced=false)=>{
      await syncBeforeSignOut(()=>engine?.sync()??Promise.resolve());
      if(currentRepo?.hasUnsynced() && !discardUnsynced)throw new Error('Unsynced changes require confirmation.');
      if(!bootReady||!currentRepo||departingOwner.current)throw new Error('Sign-out recovery required.');
      departingOwner.current=currentRepo.owner;setDeparturePending(true);
      engine?.close();
      client?.auth.stopAutoRefresh();
      try {
        const marker=await beginSignOut(currentRepo.owner,signOutStorage);
        await completeSignOut(marker,currentRepo,signOutStorage,async()=>{
          if(client && session && activeSession.current?.user.id===session.user.id) {
            client.auth.stopAutoRefresh();
            // Local scope only. A failed network revocation must still erase this device.
            try { await client.auth.signOut({scope:'local'}); } catch { /* device cleanup below */ }
            // A newer auth event owns its own credentials; never erase that session.
            if(!activeSession.current || activeSession.current.user.id===session.user.id)await clearLocalSession(true);
          } else if(!session && !activeSession.current)await clearLocalSession();
        });
      } catch {setDataError(true);throw new Error('Sign-out recovery required.');}
      departingOwner.current=null;setDeparturePending(false);
      setDemo(false);
      if(activeSession.current?.user.id===session?.user.id)activeSession.current=null;
      setSession(current => current?.user.id === session?.user.id ? null : current);
    },
    syncNow:()=>engine?.sync()??Promise.resolve(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
