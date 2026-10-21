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
import { beginSignOut, completeSignOut, recoverSignOut, escapeSignOut, UnreadableSignOutMarker, CorruptSignOutMarker, DepartureFailure } from './sign-out';
import { bootErrorClass } from './boot-diagnostics';
import { signOutStorage } from './sign-out-storage';
import { lastOwnerStorage, realOwnerId } from './last-owner-storage';
import { seedDemo } from '../../fixtures/demo';
// Clear the hint for every resumed departure phase, before recovery can wipe/remove its marker.
const bootSignOutStorage: typeof signOutStorage={
  async read(){const marker=await signOutStorage.read();if(marker)await lastOwnerStorage.clear();return marker;},
  write:marker=>signOutStorage.write(marker),remove:()=>signOutStorage.remove(),
};
export interface AuthState {
  session: Session | null; demo: boolean; ready: boolean; configured: boolean; configError: string | null;
  repository: Repository | null; pending: number; conflicts: number; syncStatus: SyncStatus;
  prepareSignOut?(): Promise<void>;
  bootExportOwner?(): string | null;
  recovery?: 'corrupt-marker' | 'read-error' | 'unreadable-marker' | 'departure' | 'boot-error'; bootErrorClass?: string; bootRetryNeedsConfirmation?: boolean; retryBoot?(confirmed?: boolean): void; retryMarkerRead?():void; countRecoveryUnsynced?():Promise<number|undefined>; recoveryFailed?: boolean; recoverLocalData?(): Promise<void>;
  lookAround(): void; signIn(email: string,password: string): Promise<string | null>;
  createAccount(email: string,password: string): Promise<string | null>; signOut(discardUnsynced?: boolean): Promise<void>; syncNow(): Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() { const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider is required.');return value; }
export function AuthProvider({children, client: supplied}: PropsWithChildren<{client?: SupabaseClient | null}>) {
  const [clientState,setClientState]=useState<{client:SupabaseClient|null;error:string|null}>({client:null,error:null});
  const [bootReady,setBootReady]=useState(false),[departurePending,setDeparturePending]=useState(false);
  const [recovery,setRecovery]=useState<AuthState['recovery']>(),[recoveryFailed,setRecoveryFailed]=useState(false);
  const [bootAttempt,setBootAttempt]=useState(0);
  const [bootClass,setBootClass]=useState('Error');
  const [bootRetryNeedsConfirmation,setBootRetryNeedsConfirmation]=useState(false);
  const retryWipeConfirmed=useRef(false), recoveringBoot=useRef(false), bootInFlight=useRef(true);
  const readFailures=useRef(0);
  const escapeAllowed=useRef(false);
  const retryDeparture=useRef<(()=>Promise<void>)|null>(null);
  const preparedSync=useRef<{engine:SyncEngine|null;flight:Promise<void>}|null>(null);
  const departureLocked=useRef(false);
  const escapeInFlight=useRef(false);
  const departingOwner=useRef<string|null>(null);
  const client=clientState.client;
  const [session,setSession]=useState<Session|null>(null), [demo,setDemo]=useState(false), [authReady,setAuthReady]=useState(false);
  const [repository,setRepository]=useState<Repository|null>(null),[dataError,setDataError]=useState(false);
  const activeSession=useRef<Session|null>(null);
  const bootOwner=useRef<string|null>(null);
  useEffect(()=>{
    let active=true;
    escapeAllowed.current=false;
    bootOwner.current=null;
    void (async()=>{
      try {
        const database=await openLocalDatabase();
        await recoverSignOut(database,bootSignOutStorage,owner=>owner==='demo'?clearLocalSession():clearLocalSession(true),()=>{
          setBootRetryNeedsConfirmation(true);
          // The first boot resumes an already requested sign-out. New recovery retries need consent.
          if(recoveringBoot.current&&!retryWipeConfirmed.current)throw new Error('Sign-out confirmation required.');
        });
        readFailures.current=0;
        if(!active)return;
        setDataError(false);setRecovery(undefined);
        // createClient may restore/refresh immediately: it must come AFTER recovery.
        let next:SupabaseClient|null=null,error:string|null=null;
        try {next=supplied===undefined?getAuthClient():supplied;}
        catch {error='Invalid sign-in configuration.';}
        setClientState({client:next,error});setBootReady(true);if(!next)setAuthReady(true);
      } catch(error) {
        if(!(error instanceof CorruptSignOutMarker)&&!(error instanceof UnreadableSignOutMarker)) {
          // Do not restore auth to scope a backup. A missing/unreadable marker check fails closed.
          try {
            const stored=await lastOwnerStorage.read();
            if(stored && !(await signOutStorage.read()) && active)bootOwner.current=stored;
          } catch {bootOwner.current=null;}
        }
        if(active){setDataError(true);if(error instanceof CorruptSignOutMarker){readFailures.current=0;escapeAllowed.current=true;setRecovery('corrupt-marker');}else if(error instanceof UnreadableSignOutMarker){readFailures.current++;escapeAllowed.current=readFailures.current>=3;setRecovery(escapeAllowed.current?'unreadable-marker':'read-error');}else {readFailures.current=0;setBootClass(bootErrorClass(error));setRecovery('boot-error');}}
      }
      finally {if(active)bootInFlight.current=false;}
    })();
    return ()=>{active=false;};
  },[supplied,bootAttempt]);
  useEffect(()=>{
    let active=true, received=false;
    if(!bootReady||!client)return;
    const remember=(next:Session|null)=>{void lastOwnerStorage.write(next?.user.id).catch(()=>{/* Keep authentication available if the optional hint cannot be saved. */});};
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{received=true;if(next?.user.id===departingOwner.current || (departureLocked.current&&!departingOwner.current))return;if(active){activeSession.current=next;remember(next);setSession(next);setAuthReady(true);if(next)setDemo(false);}});
    void client.auth.getSession().then(({data,error})=>{if(active&&!received){activeSession.current=error?null:data.session;remember(activeSession.current);setSession(activeSession.current);setAuthReady(true);}}).catch(()=>{if(active)setAuthReady(true);});
    const refresh=(state:string)=>{if(state==='active'&&!departingOwner.current&&!departureLocked.current)client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();};
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
  const value: AuthState={bootExportOwner:()=>departureLocked.current||departingOwner.current?null:recovery==='boot-error'?bootOwner.current:realOwnerId(activeSession.current?.user.id),prepareSignOut:()=>{
      const flight=syncBeforeSignOut(()=>engine?.sync()??Promise.resolve());
      preparedSync.current={engine,flight};return flight;
    },recovery,bootErrorClass:bootClass,bootRetryNeedsConfirmation,retryBoot:(confirmed=false)=>{
      if(bootReady||bootInFlight.current||escapeInFlight.current||recovery!=='boot-error'||(bootRetryNeedsConfirmation&&!confirmed))return;
      bootInFlight.current=true;recoveringBoot.current=true;retryWipeConfirmed.current=confirmed;setRecovery(undefined);setDataError(false);setBootAttempt(attempt=>attempt+1);
    },recoveryFailed,retryMarkerRead:()=>{if(!bootReady&&!bootInFlight.current&&!escapeInFlight.current&&(recovery==='read-error'||recovery==='unreadable-marker')){bootInFlight.current=true;escapeAllowed.current=false;setRecovery(undefined);setBootAttempt(attempt=>attempt+1);}},countRecoveryUnsynced:async()=>{try{return (await openLocalDatabase()).countAllUnsynced?.();}catch{return undefined;}},recoverLocalData:async()=>{
      if(!escapeAllowed.current||escapeInFlight.current)return;
      escapeInFlight.current=true;setRecoveryFailed(false);
      try {
        const database=await openLocalDatabase();
        await lastOwnerStorage.clear();
        await escapeSignOut(database,signOutStorage,()=>clearLocalSession(true));
        // Boot auth only after erasure and marker removal. Never restore the pre-escape session.
        setSession(null);activeSession.current=null;setDemo(false);setDataError(false);setRecovery(undefined);escapeAllowed.current=false;
        let next:SupabaseClient|null=null,error:string|null=null;
        try {next=supplied===undefined?getAuthClient():supplied;}catch {error='Invalid sign-in configuration.';}
        setClientState({client:next,error});setBootReady(true);if(!next)setAuthReady(true);
      } catch {setRecoveryFailed(true);throw new Error('Local recovery did not finish.');}
      finally {escapeInFlight.current=false;}
    },session,demo,ready:bootReady&&authReady&&!!currentRepo&&!departurePending,configured:!!client,configError:clientState.error ?? (dataError?'Local data is unavailable.':null),repository:currentRepo,pending,conflicts,syncStatus,
    lookAround:()=>{if(bootReady&&!departingOwner.current&&!departureLocked.current)setDemo(true);},
    signIn:async(email,password)=>{
      if(!bootReady||departingOwner.current||departurePending||!client)return 'authUnavailable';
      try{const {error}=await client.auth.signInWithPassword({email,password});return error?'authFailed':null;}catch{return 'authFailed';}
    },
    createAccount:async(email,password)=>{
      if(!bootReady||departingOwner.current||departurePending||!client)return 'authUnavailable';
      try{const {data,error}=await client.auth.signUp({email,password});return error?'authFailed':data.session?null:'confirmEmail';}catch{return 'authFailed';}
    },
    signOut:async(discardUnsynced=false)=>{
      if(departurePending&&retryDeparture.current)return retryDeparture.current();
      const prepared=preparedSync.current;preparedSync.current=null;
      if(!departurePending)await (prepared?.engine===engine?prepared.flight:syncBeforeSignOut(()=>engine?.sync()??Promise.resolve()));
      if(currentRepo?.hasUnsynced() && !discardUnsynced)throw new Error('Unsynced changes require confirmation.');
      if(!bootReady||!currentRepo||departingOwner.current)throw new Error('Sign-out recovery required.');
      // Retain the original repository/session even if auth emits SIGNED_OUT before cleanup fails.
      const leave=async()=>{
        if(departingOwner.current)throw new Error('Sign-out recovery required.');
        departingOwner.current=currentRepo.owner;departureLocked.current=true;setDeparturePending(true);
        engine?.close();
        client?.auth.stopAutoRefresh();
        try {
          await lastOwnerStorage.clear();
          const marker=await beginSignOut(currentRepo.owner,signOutStorage);
          await completeSignOut(marker,currentRepo,signOutStorage,async()=>{
            if(client && session && (!activeSession.current || activeSession.current.user.id===session.user.id)) {
              client.auth.stopAutoRefresh();
              // Local scope only. A failed network revocation must still erase this device.
              try { await client.auth.signOut({scope:'local'}); } catch { /* device cleanup below */ }
              // A newer auth event owns its own credentials; never erase that session.
              if(!activeSession.current || activeSession.current.user.id===session.user.id)await clearLocalSession(true);
            } else if(!session && !activeSession.current)await clearLocalSession();
          });
        } catch {retryDeparture.current=leave;departingOwner.current=null;setDataError(true);setRecovery('departure');throw new DepartureFailure();}
        retryDeparture.current=null;departingOwner.current=null;departureLocked.current=false;setDeparturePending(false);setRecovery(undefined);setDataError(false);
        setDemo(false);
        if(activeSession.current?.user.id===session?.user.id)activeSession.current=null;
        setSession(current => current?.user.id === session?.user.id ? null : current);
      };
      await leave();
    },
    syncNow:()=>engine?.sync()??Promise.resolve(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
