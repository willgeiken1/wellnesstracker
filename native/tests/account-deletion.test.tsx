import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AuthContext, AuthProvider, useAuth, type AuthState } from '../src/auth/provider';
import { Account } from '../src/auth/screens';
import { ThemeProvider } from '../src/design/theme-provider';
import { AccountDeletionFailed, AccountDeletionUncertain, DepartureFailure } from '../src/auth/sign-out';
import { OWNER_A, syntheticRow } from '../fixtures/sync';
import { openLocalDatabase } from '../src/data/database';
import { signOutStorage } from '../src/auth/sign-out-storage';
import { syncTables } from '../src/data/sync/flags';
import type { Repository } from '../src/data/repository';
import { createAccountBackup } from '../src/phone-only/backup';
import { exportAccountBackup } from '../src/phone-only/export';
import { t } from '../src/i18n/en';
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn()}}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(async()=>null),setItemAsync:jest.fn(async()=>{}),deleteItemAsync:jest.fn(async()=>{}),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('../src/auth/client',()=>({getAuthClient:jest.fn(()=>null),clearLocalSession:jest.fn(async()=>{})}));
jest.mock('../src/auth/sign-out-storage',()=>({signOutStorage:{read:jest.fn(async()=>null),write:jest.fn(async()=>{}),remove:jest.fn(async()=>{})}}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn()}));
jest.mock('../fixtures/demo',()=>({seedDemo:jest.fn()}));
jest.mock('../src/features/onboarding/demo-transfer',()=>({assertDemoTransferSafe:jest.fn(),promoteDemo:jest.fn()}));
jest.mock('../src/data/sync/supabase',()=>({SupabaseTransport:class {
  owner:string;constructor(_client:unknown,owner:string){this.owner=owner;}
  async pull(){return [];} async push(){throw new Error('offline fixture');}
}}));
jest.mock('expo-network',()=>({addNetworkStateListener:jest.fn(()=>({remove:jest.fn()}))}));
jest.mock('../src/phone-only/export',()=>({exportAccountBackup:jest.fn(async()=>{}),exportPhoneBackup:jest.fn(async()=>{})}));

// Photo files kept outside the database (src/core/owner-files.ts): addresses of files that exist.
const mockFiles=new Set<string>(),mockStuck=new Set<string>();
jest.mock('expo-file-system',()=>{
  class Directory{uri:string;constructor(base:{uri:string},name:string){this.uri=`${base.uri}${name}/`;}get exists(){return false;}delete(){}}
  class File{uri:string;constructor(a:string|Directory,b?:string){this.uri=typeof a==='string'?a:a.uri+b;}get exists(){return mockFiles.has(this.uri);}delete(){if(mockStuck.has(this.uri))throw new Error('synthetic delete failure');mockFiles.delete(this.uri);}}
  return {Directory,File,Paths:{document:{uri:'file:///docs/'},cache:{uri:'file:///caches/'}}};
});
const PHOTO='file:///docs/profile-photo/fixture-1.jpg';
function session(owner:string){return {user:{id:owner,email:'fixture@example.test'}} as Session;}
function fixtureRepo(owner:string){
  // One unsynced row: deletion must not be blocked by it, unlike a plain sign-out.
  let pending=owner===OWNER_A?[{row:syntheticRow(),revision:'100:fixture'}]:[];
  const local=new Map<string,unknown>(owner===OWNER_A?[['profilePhoto',PHOTO]]:[]);
  return {owner,localGet:(key:string)=>local.get(key),syncFlags:{syncedV1Columns:false},syncTables:()=>syncTables(),pending:()=>pending,pendingCount:()=>pending.length,conflicts:()=>[],
    subscribe:()=>()=>{},ack:jest.fn(),wipe:jest.fn(()=>{pending=[];local.clear();}),hasUnsynced:()=>pending.length>0,unsyncedCount:()=>pending.length,
    cursor:()=>'0',applyPage:jest.fn()} as unknown as Repository;
}
function clientFixture(invoke:jest.Mock,getUser:jest.Mock=jest.fn(async()=>{throw new Error('offline fixture');})){
  const auth={getUser,getSession:jest.fn(async()=>({data:{session:session(OWNER_A)},error:null})),
    onAuthStateChange:jest.fn(()=>({data:{subscription:{unsubscribe:jest.fn()}}})),
    startAutoRefresh:jest.fn(),stopAutoRefresh:jest.fn(),signOut:jest.fn(async()=>({error:null}))};
  return {client:{auth,functions:{invoke}} as unknown as SupabaseClient,auth};
}
let observed:AuthState;
function Probe(){observed=useAuth();return null;}
beforeEach(()=>{mockFiles.clear();mockStuck.clear();mockFiles.add(PHOTO);jest.clearAllMocks();jest.spyOn(AppState,'addEventListener').mockImplementation(()=>({remove:jest.fn()}));jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);});
async function mountProvider(invoke:jest.Mock,getUser?:jest.Mock){
  const a=fixtureRepo(OWNER_A),guest=fixtureRepo('guest');
  jest.mocked(openLocalDatabase).mockResolvedValue({wipeAll:jest.fn(),forOwner:(owner:string)=>owner===OWNER_A?a:owner==='guest'?guest:fixtureRepo(owner)} as never);
  const fixture=clientFixture(invoke,getUser);
  const view=await render(<AuthProvider client={fixture.client}><Probe/></AuthProvider>);
  await waitFor(()=>expect(observed.repository).toBe(a));
  return {a,guest,fixture,view};
}

