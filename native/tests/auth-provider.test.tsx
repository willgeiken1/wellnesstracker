import { act, render, waitFor, fireEvent } from '@testing-library/react-native';
import { Account, LocalDataRecovery } from '../src/auth/screens';
import { ThemeProvider } from '../src/design/theme-provider';
import * as SecureStore from 'expo-secure-store';
import { AppState, Alert } from 'react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AuthProvider, useAuth, type AuthState } from '../src/auth/provider';
import { OWNER_A, OWNER_B, syntheticRow } from '../fixtures/sync';
import { openLocalDatabase } from '../src/data/database';
import { clearLocalSession, getAuthClient } from '../src/auth/client';
import { CorruptSignOutMarker } from '../src/auth/sign-out';
import { signOutStorage } from '../src/auth/sign-out-storage';
import { seedDemo } from '../fixtures/demo';
import { syncTables } from '../src/data/sync/flags';
import type { Repository } from '../src/data/repository';
import * as Network from 'expo-network';

jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),deleteItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('../src/auth/client', () => ({ getAuthClient: jest.fn(() => null), clearLocalSession: jest.fn(async()=>{}) }));
jest.mock('../src/auth/sign-out-storage',()=>({signOutStorage:{read:jest.fn(async()=>null),write:jest.fn(async()=>{}),remove:jest.fn(async()=>{})}}));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
jest.mock('../fixtures/demo', () => ({ seedDemo: jest.fn() }));
const mockTransportCreated=jest.fn();
const mockPush = jest.fn<Promise<void>, []>();
jest.mock('../src/data/sync/supabase', () => ({ SupabaseTransport: class {
  owner: string;
  constructor(_client: unknown, owner: string) { this.owner=owner;mockTransportCreated(owner); }
  push() { return mockPush(); }
  async pull() { return []; }
}}));
jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }));

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function session(owner: string) { return { user: { id: owner, email: 'fixture@example.test' } } as Session; }
function fixtureRepo(owner: string) {
  const listeners = new Set<() => void>();
  let pending = owner === OWNER_A ? [{ row: syntheticRow(), revision: '100:fixture' }] : [];
  return {
    owner, syncTables: () => syncTables(), pending: () => pending, conflicts: () => [],
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ack: jest.fn(() => { pending = []; listeners.forEach(l => l()); }),
    wipe: jest.fn(() => {pending=[];listeners.forEach(l=>l());}), hasUnsynced:()=>pending.length>0,unsyncedCount:()=>pending.length,
    cursor: () => '0', applyPage: jest.fn(),
  } as unknown as Repository;
}
function clientFixture(initial: Session | null = session(OWNER_A)) {
  let emit!: (event: string, value: Session | null) => void;
  const unsubscribe = jest.fn();
  const auth = {
    getSession: jest.fn(async () => ({ data: { session: initial }, error: null })),
    onAuthStateChange: jest.fn(callback => { emit = callback; return { data: { subscription: { unsubscribe } } }; }),
    startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(),
    signOut: jest.fn(async () => ({ error: null })),
    signInWithPassword: jest.fn(async () => ({ error: null })),
    signUp: jest.fn(async () => ({ data: { session: null }, error: null })),
  };
  return { client: { auth } as unknown as SupabaseClient, auth, emit: (value: Session | null) => emit('SIGNED_IN', value), unsubscribe };
}
const storedItems=new Map<string,string>();
const ownerKey='insight.last-signed-in-owner.v1';
let observed: AuthState;
function Probe() { observed = useAuth(); return null; }
beforeEach(() => { storedItems.clear();jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async key=>storedItems.get(key)??null);jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async(key,value)=>{storedItems.set(key,value);});jest.mocked(SecureStore.deleteItemAsync).mockReset().mockImplementation(async key=>{storedItems.delete(key);}); mockTransportCreated.mockClear(); jest.mocked(signOutStorage.read).mockReset();jest.mocked(signOutStorage.read).mockResolvedValue(null);jest.mocked(signOutStorage.write).mockReset();jest.mocked(signOutStorage.write).mockResolvedValue();jest.mocked(signOutStorage.remove).mockReset();jest.mocked(signOutStorage.remove).mockResolvedValue();jest.mocked(getAuthClient).mockReset();jest.mocked(getAuthClient).mockReturnValue(null);jest.mocked(clearLocalSession).mockReset();jest.mocked(clearLocalSession).mockResolvedValue(); jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({remove:jest.fn()})); mockPush.mockReset(); mockPush.mockResolvedValue(undefined); });

