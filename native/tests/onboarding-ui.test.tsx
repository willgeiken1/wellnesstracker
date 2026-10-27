import { fireEvent, render, screen } from '@testing-library/react-native';
import { Onboarding, OnboardingDraftProvider } from '../src/features/onboarding/screen';
import { ONBOARDING_STEPS } from '../src/features/onboarding/model';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { t } from '../src/i18n/en';
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn()}}));
jest.mock('../src/auth/client',()=>({getAuthClient:()=>null}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn()}));
const state=():AuthState=>({session:null,demo:false,ready:true,configured:true,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',lookAround:jest.fn(),signIn:jest.fn(async()=>null),createAccount:jest.fn(async()=>null),signOut:jest.fn(async()=>{}),syncNow:jest.fn(async()=>{})});
async function wrap(auth=state()){await render(<AuthContext.Provider value={auth}><OnboardingDraftProvider><ThemeProvider><Onboarding/></ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>);return auth;}
test('under 13 shows kind rejection before account creation or any repository writes',async()=>{
 const auth=await wrap();await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2020-01-01');
 await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));
 expect(screen.getByText(t('ages13Title'))).toBeTruthy();expect(auth.createAccount).not.toHaveBeenCalled();
 expect(screen.queryByLabelText(t('birthDate'))).toBeNull();
});
test('Welcome, About you including credentials, and Start enforce the three-screen cap',async()=>{
 await wrap();expect(ONBOARDING_STEPS).toHaveLength(3);
 expect(ONBOARDING_STEPS).toEqual(['welcome','about','start']);
 expect(screen.getByText('Step 2 of 3')).toBeTruthy();
 await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');
 expect(screen.getByLabelText(t('birthDate'))).toBeTruthy();expect(screen.getByLabelText(t('email'))).toBeTruthy();
});
test('full stats produce editable targets visibly labeled est. on the third and final screen',async()=>{
 const auth=await wrap();await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');
 await fireEvent.press(screen.getByRole('tab',{name:t('metricUnits')}));
 await fireEvent.changeText(screen.getByLabelText(t('profileHeight').replace('{unit}','cm')),'180');
 await fireEvent.changeText(screen.getByLabelText(t('profileWeight').replace('{unit}','kg')),'80');
 await fireEvent.press(screen.getByRole('tab',{name:t('sexMale')}));
 await fireEvent.changeText(screen.getByLabelText(t('email')),'synthetic@example.test');
 await fireEvent.changeText(screen.getByLabelText(t('password')),'synthetic-password');
 await fireEvent.changeText(screen.getByLabelText(t('confirmPassword')),'synthetic-password');
 await fireEvent.press(screen.getByRole('button',{name:t('createAccount')}));
 expect(auth.createAccount).toHaveBeenCalledWith('synthetic@example.test','synthetic-password','2000-01-01');
 expect(screen.getByText('Step 3 of 3')).toBeTruthy();expect(screen.getByText(t('estimatedTargets'))).toBeTruthy();
 await fireEvent.changeText(screen.getByLabelText(t('targetCalories')),'2300');expect(screen.getByLabelText(t('targetCalories'))).toHaveDisplayValue('2300');
 expect(screen.getByRole('switch',{name:t('crashReportsPref')})).toBeChecked();
 expect(screen.getByRole('switch',{name:t('analyticsPref')})).not.toBeChecked();
});

test('signed-in setup finishes locally with no stats, a starter routine, and device-only preferences',async()=>{
 const {memoryRepository}=require('./workout-repository') as typeof import('./workout-repository');
 const {openLocalDatabase}=require('../src/data/database') as typeof import('../src/data/database');
 const repository=memoryRepository(),device=memoryRepository();
 jest.mocked(openLocalDatabase).mockResolvedValue({forOwner:()=>device,wipeAll:()=>{}});
 const auth={...state(),repository,session:{user:{id:'synthetic'}} as AuthState['session']};
 await wrap(auth);
 await fireEvent.changeText(screen.getByLabelText(t('birthDate')),'2000-01-01');
 await fireEvent.press(screen.getByRole('button',{name:t('continueOnboarding')}));
 expect(screen.getByText('Step 3 of 3')).toBeTruthy();expect(screen.getByText(t('targetsUnset'))).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab',{name:t('starterFullBody')}));
 await fireEvent.press(screen.getByRole('button',{name:t('finishOnboarding')}));
 expect(repository.list('profile')[0].data.dob).toBe('2000-01-01');
 expect(repository.list('routines')).toHaveLength(1);expect(repository.list('routine_exercises')).toHaveLength(3);
 expect(repository.list('food_targets')).toHaveLength(0);
 expect(repository.localGet('devicePreferences')).toBeUndefined();
 expect(device.localGet('devicePreferences')).toEqual({crashReports:true,analytics:false});
});
test('Settings profile edits persist, preserve historical rows, and never require optional stats',async()=>{
 const {memoryRepository}=require('./workout-repository') as typeof import('./workout-repository');
 const {Profile}=require('../src/features/onboarding/profile') as typeof import('../src/features/onboarding/profile');
 const repository=memoryRepository();repository.save('profile',{dob:'2000-01-01',weight_unit:'kg',height_m:1.8});
 const history=repository.save('weigh_ins',{day:'2026-01-01',weight_kg:80,entered_value:80,entered_unit:'kg',source:'app'});
 await render(<AuthContext.Provider value={{...state(),repository}}><ThemeProvider><Profile/></ThemeProvider></AuthContext.Provider>);
 await fireEvent.changeText(screen.getByLabelText(t('profileName')),'Synthetic name');
 await fireEvent.press(screen.getByRole('tab',{name:t('imperialUnits')}));
 await fireEvent.press(screen.getByRole('tab',{name:t('activityActive')}));
 await fireEvent.press(screen.getByRole('button',{name:t('saveProfileLabel')}));
 expect(repository.list('profile')[0].data).toMatchObject({name:'Synthetic name',weight_unit:'lb',height_m:1.8});
 expect(repository.list('weigh_ins')).toEqual([history]);
 expect(repository.localGet('profileExtras')).toMatchObject({activity:'active'});
});
