import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthForm, Welcome, Account, LocalDataRecovery } from '../src/auth/screens';
import { Alert } from 'react-native';
import { DepartureFailure } from '../src/auth/sign-out';
import { t, signOutUnsynced } from '../src/i18n/en';
import { SIGN_OUT_SYNC_TIMEOUT_MS } from '../src/auth/sign-out-sync';
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn()}}));
jest.mock('../src/auth/client',()=>({getAuthClient:()=>null}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn()}));
const state=(): AuthState=>({session:null,demo:false,ready:true,configured:true,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',lookAround:jest.fn(),signIn:jest.fn(async()=>null),createAccount:jest.fn(async()=>null),signOut:jest.fn(async()=>{}),syncNow:jest.fn(async()=>{})});
function wrap(ui: React.ReactNode,auth=state()){return render(<AuthContext.Provider value={auth}><ThemeProvider>{ui}</ThemeProvider></AuthContext.Provider>);}
test('unset config offers demo and explains disabled authentication',async()=>{
 const auth={...state(),configured:false};await wrap(<Welcome/>,auth);
 expect(screen.getByText("Sign-in isn't set up in this build")).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Look around first'}));expect(auth.lookAround).toHaveBeenCalled();
});
test('create validates email, minimum password length and confirmation inline before client calls',async()=>{
 const auth=state();await wrap(<AuthForm create/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Create account'}));expect(auth.createAccount).not.toHaveBeenCalled();
 await fireEvent.changeText(screen.getByLabelText('Email'),'fixture@example.test');
 await fireEvent.changeText(screen.getByLabelText('Password'),'short');
 await fireEvent.press(screen.getByRole('button',{name:'Create account'}));expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters for your password.');
 await fireEvent.changeText(screen.getByLabelText('Password'),'fixture-password');
 await fireEvent.changeText(screen.getByLabelText('Confirm password'),'different');
 await fireEvent.press(screen.getByRole('button',{name:'Create account'}));expect(screen.getByRole('alert')).toHaveTextContent('Passwords must match.');
 await fireEvent.changeText(screen.getByLabelText('Confirm password'),'fixture-password');
 await fireEvent.press(screen.getByRole('button',{name:'Create account'}));expect(auth.createAccount).toHaveBeenCalledWith('fixture@example.test','fixture-password');
});
test('sign-in maps raw client failure to generic safe error',async()=>{
 const auth={...state(),signIn:jest.fn(async()=> 'authFailed')};await wrap(<AuthForm/>,auth);
 await fireEvent.changeText(screen.getByLabelText('Email'),'fixture@example.test');await fireEvent.changeText(screen.getByLabelText('Password'),'fixture-password');
 await fireEvent.press(screen.getByRole('button',{name:'Sign in'}));expect(screen.getByRole('alert')).toHaveTextContent('Unable to sign in or create an account. Check your details and try again.');
 expect(screen.queryByText('fixture-password')).toBeNull();
});
test('Account displays pending status, manual sync, and requires sign-out confirmation',async()=>{
 const auth={...state(),session:{user:{id:'fixture',email:'fixture@example.test'}} as AuthState['session'],pending:3};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await wrap(<Account/>,auth);
 expect(screen.getByText('3 pending')).toBeTruthy();await fireEvent.press(screen.getByRole('button',{name:'Sync now'}));expect(auth.syncNow).toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));expect(auth.signOut).not.toHaveBeenCalled();
 const buttons=alert.mock.calls[0][2]!;await act(async()=>{buttons[1].onPress?.();});expect(auth.signOut).toHaveBeenCalledWith(true);expect(alert.mock.calls[0][1]).toContain('3 unsynced changes will be lost');alert.mockRestore();
});
test('sign-in accepts an existing account password shorter than the new-account minimum',async()=>{
 const auth=state();await wrap(<AuthForm/>,auth);
 await fireEvent.changeText(screen.getByLabelText('Email'),'fixture@example.test');await fireEvent.changeText(screen.getByLabelText('Password'),'short');
 await fireEvent.press(screen.getByRole('button',{name:'Sign in'}));expect(auth.signIn).toHaveBeenCalledWith('fixture@example.test','short');
});

test('Account shows flagged sync conflicts separately from pending uploads',async()=>{
 await wrap(<Account/>,{...state(),conflicts:2});
 expect(screen.getByText('2 sync conflicts · review needed')).toBeTruthy();
 expect(screen.queryByText('2 pending')).toBeNull();
 expect(screen.queryByText('Up to date')).toBeNull();
});

afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
test.each([0,1,3])('sign-out warning uses current owner count %s after sync',async count=>{
 const auth={...state(),pending:9,repository:{unsyncedCount:()=>count} as AuthState['repository']};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await wrap(<Account/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));
 if(count===0){expect(alert).not.toHaveBeenCalled();expect(auth.signOut).toHaveBeenCalledWith();}
 else {expect(auth.signOut).not.toHaveBeenCalled();expect(alert.mock.calls[0][1]).toContain(count===1?'1 unsynced change will be lost':'3 unsynced changes will be lost');}
});
test('screen waits for sync, prevents double submit, and clears its timeout on early completion',async()=>{
 jest.useFakeTimers();let finish!:()=>void;
 const schedule=jest.spyOn(global,'setTimeout'),cancel=jest.spyOn(global,'clearTimeout');
 const auth={...state(),syncNow:jest.fn(()=>new Promise<void>(resolve=>{finish=resolve;}))};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await wrap(<Account/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));
 const button=screen.getByRole('button',{name:'Sign out'});
 expect(button.props.accessibilityState).toMatchObject({disabled:true,busy:true});
 expect(button.children.some(child=>typeof child!=='string'&&child.type==='ActivityIndicator')).toBe(true);
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));expect(auth.syncNow).toHaveBeenCalledTimes(1);
 expect(auth.signOut).not.toHaveBeenCalled();expect(alert).not.toHaveBeenCalled();
 await act(async()=>{finish();});
 expect(auth.signOut).toHaveBeenCalledTimes(1);
 expect(SIGN_OUT_SYNC_TIMEOUT_MS).toBe(10_000);
 const index=schedule.mock.calls.findIndex(call=>call[1]===SIGN_OUT_SYNC_TIMEOUT_MS);
 expect(index).toBeGreaterThanOrEqual(0);expect(cancel).toHaveBeenCalledWith(schedule.mock.results[index].value);
});
test('sign-out sync times out at 10 seconds and shows loss warning',async()=>{
 jest.useFakeTimers();const auth={...state(),pending:3,syncNow:jest.fn(()=>new Promise<void>(()=>{}))};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await wrap(<Account/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));
 await act(async()=>{jest.advanceTimersByTime(9999);});expect(alert).not.toHaveBeenCalled();
 await act(async()=>{jest.advanceTimersByTime(1);});
 expect(alert.mock.calls[0][1]).toContain('3 unsynced changes will be lost');expect(auth.signOut).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Sign out'}).props.accessibilityState).toMatchObject({disabled:false,busy:false});
});