test('restores session, reacts to AppState, switches A to B during upload and isolates pending rows', async () => {
  const a = fixtureRepo(OWNER_A), b = fixtureRepo(OWNER_B), guest = fixtureRepo('guest');
  jest.mocked(openLocalDatabase).mockResolvedValue({ wipeAll:jest.fn(),forOwner: owner => owner === OWNER_A ? a : owner === OWNER_B ? b : guest });
  const push = deferred<void>(); mockPush.mockReturnValueOnce(push.promise);
  const fixture = clientFixture();
  const app = jest.spyOn(AppState, 'addEventListener');
  const view = await render(<AuthProvider client={fixture.client}><Probe /></AuthProvider>);
  await waitFor(() => expect(observed.repository).toBe(a));
  expect(observed.bootExportOwner?.()).toBe(OWNER_A);
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  const refresh = app.mock.calls[0][1];
  await act(async () => { refresh('background'); refresh('active'); });
  expect(fixture.auth.startAutoRefresh).toHaveBeenCalled(); expect(fixture.auth.stopAutoRefresh).toHaveBeenCalled();
  await act(async () => { fixture.emit(session(OWNER_B)); });
  await waitFor(() => expect(observed.repository).toBe(b));
  expect(observed.bootExportOwner?.()).toBe(OWNER_B);
  expect(observed.pending).toBe(0);
  await act(async () => { push.resolve(); await push.promise; });
  expect(a.ack).not.toHaveBeenCalled(); expect(a.pending()).toHaveLength(1);
  await act(async () => { fixture.emit(null); });
  await waitFor(() => expect(observed.repository).toBe(guest));
  expect(observed.session).toBeNull(); expect(observed.demo).toBe(false);
  expect(observed.bootExportOwner?.()).toBeNull();
  await view.unmount(); expect(fixture.unsubscribe).toHaveBeenCalled(); app.mockRestore();
});
test('unset config enters isolated demo without a transport and can leave demo', async () => {
  const guest = fixtureRepo('guest'), demo = fixtureRepo('demo');
  jest.mocked(openLocalDatabase).mockResolvedValue({ wipeAll:jest.fn(),forOwner: owner => owner === 'demo' ? demo : guest });
  const view = await render(<AuthProvider client={null}><Probe /></AuthProvider>);
  await waitFor(() => expect(observed.ready).toBe(true));
  expect(observed.configured).toBe(false);
  await act(async () => { observed.lookAround(); });
  await waitFor(() => expect(observed.repository).toBe(demo));
  expect(seedDemo).toHaveBeenCalledWith(demo); expect(mockPush).not.toHaveBeenCalled();expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  await act(async () => { await observed.signOut(); });
  await waitFor(() => expect(observed.repository).toBe(guest));
  expect(observed.demo).toBe(false); expect(demo.wipe).toHaveBeenCalledTimes(1); await view.unmount();
});
test.each(['returned error','rejected network'])('sign-out %s still wipes locally and gates access with local scope', async failure => {
  const a=fixtureRepo(OWNER_A), b=fixtureRepo(OWNER_B), guest=fixtureRepo('guest');
  jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:owner===OWNER_B?b:guest});
  const fixture=clientFixture();const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
  await waitFor(()=>expect(observed.ready).toBe(true));
  if(failure==='returned error')fixture.auth.signOut.mockResolvedValueOnce({error:new Error('private fixture')} as never);
  else fixture.auth.signOut.mockRejectedValueOnce(new Error('private fixture'));
  await act(async()=>{await observed.signOut();});
  await waitFor(()=>expect(observed.repository).toBe(guest));
  expect(a.wipe).toHaveBeenCalledTimes(1);expect(observed.session).toBeNull();
  expect(fixture.auth.signOut).toHaveBeenCalledWith({scope:'local'});
  expect(require('../src/auth/client').clearLocalSession).toHaveBeenCalled();
  await act(async()=>{fixture.emit(session(OWNER_B));});
  await waitFor(()=>expect(observed.repository).toBe(b));expect(observed.pending).toBe(0);
  expect(b.wipe).not.toHaveBeenCalled();await view.unmount();
});
test('sign-out attempts sync and refuses to discard unsynced rows without warning acknowledgment',async()=>{
 const a=fixtureRepo(OWNER_A);mockPush.mockRejectedValue(new Error('offline fixture'));
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const fixture=clientFixture(),view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.repository).toBe(a));
 await act(async()=>{await expect(observed.signOut()).rejects.toThrow('Unsynced changes require confirmation.');});
 expect(mockPush).toHaveBeenCalled();expect(a.wipe).not.toHaveBeenCalled();expect(fixture.auth.signOut).not.toHaveBeenCalled();
 await act(async()=>{await observed.signOut(true);});
 expect(a.wipe).toHaveBeenCalledTimes(1);await view.unmount();
});
test('a newer auth event wins over delayed session restoration', async () => {
  const fixture = clientFixture(), restored = deferred<{data:{session:Session|null};error:null}>();
  fixture.auth.getSession.mockReturnValue(restored.promise);
  jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner: fixtureRepo});
  const view = await render(<AuthProvider client={fixture.client}><Probe /></AuthProvider>);
  await act(async () => { fixture.emit(session(OWNER_B)); restored.resolve({data:{session:session(OWNER_A)},error:null}); });
  await waitFor(() => expect(observed.repository?.owner).toBe(OWNER_B));
  expect(observed.session?.user.id).toBe(OWNER_B);
  expect(Network.addNetworkStateListener).toHaveBeenCalled(); await view.unmount();
});
test('StrictMode effect cleanup can restart sync subscriptions safely',async()=>{
 const {StrictMode}=require('react') as typeof import('react');
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:fixtureRepo});
 const fixture=clientFixture();const view=await render(<StrictMode><AuthProvider client={fixture.client}><Probe/></AuthProvider></StrictMode>);
 await waitFor(()=>expect(observed.ready).toBe(true));
 await act(async()=>{await observed.syncNow();});
 expect(observed.syncStatus).toBe('idle');expect(mockPush).toHaveBeenCalled();await view.unmount();
});
test('late sign-out completion cannot clear a newer account event',async()=>{
 const fixture=clientFixture(),signedOut=deferred<{error:null}>();
 fixture.auth.signOut.mockReturnValue(signedOut.promise);
 const repos=new Map<string,Repository>();
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>{if(!repos.has(owner))repos.set(owner,fixtureRepo(owner));return repos.get(owner)!;}});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.repository?.owner).toBe(OWNER_A));
 let leaving!:Promise<void>;
 await act(async()=>{leaving=observed.signOut();});
 await waitFor(()=>expect(fixture.auth.signOut).toHaveBeenCalled());
 await act(async()=>{fixture.emit(session(OWNER_B));});
 await waitFor(()=>expect(observed.repository?.owner).toBe(OWNER_B));
 await act(async()=>{signedOut.resolve({error:null});await leaving;});
 expect(observed.session?.user.id).toBe(OWNER_B);expect(observed.repository?.owner).toBe(OWNER_B);expect(observed.ready).toBe(true);
 await view.unmount();
});

