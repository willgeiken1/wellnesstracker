import { Alert } from 'react-native';
import { router } from 'expo-router';
import { memoryRepository } from './workout-repository';
import { act, render, fireEvent } from '@testing-library/react-native';
import RootLayout from '../src/app/_layout';
import * as rootPurchase from '../src/features/plus/root-purchase';
import { AuthContext, type AuthState } from '../src/auth/provider';
jest.mock('expo-router',()=>{const actual=jest.requireActual('expo-router');const Stack=({children}:{children:React.ReactNode})=>children;Stack.Screen=()=>null;Stack.Protected=({children,guard}:{children:React.ReactNode;guard:boolean})=>guard?children:null;return {...actual,Stack,router:{...actual.router,replace:jest.fn()}};});
jest.mock('expo-network',()=>({getNetworkStateAsync:jest.fn(async()=>({isConnected:false,isInternetReachable:false})),addNetworkStateListener:jest.fn(()=>({remove:jest.fn()}))}));
jest.mock('expo-font',()=>({useFonts:()=>[true,null]}));
jest.mock('../src/auth/provider',()=>{
 const actual=jest.requireActual('../src/auth/provider');
 return {...actual,AuthProvider:({children}:{children:React.ReactNode})=>children};
});
jest.mock('../src/auth/client',()=>({getAuthClient:()=>null}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn()}));

test('production root layout mounts LocalDataRecovery while private navigation is locked',async()=>{
 const auth:AuthState={session:null,demo:false,ready:false,configured:false,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',recovery:'corrupt-marker',lookAround:jest.fn(),signIn:jest.fn(),createAccount:jest.fn(),signOut:jest.fn(),syncNow:jest.fn()};
 const view=await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);
 expect(view.getByRole('button',{name:'Erase all local data and sign out'})).toBeTruthy();
 expect(view.queryByRole('button',{name:'Start freestyle'})).toBeNull();
});

test('production root shows boot recovery with private routes and technical errors hidden',async()=>{
 const auth:AuthState={session:null,demo:false,ready:false,configured:false,configError:'Local data is unavailable.',repository:null,pending:0,conflicts:0,syncStatus:'idle',recovery:'boot-error',bootErrorClass:'DatabaseMigrationError',retryBoot:jest.fn(),lookAround:jest.fn(),signIn:jest.fn(),createAccount:jest.fn(),signOut:jest.fn(),syncNow:jest.fn()};
 const view=await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);
 expect(view.getByRole('button',{name:'Retry'})).toBeTruthy();
 expect(view.getByRole('button',{name:'Export local data'})).toBeTruthy();
 expect(view.getByRole('button',{name:'Contact support'})).toBeTruthy();
 expect(view.queryByText('Local data is unavailable.')).toBeNull();
 expect(view.queryByText('DatabaseMigrationError')).toBeNull();
 expect(view.queryByRole('button',{name:'Start freestyle'})).toBeNull();
});


