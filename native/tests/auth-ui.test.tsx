import { render, screen, fireEvent } from '@testing-library/react-native';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { AuthForm, Welcome, Account } from '../src/auth/screens';
import { Alert } from 'react-native';
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
 const buttons=alert.mock.calls[0][2]!;await buttons[1].onPress?.();expect(auth.signOut).toHaveBeenCalled();alert.mockRestore();
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