test('provider independently awaits a fresh sync before wiping and signing out',async()=>{
 const a=fixtureRepo(OWNER_A),fixture=clientFixture();
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(a.ack).toHaveBeenCalled());
 const sync=jest.spyOn(require('../src/data/sync/engine').SyncEngine.prototype,'sync');
 const flight=deferred<void>();sync.mockReturnValueOnce(flight.promise);
 let leaving!:Promise<void>;await act(async()=>{leaving=observed.signOut();});
 expect(sync).toHaveBeenCalledTimes(1);expect(a.wipe).not.toHaveBeenCalled();expect(fixture.auth.signOut).not.toHaveBeenCalled();
 await act(async()=>{flight.resolve();await leaving;});expect(a.wipe).toHaveBeenCalledTimes(1);
 sync.mockRestore();await view.unmount();
});
test('newer session before pre-sync completes prevents old sign-out from invoking auth signOut',async()=>{
 const fixture=clientFixture(),a=fixtureRepo(OWNER_A);
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(a.ack).toHaveBeenCalled());
 const flight=deferred<void>(),sync=jest.spyOn(require('../src/data/sync/engine').SyncEngine.prototype,'sync').mockReturnValueOnce(flight.promise);
 let leaving!:Promise<void>;await act(async()=>{leaving=observed.signOut();fixture.emit(session(OWNER_B));});
 await act(async()=>{flight.resolve();await leaving;});
 expect(fixture.auth.signOut).not.toHaveBeenCalled();expect(clearLocalSession).not.toHaveBeenCalled();
 expect(observed.session?.user.id).toBe(OWNER_B);sync.mockRestore();await view.unmount();
});
test('newer session during auth signOut prevents old completion from erasing SecureStore',async()=>{
 const fixture=clientFixture(),flight=deferred<{error:null}>();fixture.auth.signOut.mockReturnValue(flight.promise);
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:fixtureRepo});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.repository?.owner).toBe(OWNER_A));
 let leaving!:Promise<void>;await act(async()=>{leaving=observed.signOut();});
 await waitFor(()=>expect(fixture.auth.signOut).toHaveBeenCalledTimes(1));
 await act(async()=>{fixture.emit(session(OWNER_B));flight.resolve({error:null});await leaving;});
 expect(clearLocalSession).not.toHaveBeenCalled();expect(observed.session?.user.id).toBe(OWNER_B);await view.unmount();
});

test('provider sync timeout reaches the unsynced guard instead of hanging sign-out',async()=>{
 const a=fixtureRepo(OWNER_A),fixture=clientFixture();mockPush.mockRejectedValue(new Error('offline fixture'));
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.syncStatus).toBe('offline'));
 const sync=jest.spyOn(require('../src/data/sync/engine').SyncEngine.prototype,'sync').mockReturnValueOnce(new Promise<void>(()=>{}));
 jest.useFakeTimers();
 try {
  let error:unknown;let finished=false;
  const leaving=observed.signOut().catch(cause=>{error=cause;}).finally(()=>{finished=true;});
  await act(async()=>{jest.advanceTimersByTime(9999);});expect(finished).toBe(false);expect(a.wipe).not.toHaveBeenCalled();
  await act(async()=>{jest.advanceTimersByTime(1);await leaving;});
  expect(error).toEqual(new Error('Unsynced changes require confirmation.'));
  expect(fixture.auth.signOut).not.toHaveBeenCalled();
 } finally {sync.mockRestore();await view.unmount();jest.useRealTimers();}
});

test.each(['pending','wiped','session-cleared'] as const)('boot recovers %s departure before restoring session or starting sync',async phase=>{
 const a=fixtureRepo(OWNER_A),guest=fixtureRepo('guest'),fixture=clientFixture();
 if(phase!=='pending')a.wipe();
 let marker:Awaited<ReturnType<typeof signOutStorage.read>>={owner:OWNER_A,startedAt:1234,phase};
 jest.mocked(signOutStorage.read).mockImplementation(async()=>marker);
 jest.mocked(signOutStorage.write).mockImplementation(async value=>{marker=value;});
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{marker=null;});
 fixture.auth.getSession.mockImplementation(async()=>({data:{session:null},error:null}));
 const clear=deferred<void>();jest.mocked(clearLocalSession).mockReturnValue(clear.promise);
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:guest});
 const view=await render(<AuthProvider client={fixture.client}><RecoveryProbe/></AuthProvider>);
 expect(view.queryByRole('button',{name:'Erase all local data and sign out'})).toBeNull();
 if(phase!=='session-cleared') {
  await waitFor(()=>expect(clearLocalSession).toHaveBeenCalled());
  expect(observed.ready).toBe(false);expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(fixture.auth.onAuthStateChange).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
  await act(async()=>{clear.resolve();});
 }
 await waitFor(()=>expect(observed.ready).toBe(true));
 expect(observed.recovery).toBeUndefined();expect(observed.session).toBeNull();expect(observed.repository?.owner).toBe('guest');expect(a.pending()).toEqual([]);expect(marker).toBeNull();expect(mockPush).not.toHaveBeenCalled();
 if(phase==='session-cleared')expect(clearLocalSession).not.toHaveBeenCalled();
 await view.unmount();
});
test('marker read failure blocks even production client creation and demo entry',async()=>{
 jest.mocked(signOutStorage.read).mockRejectedValue(new Error('synthetic storage locked'));
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:fixtureRepo});
 const view=await render(<AuthProvider><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.configError).toBeTruthy());
 expect(getAuthClient).not.toHaveBeenCalled();expect(observed.ready).toBe(false);
 await act(async()=>{observed.lookAround();});expect(observed.demo).toBe(false);expect(mockPush).not.toHaveBeenCalled();await view.unmount();
});
test.each([false,true])('normal sign-out writes its durable marker before wiping (demo=%s)',async demo=>{
 const owner=demo?'demo':OWNER_A,repo=fixtureRepo(owner),fixture=clientFixture();
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:id=>id===owner?repo:fixtureRepo(id)});
 const view=await render(<AuthProvider client={demo?null:fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.ready).toBe(true));
 if(demo){await act(async()=>{observed.lookAround();});await waitFor(()=>expect(observed.repository?.owner).toBe('demo'));}
 const order:string[]=[];
 jest.mocked(signOutStorage.write).mockImplementation(async marker=>{order.push(marker.phase);});
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{order.push('remove');});
 jest.spyOn(repo,'wipe').mockImplementation(()=>{order.push('wipe');});
 jest.mocked(clearLocalSession).mockImplementation(async()=>{order.push('session');});
 await act(async()=>{await observed.signOut();});
 expect(order).toEqual(['pending','wipe','wiped','session','session-cleared','remove']);
 if(demo)expect(clearLocalSession).toHaveBeenCalledWith();else expect(clearLocalSession).toHaveBeenCalledWith(true);
 expect(observed.session).toBeNull();expect(observed.demo).toBe(false);await view.unmount();
});