test.each([null,'2000-01-01'])('new-device sign-in waits for server profile and skips onboarding even with DOB %s',async dob=>{
 jest.mocked(router.replace).mockClear();const repository=memoryRepository();
 const auth:AuthState={session:{user:{id:'synthetic'}} as AuthState['session'],demo:false,ready:true,configured:true,configError:null,repository,pending:0,conflicts:0,syncStatus:'idle',initialPullComplete:false,lookAround:jest.fn(),signIn:jest.fn(),createAccount:jest.fn(),signOut:jest.fn(),syncNow:jest.fn()};
 const view=await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);
 expect(router.replace).not.toHaveBeenCalled();
 await act(async()=>{repository.save('profile',{name:'Server synthetic',weight_unit:'kg',height_m:1.8,dob});});
 await view.rerender(<AuthContext.Provider value={{...auth,initialPullComplete:true}}><RootLayout/></AuthContext.Provider>);
 expect(router.replace).not.toHaveBeenCalled();expect(repository.list('profile')).toHaveLength(1);
 expect(repository.list('profile')[0].data).toMatchObject({name:'Server synthetic',weight_unit:'kg',height_m:1.8});
 expect(repository.list('food_targets')).toEqual([]);expect(repository.list('weigh_ins')).toEqual([]);
});
test('redirect is re-evaluated after a successful pull for an account without a profile',async()=>{
 jest.mocked(router.replace).mockClear();const repository=memoryRepository();
 const auth:AuthState={session:{user:{id:'synthetic'}} as AuthState['session'],demo:false,ready:true,configured:true,configError:null,repository,pending:0,conflicts:0,syncStatus:'idle',initialPullComplete:false,lookAround:jest.fn(),signIn:jest.fn(),createAccount:jest.fn(),signOut:jest.fn(),syncNow:jest.fn()};
 const view=await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);expect(router.replace).not.toHaveBeenCalled();
 await view.rerender(<AuthContext.Provider value={{...auth,initialPullComplete:true}}><RootLayout/></AuthContext.Provider>);expect(router.replace).toHaveBeenCalledWith('/onboarding');
});

test('root surfaces a retry after demo transfer failure while account remains available',async()=>{
 const retryDemoTransfer=jest.fn();
 const auth:AuthState={session:null,demo:false,ready:false,configured:true,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',demoTransferError:true,retryDemoTransfer,lookAround:jest.fn(),signIn:jest.fn(),createAccount:jest.fn(),signOut:jest.fn(),syncNow:jest.fn()};
 const view=await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);
 expect(view.getByRole('alert')).toHaveTextContent(/Your account is ready/);
 await fireEvent.press(view.getByRole('button',{name:'Try again'}));expect(retryDemoTransfer).toHaveBeenCalled();
});

test('production root does not mount a purchase provider that grants Plus', async () => {
 const original = __DEV__;
 const created = jest.spyOn(rootPurchase, 'createRootPurchaseProvider');
 Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true, writable: true });
 const auth: AuthState = { session: null, demo: false, ready: false, configured: false, configError: null, repository: null, pending: 0, conflicts: 0, syncStatus: 'idle', recovery: 'corrupt-marker', lookAround: jest.fn(), signIn: jest.fn(), createAccount: jest.fn(), signOut: jest.fn(), syncNow: jest.fn() };
 try {
  created.mockClear();
  await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);
  expect(created).toHaveBeenCalled();
  expect(created.mock.results.length).toBeGreaterThan(0);
  for (const result of created.mock.results) {
   const provider = await result.value;
   expect(await provider.purchase('plus_monthly')).toMatchObject({ status: 'error', error: { code: 'unavailable' } });
   expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'free' });
   expect(await provider.restore()).toEqual({ status: 'success', value: 'free' });
  }
 } finally {
  created.mockRestore();
  Object.defineProperty(globalThis, '__DEV__', { value: original, configurable: true, writable: true });
 }
});

test('root free mock keeps confirmed local recovery erasure reachable',async()=>{
 const recoverLocalData=jest.fn(async()=>{});
 const auth:AuthState={session:null,demo:false,ready:false,configured:false,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',recovery:'corrupt-marker',recoverLocalData,countRecoveryUnsynced:jest.fn(async()=>0),lookAround:jest.fn(),signIn:jest.fn(),createAccount:jest.fn(),signOut:jest.fn(),syncNow:jest.fn()};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 try {
  const view=await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);
  await fireEvent.press(view.getByRole('button',{name:'Erase all local data and sign out'}));
  expect(recoverLocalData).not.toHaveBeenCalled();
  const buttons=alert.mock.calls[0][2]!;
  await act(async()=>{buttons.find(button=>button.style==='destructive')!.onPress!();});
  expect(recoverLocalData).toHaveBeenCalledTimes(1);
 } finally {alert.mockRestore();}
});
