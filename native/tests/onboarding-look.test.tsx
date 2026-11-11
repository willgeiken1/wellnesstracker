import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Onboarding, OnboardingDraftProvider } from '../src/features/onboarding/screen';
import { Welcome } from '../src/features/onboarding/welcome';
import { AuthForm } from '../src/features/onboarding/auth-form';
import { Profile } from '../src/features/onboarding/profile';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import { t } from '../src/i18n/en';
import { memoryRepository } from './workout-repository';
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn()}}));
jest.mock('../src/auth/client',()=>({getAuthClient:()=>null}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn()}));
const state=():AuthState=>({initialPullComplete:true,session:null,demo:false,ready:true,configured:true,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',lookAround:jest.fn(),signIn:jest.fn(async()=>null),createAccount:jest.fn(async()=>null),signOut:jest.fn(async()=>{}),syncNow:jest.fn(async()=>{})});
async function wrap(ui:React.ReactNode,auth=state()){await render(<AuthContext.Provider value={auth}><OnboardingDraftProvider><ThemeProvider>{ui}</ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>);return auth;}
const flat=(node:{props:{style?:unknown}})=>StyleSheet.flatten(node.props.style as never) as Record<string,unknown>;
beforeEach(()=>{jest.mocked(router.push).mockClear();jest.mocked(router.replace).mockClear();});

describe('Welcome',()=>{
 test('says what the app is for under one title, with step 1 of 3',async()=>{
  await wrap(<Welcome/>);
  expect(screen.getAllByRole('header')).toHaveLength(1);
  expect(screen.getByRole('header')).toHaveTextContent(t('welcomeTitle'));
  expect(screen.getByRole('progressbar',{name:'Step 1 of 3'})).toBeTruthy();
  expect(screen.getAllByTestId('onboarding-progress-done')).toHaveLength(1);
  expect(screen.getAllByTestId('onboarding-progress-todo')).toHaveLength(2);
  expect(screen.getByRole('image',{name:t('welcomeMapLabel')})).toBeTruthy();
  for(const key of ['welcomeWorkouts','welcomeFood','welcomeHealth'] as const)expect(screen.getByText(t(key))).toBeTruthy();
  // Services cannot be connected yet, and the screen says so.
  expect(screen.getByText(/Connecting opens in a later update/)).toBeTruthy();
 });
 test('one main button and three quieter ways in, each firing its own handler',async()=>{
  const auth=await wrap(<Welcome/>);
  await fireEvent.press(screen.getByRole('button',{name:t('getStarted')}));expect(router.push).toHaveBeenLastCalledWith('/onboarding');
  await fireEvent.press(screen.getByRole('button',{name:t('haveAccount')}));expect(router.push).toHaveBeenLastCalledWith('/auth/sign-in');
  await fireEvent.press(screen.getByRole('button',{name:t('importChoose')}));expect(router.push).toHaveBeenLastCalledWith('/import');
  await fireEvent.press(screen.getByRole('button',{name:t('lookAround')}));expect(auth.lookAround).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).toBeNull();
 });
 test('without accounts it says so in a quiet row and still lets the person look around',async()=>{
  const auth=await wrap(<Welcome/>,{...state(),configured:false});
  expect(screen.getByRole('alert')).toHaveTextContent(t('accountsUnavailable'));
  expect(screen.getByRole('button',{name:t('getStarted')})).toBeDisabled();
  expect(screen.getByRole('button',{name:t('haveAccount')})).toBeDisabled();
  await fireEvent.press(screen.getByRole('button',{name:t('lookAround')}));expect(auth.lookAround).toHaveBeenCalled();
 });
 test('every pressable row is at least 44 points tall',async()=>{
  await wrap(<Welcome/>);
  for(const name of [t('getStarted'),t('haveAccount'),t('lookAround'),t('importChoose')])
   expect(Number(flat(screen.getByRole('button',{name})).minHeight)).toBeGreaterThanOrEqual(44);
 });
 test('the auth landing route shows this screen and sign-in routes show the new form',()=>{
  expect((require('../src/app/auth/index') as {default:unknown}).default).toBe(Welcome);
  for(const route of ['../src/app/auth/sign-in','../src/app/sign-in'])expect(String((require(route) as {default:()=>unknown}).default)).toContain('AuthForm');
 });
});

describe('Sign in',()=>{
 test('fields carry the right keyboard, autofill and secure entry settings',async()=>{
  await wrap(<AuthForm/>);
  expect(screen.getAllByRole('header')[0]).toHaveTextContent(t('signIn'));
  expect(screen.getByLabelText(t('email')).props).toMatchObject({keyboardType:'email-address',autoComplete:'email',textContentType:'emailAddress',autoCapitalize:'none',autoCorrect:false});
  expect(screen.getByLabelText(t('password')).props).toMatchObject({secureTextEntry:true,autoComplete:'current-password',textContentType:'password'});
  expect(Number(flat(screen.getByLabelText(t('email'))).minHeight)).toBeGreaterThanOrEqual(44);
 });
 test('create mode asks for a new password twice with new-password autofill',async()=>{
  await wrap(<AuthForm create dob="2000-01-01"/>);
  for(const label of [t('password'),t('confirmPassword')])
   expect(screen.getByLabelText(label).props).toMatchObject({secureTextEntry:true,autoComplete:'new-password',textContentType:'newPassword'});
  expect(screen.getByText(t('passwordHelp'))).toBeTruthy();
 });
 test('the focused field shows the accent border and loses it on blur',async()=>{
  await wrap(<AuthForm/>);const colors=createTheme('light');
  expect(flat(screen.getByLabelText(t('email'))).borderColor).toBe(colors['hair-2']);
  await fireEvent(screen.getByLabelText(t('email')),'focus');
  expect(flat(screen.getByLabelText(t('email'))).borderColor).toBe(colors.accent);
  await fireEvent(screen.getByLabelText(t('email')),'blur');
  expect(flat(screen.getByLabelText(t('email'))).borderColor).toBe(colors['hair-2']);
 });
 test('typing mistakes show inline with no Retry and no client call',async()=>{
  const auth=await wrap(<AuthForm create dob="2000-01-01"/>);
  await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));
  expect(screen.getByRole('alert')).toHaveTextContent(t('invalidEmail'));
  await fireEvent.changeText(screen.getByLabelText(t('email')),'fixture@example.test');
  await fireEvent.changeText(screen.getByLabelText(t('password')),'short');
  await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));expect(screen.getByRole('alert')).toHaveTextContent(t('shortPassword'));
  await fireEvent.changeText(screen.getByLabelText(t('password')),'fixture-password');
  await fireEvent.changeText(screen.getByLabelText(t('confirmPassword')),'different');
  await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));expect(screen.getByRole('alert')).toHaveTextContent(t('passwordMismatch'));
  expect(screen.queryByRole('button',{name:t('bootRetry')})).toBeNull();expect(auth.createAccount).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText(t('confirmPassword')),'fixture-password');
  await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));
  expect(auth.createAccount).toHaveBeenCalledWith('fixture@example.test','fixture-password','2000-01-01');
  expect(router.replace).toHaveBeenCalledWith('/onboarding');
 });
 test('a failed request shows the safe message in a row with Retry, and the password is cleared',async()=>{
  const auth=await wrap(<AuthForm/>,{...state(),signIn:jest.fn(async()=>'synthetic raw client text')});
  await fireEvent.changeText(screen.getByLabelText(t('email')),'fixture@example.test');await fireEvent.changeText(screen.getByLabelText(t('password')),'short');
  await fireEvent.press(screen.getByRole('button',{name:t('signIn')}));
  expect(auth.signIn).toHaveBeenCalledWith('fixture@example.test','short');
  expect(screen.getByRole('alert')).toHaveTextContent(t('authFailed'));expect(screen.queryByText(/synthetic raw client text/)).toBeNull();
  expect(screen.getByLabelText(t('password'))).toHaveDisplayValue('');
  await fireEvent.press(screen.getByRole('button',{name:t('bootRetry')}));
  expect(auth.signIn).toHaveBeenCalledTimes(1);
 });
 test('sign-in keeps an earlier device choice when the switches are untouched, and saves a changed one',async()=>{
  const {openLocalDatabase}=require('../src/data/database') as typeof import('../src/data/database');
  const device=memoryRepository();device.localSave('devicePreferences',{crashReports:false,analytics:true});
  jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:()=>device,wipeAll:jest.fn()});
  await wrap(<AuthForm/>);
  expect(await screen.findByRole('switch',{name:t('analyticsPref')})).toBeChecked();
  await fireEvent(screen.getByRole('switch',{name:t('crashReportsPref')}),'valueChange',true);
  await fireEvent.changeText(screen.getByLabelText(t('email')),'fixture@example.test');await fireEvent.changeText(screen.getByLabelText(t('password')),'synthetic');
  await fireEvent.press(screen.getByRole('button',{name:t('signIn')}));
  expect(device.localGet('devicePreferences')).toEqual({crashReports:true,analytics:true});
 });
 test('Back returns to the welcome screen',async()=>{
  await wrap(<AuthForm/>);await fireEvent.press(screen.getByRole('button',{name:t('onboardingBack')}));
  expect(router.replace).toHaveBeenCalledWith('/auth');
 });
});