test('production client factory runs only after pending recovery removes the marker',async()=>{
 const fixture=clientFixture(null),clear=deferred<void>(),guest=fixtureRepo('guest');
 let marker:Awaited<ReturnType<typeof signOutStorage.read>>={owner:OWNER_A,startedAt:1234,phase:'wiped'};
 jest.mocked(signOutStorage.read).mockImplementation(async()=>marker);
 jest.mocked(signOutStorage.write).mockImplementation(async next=>{marker=next;});
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{marker=null;});
 jest.mocked(clearLocalSession).mockReturnValue(clear.promise);
 jest.mocked(getAuthClient).mockImplementation(()=>{expect(marker).toBeNull();return fixture.client;});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?fixtureRepo(owner):guest});
 const view=await render(<AuthProvider><Probe/></AuthProvider>);
 await waitFor(()=>expect(clearLocalSession).toHaveBeenCalledTimes(1));
 expect(getAuthClient).not.toHaveBeenCalled();expect(fixture.auth.getSession).not.toHaveBeenCalled();
 await act(async()=>{clear.resolve();});await waitFor(()=>expect(observed.ready).toBe(true));
 expect(getAuthClient).toHaveBeenCalledTimes(1);expect(observed.session).toBeNull();await view.unmount();
});
test('pending departure blocks old auth events, manual sync and foreground auto-refresh',async()=>{
 const fixture=clientFixture(),a=fixtureRepo(OWNER_A),clear=deferred<void>();
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(a.ack).toHaveBeenCalled());
 jest.mocked(clearLocalSession).mockReturnValue(clear.promise);
 const transports=mockTransportCreated.mock.calls.length;
 let leaving!:Promise<void>;await act(async()=>{leaving=observed.signOut();});
 await waitFor(()=>expect(clearLocalSession).toHaveBeenCalledTimes(1));
 expect(observed.bootExportOwner?.()).toBeNull();
 expect(mockTransportCreated).toHaveBeenCalledTimes(transports);
 const pushes=mockPush.mock.calls.length;fixture.auth.startAutoRefresh.mockClear();
 await act(async()=>{
  fixture.emit(session(OWNER_A));
  jest.mocked(AppState.addEventListener).mock.calls[0][1]('active');
  await observed.syncNow();
 });
 expect(observed.ready).toBe(false);expect(mockPush).toHaveBeenCalledTimes(pushes);expect(fixture.auth.startAutoRefresh).not.toHaveBeenCalled();
 await act(async()=>{clear.resolve();await leaving;});expect(observed.session).toBeNull();await view.unmount();
});
test('failed recovery wipe keeps the marker and blocks auth restoration',async()=>{
 const fixture=clientFixture(),a=fixtureRepo(OWNER_A),marker={owner:OWNER_A,startedAt:1234,phase:'pending' as const};
 jest.mocked(signOutStorage.read).mockResolvedValue(marker);jest.spyOn(a,'wipe').mockImplementation(()=>{throw new Error('synthetic locked database');});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:()=>a});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.configError).toBeTruthy());
 expect(observed.ready).toBe(false);expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
 expect(signOutStorage.remove).not.toHaveBeenCalled();expect(clearLocalSession).not.toHaveBeenCalled();await view.unmount();
});

test('failed durable marker write prevents wipe and keeps auth/sync gated with a recovery error',async()=>{
 const fixture=clientFixture(),a=fixtureRepo(OWNER_A);
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(a.ack).toHaveBeenCalled());
 jest.mocked(signOutStorage.write).mockRejectedValueOnce(new Error('synthetic locked store'));
 await act(async()=>{await expect(observed.signOut()).rejects.toThrow();});
 expect(a.wipe).not.toHaveBeenCalled();expect(observed.ready).toBe(false);expect(observed.configError).toBeTruthy();
 expect(fixture.auth.signOut).not.toHaveBeenCalled();await view.unmount();
});