test('deleteAccount calls the server with the DELETE confirmation, then erases this phone even with unsynced rows',async()=>{
  const invoke=jest.fn(async()=>({data:{ok:true},error:null})) as jest.Mock;
  const {a,guest,fixture,view}=await mountProvider(invoke);
  await act(async()=>{await observed.deleteAccount!();});
  expect(invoke).toHaveBeenCalledWith('delete-account',{body:{confirm:'DELETE'}});
  expect(invoke).toHaveBeenCalledTimes(1);
  await waitFor(()=>expect(observed.repository).toBe(guest));
  expect(a.wipe).toHaveBeenCalledTimes(1);expect(observed.session).toBeNull();
  expect(fixture.auth.signOut).toHaveBeenCalledWith({scope:'local'});
  expect(signOutStorage.remove).toHaveBeenCalled();
  // The profile photo file goes with the account, not only its address.
  expect(mockFiles.has(PHOTO)).toBe(false);
  await view.unmount();
});
test('a photo that cannot be deleted stops departure before the wipe, keeping its address, and Try again finishes it',async()=>{
  const invoke=jest.fn(async()=>({data:{ok:true},error:null})) as jest.Mock;
  const {a,guest,view}=await mountProvider(invoke);
  mockStuck.add(PHOTO);
  await act(async()=>{await expect(observed.deleteAccount!()).rejects.toBeInstanceOf(DepartureFailure);});
  // Nothing was wiped and the departure marker stays, so the photo's address can still be read and deleted later.
  expect(a.wipe).not.toHaveBeenCalled();expect(a.localGet('profilePhoto')).toBe(PHOTO);expect(mockFiles.has(PHOTO)).toBe(true);
  expect(signOutStorage.write).toHaveBeenCalled();expect(signOutStorage.remove).not.toHaveBeenCalled();
  expect(observed.recovery).toBe('departure');
  mockStuck.clear();
  await act(async()=>{await observed.signOut();});
  await waitFor(()=>expect(observed.repository).toBe(guest));
  expect(a.wipe).toHaveBeenCalledTimes(1);expect(mockFiles.has(PHOTO)).toBe(false);expect(signOutStorage.remove).toHaveBeenCalled();
  await view.unmount();
});
test.each([
  ['a returned error',async()=>({data:null,error:new Error('private fixture')})],
  ['a rejected request',async()=>{throw new Error('private fixture');}],
  ['a reply without ok',async()=>({data:{ok:false},error:null})],
] as [string,()=>Promise<unknown>][])('deleteAccount keeps everything on this phone after %s',async(_name,impl)=>{
  const invoke=jest.fn(impl) as jest.Mock;
  const {a,fixture,view}=await mountProvider(invoke);
  await act(async()=>{await expect(observed.deleteAccount!()).rejects.toBeInstanceOf(AccountDeletionFailed);});
  expect(a.wipe).not.toHaveBeenCalled();expect(fixture.auth.signOut).not.toHaveBeenCalled();
  expect(observed.session?.user.id).toBe(OWNER_A);expect(observed.repository).toBe(a);
  expect(mockFiles.has(PHOTO)).toBe(true);
  await view.unmount();
});

const state=():AuthState=>({session:{user:{id:'fixture',email:'fixture@example.test'}} as Session,demo:false,ready:true,configured:true,configError:null,
  repository:{owner:'fixture'} as unknown as Repository,pending:0,conflicts:0,syncStatus:'idle',lookAround:jest.fn(),signIn:jest.fn(async()=>null),
  createAccount:jest.fn(async()=>null),signOut:jest.fn(async()=>{}),syncNow:jest.fn(async()=>{}),deleteAccount:jest.fn(async()=>{})});
function wrap(auth:AuthState){return render(<AuthContext.Provider value={auth}><ThemeProvider><Account/></ThemeProvider></AuthContext.Provider>);}