describe('About you and Start',()=>{
 test('date of birth has a plain label, a helper line and its own inline error',async()=>{
  const auth=await wrap(<Onboarding/>);
  expect(t('birthDate')).toBe('Date of birth');expect(screen.getByText(t('birthDateHelp'))).toBeTruthy();
  expect(screen.getByRole('progressbar',{name:'Step 2 of 3'})).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-13-45');
  await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));
  expect(screen.getByRole('alert')).toHaveTextContent(t('birthDateInvalid'));expect(auth.createAccount).not.toHaveBeenCalled();
  // Typing again clears the message until the next check.
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');expect(screen.queryByRole('alert')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText(t('profileHeight').replace('{unit}',screen.queryByLabelText('Height (cm, optional)')?'cm':'in')),'-4');
  await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));
  expect(screen.getByRole('alert')).toHaveTextContent(t('statsInvalid'));
 });
 test('Back on About you clears the draft and returns to welcome, or to Account in the demo',async()=>{
  await wrap(<Onboarding/>);await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');
  await fireEvent.press(screen.getByRole('button',{name:t('onboardingBack')}));
  expect(router.replace).toHaveBeenLastCalledWith('/auth');expect(screen.getByLabelText(t('birthDate'))).toHaveDisplayValue('');
  await screen.unmount();
  await wrap(<Onboarding/>,{...state(),demo:true});await fireEvent.press(screen.getByRole('button',{name:t('onboardingBack')}));
  expect(router.replace).toHaveBeenLastCalledWith('/settings/account');
 });
 test('Start offers two labelled routine choices and stores the same values as before',async()=>{
  const {openLocalDatabase}=require('../src/data/database') as typeof import('../src/data/database');
  const repository=memoryRepository(),device=memoryRepository();
  jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:()=>device,wipeAll:()=>{}});
  await wrap(<Onboarding/>,{...state(),repository,session:{user:{id:'synthetic'}} as AuthState['session']});
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');
  await fireEvent.press(screen.getByRole('button',{name:t('continueOnboarding')}));
  expect(screen.getByRole('progressbar',{name:'Step 3 of 3'})).toBeTruthy();
  expect(screen.getByRole('radio',{name:t('starterNone')})).toBeChecked();
  expect(screen.getByRole('radio',{name:t('starterFullBody')})).not.toBeChecked();
  expect(screen.getByText(t('starterFullBodyBody'))).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:t('finishOnboarding')}));
  expect(repository.list('routines')).toHaveLength(0);expect(repository.localGet('onboardingComplete')).toBe(true);
  expect(router.replace).toHaveBeenLastCalledWith('/');
 });
 test('a failed save shows a quiet row whose Retry runs the same save',async()=>{
  const {openLocalDatabase}=require('../src/data/database') as typeof import('../src/data/database');
  const repository=memoryRepository(),device=memoryRepository();
  jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:()=>device,wipeAll:()=>{}});
  const atomic=jest.spyOn(repository,'atomic').mockImplementationOnce(()=>{throw new Error('synthetic write failure');});
  await wrap(<Onboarding/>,{...state(),repository,session:{user:{id:'synthetic'}} as AuthState['session']});
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');
  await fireEvent.press(screen.getByRole('button',{name:t('continueOnboarding')}));
  await fireEvent.press(screen.getByRole('button',{name:t('finishOnboarding')}));
  expect(screen.getByRole('alert')).toHaveTextContent(t('workoutSaveError'));expect(repository.list('profile')).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button',{name:t('bootRetry')}));
  expect(atomic).toHaveBeenCalled();expect(repository.list('profile')).toHaveLength(1);expect(router.replace).toHaveBeenLastCalledWith('/');
 });
 test('while the account is still loading the button is off and a line says why',async()=>{
  await wrap(<Onboarding/>,{...state(),initialPullComplete:false,repository:memoryRepository(),session:{user:{id:'synthetic'}} as AuthState['session']});
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');
  await fireEvent.press(screen.getByRole('button',{name:t('continueOnboarding')}));
  expect(screen.getByText(t('onboardingPreparing'))).toBeTruthy();expect(screen.getByRole('button',{name:t('finishOnboarding')})).toBeDisabled();
 });
 test('the ages 13+ screen is plain and offers only the way back',async()=>{
  await wrap(<Onboarding/>);await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2020-01-01');
  await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));
  expect(screen.getByRole('header')).toHaveTextContent(t('ages13Title'));expect(t('ages13Body')).not.toMatch(/thanks/i);
  expect(screen.getAllByRole('button')).toHaveLength(1);
 });
});

describe('Settings profile',()=>{
 test('an invalid date shows under the date field, and a good save says Saved',async()=>{
  const repository=memoryRepository();repository.save('profile',{dob:'2000-01-01',weight_unit:'kg',height_m:1.8});
  await render(<AuthContext.Provider value={{...state(),repository}}><ThemeProvider><Profile/></ThemeProvider></AuthContext.Provider>);
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'not a date');
  await fireEvent.press(screen.getByRole('button',{name:t('saveProfileLabel')}));
  expect(screen.getAllByRole('alert').map(node=>node.props.children)).toEqual([t('birthDateInvalid'),t('profileCheckFields')]);
  await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-02');
  await fireEvent.press(screen.getByRole('button',{name:t('saveProfileLabel')}));
  expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByText(t('preferenceSaved'))).toBeTruthy();
  expect(repository.list('profile')[0].data.dob).toBe('2000-01-02');
 });
});