test('destructive confirmation double tap starts only one sign-out while in flight',async()=>{
 let finish!:()=>void;const auth={...state(),pending:1,signOut:jest.fn(()=>new Promise<void>(r=>{finish=r;}))};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await wrap(<Account/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));
 const confirm=alert.mock.calls[0][2]![1].onPress!;
 await act(async()=>{confirm();confirm();});
 expect(auth.signOut).toHaveBeenCalledTimes(1);await act(async()=>{finish();});
});
test('failed departure warns that erasure may have started',async()=>{
 const auth={...state(),signOut:jest.fn(async()=>{throw new DepartureFailure();})};await wrap(<Account/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));
 expect(screen.getByRole('alert')).toHaveTextContent('Sign-out did not finish. Some local data may already have been erased. Try again now to finish signing out.');
});

test.each(['guard','count','pre-sync'])('failure before wipe (%s) says nothing was erased',async kind=>{
 const auth:AuthState={...state(),signOut:jest.fn(async()=>{throw new Error('synthetic guard');})};
 if(kind==='count')auth.repository={unsyncedCount:()=>{throw new Error('synthetic count');}} as unknown as AuthState['repository'];
 if(kind==='pre-sync')auth.prepareSignOut=async()=>{throw new Error('synthetic pre-sync');};
 await wrap(<Account/>,auth);await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));
 expect(screen.getByRole('alert')).toHaveTextContent('Sign-out did not finish. Nothing was erased. Try again.');
});

test('read-error recovery offers retry without an erase-all action',async()=>{
 const auth:AuthState={...state(),ready:false,recovery:'read-error',retryMarkerRead:jest.fn(),recoverLocalData:jest.fn()};
 await wrap(<LocalDataRecovery/>,auth);
 expect(screen.queryByRole('button',{name:'Erase all local data and sign out'})).toBeNull();
 expect(screen.getByText("The app couldn't check whether sign-out finished. It's still locked. Try again.")).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Try again'}));
 expect(auth.retryMarkerRead).toHaveBeenCalledTimes(1);
 expect(auth.recoverLocalData).not.toHaveBeenCalled();
});


test.each([false,true])('Account selects failure copy by error type after confirmed sign-out (departure=%s)',async departure=>{
 const auth={...state(),pending:1,signOut:jest.fn(async()=>{throw departure?new DepartureFailure():new Error('synthetic');})};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await wrap(<Account/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Sign out'}));
 await act(async()=>{alert.mock.calls[0][2]![1].onPress?.();});
 expect(auth.signOut).toHaveBeenCalledWith(true);
 expect(screen.getByRole('alert')).toHaveTextContent(t(departure?'signOutFailed':'signOutNotStarted'));
 expect(screen.queryByText(t(departure?'signOutNotStarted':'signOutFailed'))).toBeNull();
});

test.each([0,3,undefined])('erase confirmation uses the exact warning for unsynced count %s',async count=>{
 const auth:AuthState={...state(),ready:false,recovery:'corrupt-marker',countRecoveryUnsynced:jest.fn(async()=>count),recoverLocalData:jest.fn(async()=>{})};
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await wrap(<LocalDataRecovery/>,auth);
 await fireEvent.press(screen.getByRole('button',{name:'Erase all local data and sign out'}));
 expect(auth.countRecoveryUnsynced).toHaveBeenCalledTimes(1);
 expect(alert.mock.calls[0][1]).toBe(count===0?t('eraseAllBody'):`${t('eraseAllBody')} ${count===undefined?t('eraseAllUnsynced'):signOutUnsynced(count)}`);
 expect(auth.recoverLocalData).not.toHaveBeenCalled();
});