test.each(['wipe','marker','session','remove'])('failed %s departure releases its retry gate without enabling sync; second sign-out succeeds',async failure=>{
 const fixture=clientFixture(),a=fixtureRepo(OWNER_A);let marker:Awaited<ReturnType<typeof signOutStorage.read>>=null;
 jest.mocked(signOutStorage.read).mockImplementation(async()=>marker);
 jest.mocked(signOutStorage.write).mockImplementation(async next=>{marker=next;});
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{marker=null;});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(a.ack).toHaveBeenCalled());
 fixture.auth.signOut.mockImplementation(async()=>{fixture.emit(null);return {error:null};});
 if(failure==='wipe')jest.spyOn(a,'wipe').mockImplementationOnce(()=>{throw new Error('synthetic failure');});
 if(failure==='marker')jest.mocked(signOutStorage.write).mockRejectedValueOnce(new Error('synthetic'));
 if(failure==='session')jest.mocked(clearLocalSession).mockRejectedValueOnce(new Error('synthetic'));
 if(failure==='remove')jest.mocked(signOutStorage.remove).mockRejectedValueOnce(new Error('synthetic'));
 await act(async()=>{await expect(observed.signOut()).rejects.toThrow();});
 const pushes=mockPush.mock.calls.length,lockedSession=observed.session;
 await act(async()=>{expect(await observed.signIn('fixture@example.test','synthetic')).toBe('authUnavailable');fixture.emit(session(OWNER_B));fixture.emit(null);await observed.syncNow();});
 expect(fixture.auth.signInWithPassword).not.toHaveBeenCalled();expect(observed.session).toBe(lockedSession);expect(observed.recovery).toBe('departure');expect(observed.bootExportOwner?.()).toBeNull();expect(mockPush).toHaveBeenCalledTimes(pushes);expect(observed.ready).toBe(false);
 await act(async()=>{await observed.signOut(true);});
 expect(marker).toBeNull();expect(observed.session).toBeNull();expect(observed.ready).toBe(true);await view.unmount();
});

function RecoveryProbe(){return <ThemeProvider><Probe/><LocalDataRecovery/></ThemeProvider>;}
test.each(['corrupt','unreadable'])('%s marker offers confirmed escape and lands signed out',async kind=>{
 const fixture=clientFixture(null),order:string[]=[];
 let marker=true,storedSession=true;
 const realStorage=(jest.requireActual('../src/auth/sign-out-storage') as typeof import('../src/auth/sign-out-storage')).signOutStorage;
 if(kind==='corrupt')jest.mocked(SecureStore.getItemAsync).mockResolvedValue('{invalid-json');
 else jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('synthetic read failure'));
 jest.mocked(signOutStorage.read).mockImplementation(async()=>marker?realStorage.read():null);
 const wipeAll=jest.fn(()=>{order.push('wipe');});
 jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:fixtureRepo,wipeAll});
 jest.mocked(clearLocalSession).mockImplementation(async()=>{expect(marker).toBe(true);order.push('session');storedSession=false;});
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{expect(storedSession).toBe(false);order.push('remove');marker=false;});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const view=await render(<AuthProvider client={fixture.client}><RecoveryProbe/></AuthProvider>);
 if(kind==='unreadable'){for(let i=0;i<2;i++){await waitFor(()=>expect(view.getByRole('button',{name:'Try again'})).toBeTruthy());await fireEvent.press(view.getByRole('button',{name:'Try again'}));}}
 await waitFor(()=>expect(view.getByRole('button',{name:'Erase all local data and sign out'})).toBeTruthy());
 expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
 await fireEvent.press(view.getByRole('button',{name:'Erase all local data and sign out'}));
 expect(wipeAll).not.toHaveBeenCalled();expect(alert.mock.calls[0][1]).toContain('all accounts');expect(alert.mock.calls[0][1]).toContain('Synced data stays in your account');
 await act(async()=>{alert.mock.calls[0][2]![1].onPress?.();});
 await waitFor(()=>expect(observed.ready).toBe(true));
 expect(order).toEqual(['wipe','session','remove']);expect(clearLocalSession).toHaveBeenCalledWith(true);
 expect(marker).toBe(false);expect(storedSession).toBe(false);expect(observed.session).toBeNull();expect(observed.demo).toBe(false);expect(mockPush).not.toHaveBeenCalled();
 expect(view.queryByRole('button',{name:'Erase all local data and sign out'})).toBeNull();alert.mockRestore();await view.unmount();
});

test.each(['wipe','session','remove'])('escape %s failure keeps marker, stays locked and allows retry',async failure=>{
 const fixture=clientFixture();let marker=true,storedSession=true;
 jest.mocked(signOutStorage.read).mockRejectedValue(new CorruptSignOutMarker());
 const wipeAll=jest.fn();if(failure==='wipe')wipeAll.mockImplementationOnce(()=>{throw new Error('synthetic');});
 jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:fixtureRepo,wipeAll});
 jest.mocked(clearLocalSession).mockImplementation(async()=>{storedSession=false;});
 if(failure==='session')jest.mocked(clearLocalSession).mockRejectedValueOnce(new Error('synthetic'));
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{marker=false;});
 if(failure==='remove')jest.mocked(signOutStorage.remove).mockRejectedValueOnce(new Error('synthetic'));
 let view=await render(<AuthProvider client={fixture.client}><RecoveryProbe/></AuthProvider>);
 await waitFor(()=>expect(observed.recovery).toBe('corrupt-marker'));
 await act(async()=>{await expect(observed.recoverLocalData!()).rejects.toThrow();});
 expect(marker).toBe(true);expect(observed.ready).toBe(false);expect(observed.session).toBeNull();
 expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(fixture.auth.onAuthStateChange).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
 expect(view.getByText('Recovery did not finish. The app is still locked. Try again.')).toBeTruthy();
 if(failure==='wipe'){expect(storedSession).toBe(true);expect(clearLocalSession).not.toHaveBeenCalled();}
 if(failure!=='remove')expect(signOutStorage.remove).not.toHaveBeenCalled();
 await view.unmount();
 view=await render(<AuthProvider client={fixture.client}><RecoveryProbe/></AuthProvider>);
 await waitFor(()=>expect(view.getByRole('button',{name:'Erase all local data and sign out'})).toBeTruthy());
 expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
 fixture.auth.getSession.mockResolvedValue({data:{session:null},error:null});
 await act(async()=>{await observed.recoverLocalData!();});expect(marker).toBe(false);
 await waitFor(()=>expect(observed.ready).toBe(true));expect(observed.session).toBeNull();await view.unmount();
});