test('Account offers deletion only after typing DELETE, with a backup offered first',async()=>{
  const auth=state();await wrap(auth);
  await fireEvent.press(screen.getByRole('button',{name:t('deleteAccount')}));
  expect(screen.getByText(t('deleteAccountTitle'))).toBeTruthy();
  const confirm=screen.getByTestId('account-delete-confirm');
  await fireEvent.press(confirm);expect(auth.deleteAccount).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button',{name:t('deleteAccountBackup')}));
  expect(exportAccountBackup).toHaveBeenCalledWith(auth.repository);
  await waitFor(()=>expect(screen.getByText(t('deleteAccountBackupDone'))).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText(t('deleteAccountTypeLabel')),'delete');
  await fireEvent.press(screen.getByTestId('account-delete-confirm'));expect(auth.deleteAccount).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText(t('deleteAccountTypeLabel')),'DELETE');
  await fireEvent.press(screen.getByTestId('account-delete-confirm'));
  await waitFor(()=>expect(auth.deleteAccount).toHaveBeenCalledTimes(1));
});
test('a failed deletion says nothing was deleted and keeps the sheet open',async()=>{
  const auth={...state(),deleteAccount:jest.fn(async()=>{throw new AccountDeletionFailed();})};await wrap(auth);
  await fireEvent.press(screen.getByRole('button',{name:t('deleteAccount')}));
  await fireEvent.changeText(screen.getByLabelText(t('deleteAccountTypeLabel')),'DELETE');
  await fireEvent.press(screen.getByTestId('account-delete-confirm'));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent(t('deleteAccountFailed')));
  expect(screen.getByText(t('deleteAccountTitle'))).toBeTruthy();
});
test('an unconfirmed deletion says it could not be confirmed, not that nothing was deleted',async()=>{
  const auth={...state(),deleteAccount:jest.fn(async()=>{throw new AccountDeletionUncertain();})};await wrap(auth);
  await fireEvent.press(screen.getByRole('button',{name:t('deleteAccount')}));
  await fireEvent.changeText(screen.getByLabelText(t('deleteAccountTypeLabel')),'DELETE');
  await fireEvent.press(screen.getByTestId('account-delete-confirm'));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent(t('deleteAccountUncertain')));
  expect(screen.getByText(t('deleteAccountTitle'))).toBeTruthy();
});
test('the example data has no delete-account button',async()=>{
  await wrap({...state(),demo:true,session:null});
  expect(screen.queryByRole('button',{name:t('deleteAccount')})).toBeNull();
});
test('the account backup refuses example and phone-only data',()=>{
  for(const owner of ['demo','guest','device'])expect(()=>createAccountBackup({owner} as unknown as Repository)).toThrow();
});

test('a lost reply after the server deleted the account: a retry that is refused finds the account gone and erases this phone',async()=>{
  // The server deleted everything but the reply never arrived; the retry is refused because the sign-in no longer exists.
  const invoke=jest.fn(async()=>({data:null,error:new Error('private fixture')})) as jest.Mock;
  const getUser=jest.fn(async()=>({data:{user:null},error:Object.assign(new Error('private fixture'),{code:'user_not_found',status:403})})) as jest.Mock;
  const {a,guest,fixture,view}=await mountProvider(invoke,getUser);
  await act(async()=>{await observed.deleteAccount!();});
  await waitFor(()=>expect(observed.repository).toBe(guest));
  expect(a.wipe).toHaveBeenCalledTimes(1);expect(fixture.auth.signOut).toHaveBeenCalledWith({scope:'local'});
  await view.unmount();
});
test('when the account is still there, the failure says it was not deleted; when nothing can be checked, it says unconfirmed',async()=>{
  const invoke=jest.fn(async()=>{throw new Error('private fixture');}) as jest.Mock;
  const still=jest.fn(async()=>({data:{user:{id:OWNER_A}},error:null})) as jest.Mock;
  let mounted=await mountProvider(invoke,still);
  await act(async()=>{await observed.deleteAccount!().then(()=>{throw new Error('should fail');},cause=>{expect(cause).toBeInstanceOf(AccountDeletionFailed);expect(cause).not.toBeInstanceOf(AccountDeletionUncertain);});});
  expect(mounted.a.wipe).not.toHaveBeenCalled();
  await mounted.view.unmount();
  const other=jest.fn(async()=>({data:{user:null},error:Object.assign(new Error('private fixture'),{code:'refresh_token_not_found',status:400})})) as jest.Mock;
  mounted=await mountProvider(invoke,other);
  await act(async()=>{await expect(observed.deleteAccount!()).rejects.toBeInstanceOf(AccountDeletionUncertain);});
  expect(mounted.a.wipe).not.toHaveBeenCalled();expect(observed.repository).toBe(mounted.a);
  await mounted.view.unmount();
});
