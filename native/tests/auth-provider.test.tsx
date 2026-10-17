import { act, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AuthProvider, useAuth, type AuthState } from '../src/auth/provider';
import { OWNER_A, OWNER_B, syntheticRow } from '../fixtures/sync';
import { openLocalDatabase } from '../src/data/database';
import { seedDemo } from '../fixtures/demo';
import type { Repository } from '../src/data/repository';
import * as Network from 'expo-network';

jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
jest.mock('../fixtures/demo', () => ({ seedDemo: jest.fn() }));
const mockPush = jest.fn<Promise<void>, []>();
jest.mock('../src/data/sync/supabase', () => ({ SupabaseTransport: class {
  owner: string;
  constructor(_client: unknown, owner: string) { this.owner=owner; }
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
    owner, pending: () => pending,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ack: jest.fn(() => { pending = []; listeners.forEach(l => l()); }),
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
let observed: AuthState;
function Probe() { observed = useAuth(); return null; }
beforeEach(() => { jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({remove:jest.fn()})); mockPush.mockReset(); mockPush.mockResolvedValue(undefined); });

test('restores session, reacts to AppState, switches A to B during upload and isolates pending rows', async () => {
  const a = fixtureRepo(OWNER_A), b = fixtureRepo(OWNER_B), guest = fixtureRepo('guest');
  jest.mocked(openLocalDatabase).mockResolvedValue({ forOwner: owner => owner === OWNER_A ? a : owner === OWNER_B ? b : guest });
  const push = deferred<void>(); mockPush.mockReturnValueOnce(push.promise);
  const fixture = clientFixture();
  const app = jest.spyOn(AppState, 'addEventListener');
  const view = await render(<AuthProvider client={fixture.client}><Probe /></AuthProvider>);
  await waitFor(() => expect(observed.repository).toBe(a));
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  const refresh = app.mock.calls[0][1];
  await act(async () => { refresh('background'); refresh('active'); });
  expect(fixture.auth.startAutoRefresh).toHaveBeenCalled(); expect(fixture.auth.stopAutoRefresh).toHaveBeenCalled();
  await act(async () => { fixture.emit(session(OWNER_B)); });
  await waitFor(() => expect(observed.repository).toBe(b));
  expect(observed.pending).toBe(0);
  await act(async () => { push.resolve(); await push.promise; });
  expect(a.ack).not.toHaveBeenCalled(); expect(a.pending()).toHaveLength(1);
  await act(async () => { fixture.emit(null); });
  await waitFor(() => expect(observed.repository).toBe(guest));
  expect(observed.session).toBeNull(); expect(observed.demo).toBe(false);
  await view.unmount(); expect(fixture.unsubscribe).toHaveBeenCalled(); app.mockRestore();
});
test('unset config enters isolated demo without a transport and can leave demo', async () => {
  const guest = fixtureRepo('guest'), demo = fixtureRepo('demo');
  jest.mocked(openLocalDatabase).mockResolvedValue({ forOwner: owner => owner === 'demo' ? demo : guest });
  const view = await render(<AuthProvider client={null}><Probe /></AuthProvider>);
  await waitFor(() => expect(observed.ready).toBe(true));
  expect(observed.configured).toBe(false);
  await act(async () => { observed.lookAround(); });
  await waitFor(() => expect(observed.repository).toBe(demo));
  expect(seedDemo).toHaveBeenCalledWith(demo); expect(mockPush).not.toHaveBeenCalled();
  await act(async () => { await observed.signOut(); });
  await waitFor(() => expect(observed.repository).toBe(guest));
  expect(observed.demo).toBe(false); await view.unmount();
});
test('sign-out failure is generic and preserves account access; successful local sign-out gates access', async () => {
  const repos = new Map([[OWNER_A,fixtureRepo(OWNER_A)],['guest',fixtureRepo('guest')]]);
  jest.mocked(openLocalDatabase).mockResolvedValue({ forOwner: owner => repos.get(owner)! });
  const fixture = clientFixture(); const view = await render(<AuthProvider client={fixture.client}><Probe /></AuthProvider>);
  await waitFor(() => expect(observed.ready).toBe(true));
  fixture.auth.signOut.mockResolvedValueOnce({error: new Error('fixture private backend detail')} as never);
  await act(async () => { await expect(observed.signOut()).rejects.toThrow('Sign-out unavailable.'); });
  expect(observed.session?.user.id).toBe(OWNER_A);
  await act(async () => { await observed.signOut(); });
  await waitFor(() => expect(observed.repository?.owner).toBe('guest'));
  expect(observed.session).toBeNull(); expect(fixture.auth.signOut).toHaveBeenLastCalledWith({scope:'local'});
  await view.unmount();
});
test('a newer auth event wins over delayed session restoration', async () => {
  const fixture = clientFixture(), restored = deferred<{data:{session:Session|null};error:null}>();
  fixture.auth.getSession.mockReturnValue(restored.promise);
  jest.mocked(openLocalDatabase).mockResolvedValue({forOwner: fixtureRepo});
  const view = await render(<AuthProvider client={fixture.client}><Probe /></AuthProvider>);
  await act(async () => { fixture.emit(session(OWNER_B)); restored.resolve({data:{session:session(OWNER_A)},error:null}); });
  await waitFor(() => expect(observed.repository?.owner).toBe(OWNER_B));
  expect(observed.session?.user.id).toBe(OWNER_B);
  expect(Network.addNetworkStateListener).toHaveBeenCalled(); await view.unmount();
});
test('StrictMode effect cleanup can restart sync subscriptions safely',async()=>{
 const {StrictMode}=require('react') as typeof import('react');
 jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:fixtureRepo});
 const fixture=clientFixture();const view=await render(<StrictMode><AuthProvider client={fixture.client}><Probe/></AuthProvider></StrictMode>);
 await waitFor(()=>expect(observed.ready).toBe(true));
 await act(async()=>{await observed.syncNow();});
 expect(observed.syncStatus).toBe('idle');expect(mockPush).toHaveBeenCalled();await view.unmount();
});
test('late sign-out completion cannot clear a newer account event',async()=>{
 const fixture=clientFixture(),signedOut=deferred<{error:null}>();
 fixture.auth.signOut.mockReturnValue(signedOut.promise);
 const repos=new Map<string,Repository>();
 jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:owner=>{if(!repos.has(owner))repos.set(owner,fixtureRepo(owner));return repos.get(owner)!;}});
 const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
 await waitFor(()=>expect(observed.repository?.owner).toBe(OWNER_A));
 let leaving!:Promise<void>;
 await act(async()=>{leaving=observed.signOut();fixture.emit(session(OWNER_B));});
 await waitFor(()=>expect(observed.repository?.owner).toBe(OWNER_B));
 await act(async()=>{signedOut.resolve({error:null});await leaving;});
 expect(observed.session?.user.id).toBe(OWNER_B);expect(observed.repository?.owner).toBe(OWNER_B);expect(observed.ready).toBe(true);
 await view.unmount();
});