test('screen and provider share one pre-sync: warning and confirmed departure fit a single 10s cap',async()=>{
 const fixture=clientFixture(),a=fixtureRepo(OWNER_A);mockPush.mockRejectedValue(new Error('synthetic offline'));
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?a:fixtureRepo(owner)});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const view=await render(<AuthProvider client={fixture.client}><ThemeProvider><Probe/><Account/></ThemeProvider></AuthProvider>);
 await waitFor(()=>expect(observed.syncStatus).toBe('offline'));
 const sync=jest.spyOn(require('../src/data/sync/engine').SyncEngine.prototype,'sync').mockReturnValue(new Promise<void>(()=>{}));
 jest.useFakeTimers();const started=Date.now();
 try {
  await fireEvent.press(view.getByRole('button',{name:'Sign out'}));
  await act(async()=>{jest.advanceTimersByTime(9999);});expect(alert).not.toHaveBeenCalled();
  await act(async()=>{jest.advanceTimersByTime(1);});expect(alert).toHaveBeenCalledTimes(1);
  expect(Date.now()-started).toBeLessThanOrEqual(10000);
  await act(async()=>{alert.mock.calls[0][2]![1].onPress?.();});
  expect(a.wipe).toHaveBeenCalledTimes(1);expect(observed.session).toBeNull();
  expect(sync).toHaveBeenCalledTimes(1);expect(Date.now()-started).toBeLessThanOrEqual(10000);
 } finally {sync.mockRestore();alert.mockRestore();await view.unmount();jest.useRealTimers();}
});


test.each([OWNER_A,'demo'])('boot recovery clears %s session with the exact strictness argument',async owner=>{
 jest.mocked(signOutStorage.read).mockResolvedValue({owner,startedAt:1234,phase:'wiped'});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:fixtureRepo});
 const view=await render(<AuthProvider client={null}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.ready).toBe(true));
 expect(jest.mocked(clearLocalSession).mock.calls).toEqual(owner==='demo'?[[]]:[[true]]);
 await view.unmount();
});
test('transient read failure offers only retry; successful reread resumes normal owner recovery',async()=>{
 const fixture=clientFixture(null),repo=fixtureRepo(OWNER_A);
 jest.mocked(signOutStorage.read).mockRejectedValueOnce(new Error('synthetic')).mockResolvedValue({owner:OWNER_A,startedAt:1234,phase:'pending'});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>owner===OWNER_A?repo:fixtureRepo(owner)});
 const view=await render(<AuthProvider client={fixture.client}><RecoveryProbe/></AuthProvider>);
 await waitFor(()=>expect(view.getByRole('button',{name:'Try again'})).toBeTruthy());
 expect(view.queryByRole('button',{name:'Erase all local data and sign out'})).toBeNull();
 expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
 await fireEvent.press(view.getByRole('button',{name:'Try again'}));
 await waitFor(()=>expect(observed.ready).toBe(true));
 expect(signOutStorage.read).toHaveBeenCalledTimes(2);expect(repo.wipe).toHaveBeenCalledTimes(1);expect(clearLocalSession).toHaveBeenCalledWith(true);
 await view.unmount();
});
test.each([false,true])('three consecutive read failures offer escape; reread resumes normal recovery (wipe failure=%s)',async wipeFails=>{
 const fixture=clientFixture();jest.mocked(signOutStorage.read).mockRejectedValue(new Error('synthetic'));
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:fixtureRepo});
 const view=await render(<AuthProvider client={fixture.client}><RecoveryProbe/></AuthProvider>);
 for(let failures=1;failures<=3;failures++){
  await waitFor(()=>expect(signOutStorage.read).toHaveBeenCalledTimes(failures));
  expect(observed.ready).toBe(false);expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
  if(failures<3){expect(view.queryByRole('button',{name:'Erase all local data and sign out'})).toBeNull();await fireEvent.press(view.getByRole('button',{name:'Try again'}));}
 }
 await waitFor(()=>expect(view.getByRole('button',{name:'Erase all local data and sign out'})).toBeTruthy());
 jest.mocked(signOutStorage.read).mockResolvedValue(wipeFails?{owner:OWNER_A,startedAt:1234,phase:'pending'}:null);fixture.auth.getSession.mockResolvedValue({data:{session:null},error:null});
 if(wipeFails){const repo=fixtureRepo(OWNER_A);jest.spyOn(repo,'wipe').mockImplementation(()=>{throw new Error('synthetic');});jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:()=>repo});}
 await fireEvent.press(view.getByRole('button',{name:'Try again'}));
 if(wipeFails){await waitFor(()=>expect(observed.recovery).toBe('boot-error'));expect(observed.ready).toBe(false);expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(view.queryByRole('button',{name:'Erase all local data and sign out'})).toBeNull();}
 else await waitFor(()=>expect(observed.ready).toBe(true));
 expect(clearLocalSession).not.toHaveBeenCalled();await view.unmount();
});
test.each([false,true])('escape warning counts all-owner pending changes, gracefully handles count failure=%s',async fail=>{
 jest.mocked(signOutStorage.read).mockRejectedValue(new CorruptSignOutMarker());
 const countAllUnsynced=jest.fn(()=>{if(fail)throw new Error('synthetic');return 7;});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:fixtureRepo,countAllUnsynced});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const view=await render(<AuthProvider client={null}><RecoveryProbe/></AuthProvider>);
 await waitFor(()=>expect(observed.recovery).toBe('corrupt-marker'));
 await fireEvent.press(view.getByRole('button',{name:'Erase all local data and sign out'}));
 await waitFor(()=>expect(alert).toHaveBeenCalled());
 expect(countAllUnsynced).toHaveBeenCalledTimes(1);
 expect(alert.mock.calls[0][1]).toContain(fail?'Unsynced changes on this phone will be lost.':'7 unsynced changes will be lost');
 if(fail)expect(alert.mock.calls[0][1]).not.toMatch(/\d/);
 alert.mockRestore();await view.unmount();
});

