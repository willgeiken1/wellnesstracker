import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { OnboardingDraftProvider } from '../src/features/onboarding/screen';
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

// Welcome follows onboarding mockup v21 (ob-welcome): Apple, email, Google, Skip for now, then the legal line.
// These replace the earlier Get started, I have an account, Import and Look around rows.
describe('Welcome',()=>{
 test('says what the app is for under one title, over the contour map, with the four strands and the legal line',async()=>{
  await wrap(<Welcome/>);
  expect(screen.getAllByRole('header')).toHaveLength(1);
  expect(screen.getByRole('header')).toHaveTextContent('Insight');
  expect(screen.getByText(t('welcomeLine'))).toBeTruthy();
  expect(screen.getByRole('image',{name:t('welcomeMapLabel')})).toBeTruthy();
  expect(screen.getByTestId('welcome-strands')).toHaveProp('accessibilityLabel','Training, food, sleep and routines');
  for(const word of ['Training','Food','Sleep','Routines'])expect(screen.getByText(word)).toBeTruthy();
  expect(screen.getByText(/By continuing you agree to the/)).toBeTruthy();
  expect(screen.queryByText(/Plus|Subscribe/)).toBeNull();
 });
 test('email, Google and Skip for now come in that order, each going its own way',async()=>{
  const signInWithGoogle=jest.fn(async()=>({ok:false as const,reason:'notConfigured' as const}));
  await wrap(<Welcome/>,{...state(),signInWithGoogle});
  const names=screen.getAllByRole('button').map(b=>b.props.accessibilityLabel as string);
  expect(names.filter(n=>[t('obaEmail'),t('obaGoogle'),t('obaSkip')].includes(n))).toEqual([t('obaEmail'),t('obaGoogle'),t('obaSkip')]);
  await fireEvent.press(screen.getByRole('button',{name:t('obaEmail')}));expect(router.push).toHaveBeenLastCalledWith('/auth/email');
  await fireEvent.press(screen.getByRole('button',{name:t('obaSkip')}));expect(router.push).toHaveBeenLastCalledWith('/auth/skip');
  expect(screen.queryByTestId('welcome-google-notice')).toBeNull();
  await fireEvent.press(screen.getByRole('button',{name:t('obaGoogle')}));
  expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  expect(await screen.findByTestId('welcome-google-notice')).toHaveTextContent(t('obaGoogleOff'));
  for(const old of ['getStarted','haveAccount','importChoose','lookAround'] as const)expect(screen.queryByRole('button',{name:t(old)})).toBeNull();
 });
 test('every way in is at least 44 points tall',async()=>{
  await wrap(<Welcome/>);
  for(const name of [t('obaEmail'),t('obaGoogle'),t('obaSkip')])
   expect(Number(flat(screen.getByRole('button',{name})).minHeight??flat(screen.getByRole('button',{name})).height)).toBeGreaterThanOrEqual(44);
 });
 test('the auth landing route shows this screen and sign-in routes show the form',()=>{
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
  // A fresh install now starts Dark, so sign-in shows the dark field border and accent.
  await wrap(<AuthForm/>);const colors=createTheme('dark');
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

// The setup steps after sign-in are covered in onboarding-flow.test.tsx.

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