test.each([1,2])('provider safely ignores erase-all after only %s consecutive marker read failures without relying on the UI',async failures=>{
 const fixture=clientFixture(),wipeAll=jest.fn();let marker=true;
 jest.mocked(signOutStorage.read).mockRejectedValue(new Error('synthetic read failure'));
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{marker=false;});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll,forOwner:fixtureRepo});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 try {
  for(let count=1;count<=failures;count++){
   await waitFor(()=>expect(signOutStorage.read).toHaveBeenCalledTimes(count));
   await waitFor(()=>expect(observed.recovery).toBe('read-error'));
   if(count<failures)await act(async()=>{observed.retryMarkerRead!();});
  }
  await act(async()=>{
   await expect(observed.recoverLocalData!()).resolves.toBeUndefined();
   expect(wipeAll).not.toHaveBeenCalled();expect(clearLocalSession).not.toHaveBeenCalled();
   expect(signOutStorage.remove).not.toHaveBeenCalled();expect(marker).toBe(true);
   expect(observed.ready).toBe(false);expect(observed.recovery).toBe('read-error');
   expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
   expect(observed.session).toBeNull();expect(observed.repository).toBeNull();
  });
 } finally {await view.unmount();}
});


test('a different boot error resets consecutive marker read failures before escape is offered',async()=>{
 const fixture=clientFixture(),wipeAll=jest.fn();let marker=true;
 jest.mocked(signOutStorage.read).mockRejectedValue(new Error('synthetic read failure'));
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{marker=false;});
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll,forOwner:fixtureRepo});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 try {
  await waitFor(()=>expect(observed.recovery).toBe('read-error'));
  await act(async()=>{observed.retryMarkerRead!();});
  await waitFor(()=>expect(signOutStorage.read).toHaveBeenCalledTimes(2));
  expect(observed.recovery).toBe('read-error');
  jest.mocked(openLocalDatabase).mockRejectedValueOnce(new Error('synthetic database boot failure'));
  await act(async()=>{observed.retryMarkerRead!();});
  await waitFor(()=>expect(observed.configError).toBe('Local data is unavailable.'));
  expect(observed.recovery).toBe('boot-error');expect(signOutStorage.read).toHaveBeenCalledTimes(2);
  for(let count=3;count<=4;count++){
   await act(async()=>{if(count===3)observed.retryBoot!();else observed.retryMarkerRead!();});
   await waitFor(()=>expect(signOutStorage.read).toHaveBeenCalledTimes(count));
   expect(observed.recovery).toBe('read-error');expect(observed.ready).toBe(false);
   await act(async()=>{await expect(observed.recoverLocalData!()).resolves.toBeUndefined();});
   expect(wipeAll).not.toHaveBeenCalled();expect(clearLocalSession).not.toHaveBeenCalled();
   expect(signOutStorage.remove).not.toHaveBeenCalled();expect(marker).toBe(true);
  }
  await act(async()=>{observed.retryMarkerRead!();});
  await waitFor(()=>expect(observed.recovery).toBe('unreadable-marker'));
  expect(signOutStorage.read).toHaveBeenCalledTimes(5);expect(observed.ready).toBe(false);
  expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
 } finally {await view.unmount();}
});

test.each(['migration','locked database','database open','recovery wipe','session clear'])('boot %s fault shows calm recovery; Retry starts over after fault clears',async failure=>{
 const repo=fixtureRepo(OWNER_A),wipeAll=jest.fn();
 let marker:Awaited<ReturnType<typeof signOutStorage.read>>=failure==='recovery wipe'?{owner:OWNER_A,startedAt:1,phase:'pending'}:failure==='session clear'?{owner:OWNER_A,startedAt:1,phase:'wiped'}:null;
 jest.mocked(signOutStorage.read).mockImplementation(async()=>marker);
 jest.mocked(signOutStorage.write).mockImplementation(async next=>{marker=next;});
 jest.mocked(signOutStorage.remove).mockImplementation(async()=>{marker=null;});
 jest.mocked(openLocalDatabase).mockReset();
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll,forOwner:owner=>owner===OWNER_A?repo:fixtureRepo(owner)});
 if(['migration','locked database','database open'].includes(failure))jest.mocked(openLocalDatabase).mockRejectedValueOnce(new Error(`synthetic ${failure}`));
 if(failure==='recovery wipe')jest.mocked(repo.wipe).mockImplementationOnce(()=>{throw new Error('synthetic wipe failure');});
 if(failure==='session clear')jest.mocked(clearLocalSession).mockRejectedValueOnce(new Error('synthetic session failure'));
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const view=await render(<AuthProvider client={null}><RecoveryProbe/></AuthProvider>);
 await waitFor(()=>expect(view.getByRole('header',{name:'Let’s try opening the app again'})).toBeTruthy());
 expect(observed.ready).toBe(false);expect(getAuthClient).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
 expect(view.getByRole('button',{name:'Export local data'})).toBeTruthy();expect(view.getByRole('button',{name:'Contact support'})).toBeTruthy();
 expect(view.queryByText(`synthetic ${failure}`)).toBeNull();
 const opens=jest.mocked(openLocalDatabase).mock.calls.length,wipes=jest.mocked(repo.wipe).mock.calls.length;
 await fireEvent.press(view.getByRole('button',{name:'Retry'}));
 if(failure==='recovery wipe'){
   expect(jest.mocked(repo.wipe)).toHaveBeenCalledTimes(wipes);
   expect(alert).toHaveBeenCalled();
   jest.mocked(repo.wipe).mockClear();
   await act(async()=>{alert.mock.calls[0][2]![0].onPress?.();});
   expect(repo.wipe).not.toHaveBeenCalled();
   expect(clearLocalSession).not.toHaveBeenCalled();
   expect(signOutStorage.remove).not.toHaveBeenCalled();
   expect(observed.ready).toBe(false);
   await act(async()=>{alert.mock.calls[0][2]![1].onPress?.();});
 }
 await waitFor(()=>expect(observed.ready).toBe(true));
 expect(jest.mocked(openLocalDatabase).mock.calls.length).toBeGreaterThan(opens);
 expect(wipeAll).not.toHaveBeenCalled();
 if(failure!=='recovery wipe')expect(repo.wipe).not.toHaveBeenCalled();
 expect(view.queryByRole('button',{name:'Retry'})).toBeNull();
 alert.mockRestore();await view.unmount();
});

test('Retry after a database failure cannot silently resume a pending wipe',async()=>{
 const repo=fixtureRepo(OWNER_A),wipeAll=jest.fn();
 jest.mocked(openLocalDatabase).mockReset();jest.mocked(openLocalDatabase).mockRejectedValueOnce(new Error('synthetic migration failure')).mockResolvedValue({wipeAll,forOwner:()=>repo});
 jest.mocked(signOutStorage.read).mockResolvedValue({owner:OWNER_A,startedAt:1,phase:'pending'});
 const view=await render(<AuthProvider client={null}><RecoveryProbe/></AuthProvider>);
 await waitFor(()=>expect(observed.recovery).toBe('boot-error'));
 expect(observed.bootExportOwner?.()).toBeNull();
 await fireEvent.press(view.getByRole('button',{name:'Retry'}));
 await waitFor(()=>expect(observed.bootRetryNeedsConfirmation).toBe(true));
 expect(repo.wipe).not.toHaveBeenCalled();expect(wipeAll).not.toHaveBeenCalled();
 await act(async()=>{observed.retryBoot!();observed.retryMarkerRead!();});
 expect(repo.wipe).not.toHaveBeenCalled();expect(clearLocalSession).not.toHaveBeenCalled();
 expect(signOutStorage.remove).not.toHaveBeenCalled();expect(observed.ready).toBe(false);await view.unmount();
});

// OPEN 9: a DB boot fault must not require restoring credentials to scope a backup.
test('boot-error exports the stored owner with a non-null restorable client and no DB access',async()=>{
 storedItems.set(ownerKey,OWNER_A);
 const fixture=clientFixture(session(OWNER_A));
 jest.mocked(openLocalDatabase).mockRejectedValue(new Error('synthetic open failure'));
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.recovery).toBe('boot-error'));
 expect(observed.bootExportOwner?.()).toBe(OWNER_A);
 expect(observed.session).toBeNull();expect(observed.repository).toBeNull();
 expect(fixture.auth.getSession).not.toHaveBeenCalled();expect(fixture.auth.onAuthStateChange).not.toHaveBeenCalled();
 expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
 await view.unmount();
});
test.each(['pending','wiped','session-cleared','unreadable','corrupt'])('stored boot owner is blocked by a %s sign-out marker',async kind=>{
 storedItems.set(ownerKey,OWNER_A);
 if(kind==='unreadable')jest.mocked(signOutStorage.read).mockRejectedValue(new Error('synthetic marker failure'));
 else if(kind==='corrupt')jest.mocked(signOutStorage.read).mockRejectedValue(new CorruptSignOutMarker());
 else jest.mocked(signOutStorage.read).mockResolvedValue({owner:OWNER_A,startedAt:1,phase:kind as 'pending'|'wiped'|'session-cleared'});
 jest.mocked(openLocalDatabase).mockRejectedValue(new Error('synthetic open failure'));
 const view=await render(<AuthProvider client={clientFixture().client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.recovery).toBe('boot-error'));
 expect(observed.bootExportOwner?.()).toBeNull();await view.unmount();
});
test('session restore and real sign-in store only the id outside the database; sign-out clears it before wipe',async()=>{
 const repos=new Map<string,Repository>();
 jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:owner=>{
  if(!repos.has(owner))repos.set(owner,Object.assign(fixtureRepo(owner),{localSave:jest.fn(),putLocal:jest.fn()}));return repos.get(owner)!;
 }});
 const fixture=clientFixture(),view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(storedItems.get(ownerKey)).toBe(OWNER_A));
 await act(async()=>{fixture.emit(session(OWNER_B));});
 await waitFor(()=>expect(storedItems.get(ownerKey)).toBe(OWNER_B));
 expect(jest.mocked(SecureStore.setItemAsync).mock.calls.map(call=>call.slice(0,2))).toEqual([[ownerKey,OWNER_A],[ownerKey,OWNER_B]]);
 for(const repo of repos.values()){expect(repo.localSave).not.toHaveBeenCalled();expect(repo.putLocal).not.toHaveBeenCalled();}
 const b=repos.get(OWNER_B)!;
 jest.mocked(b.wipe).mockImplementation(()=>{expect(storedItems.has(ownerKey)).toBe(false);});
 await act(async()=>{await observed.signOut();});
 expect(storedItems.has(ownerKey)).toBe(false);expect(observed.bootExportOwner?.()).toBeNull();
 await view.unmount();
});
test.each(['demo','guest','not-an-owner'])('boot-error rejects a stored synthetic or invalid owner: %s',async owner=>{
 storedItems.set(ownerKey,owner);
 jest.mocked(openLocalDatabase).mockRejectedValue(new Error('synthetic open failure'));
 const view=await render(<AuthProvider client={clientFixture().client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.recovery).toBe('boot-error'));
 expect(observed.bootExportOwner?.()).toBeNull();expect(SecureStore.setItemAsync).not.toHaveBeenCalled();await view.unmount();
});
