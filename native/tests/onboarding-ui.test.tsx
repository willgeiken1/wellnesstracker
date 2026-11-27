import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Onboarding, OnboardingDraftProvider } from '../src/features/onboarding/screen';
import { AuthContext, type AuthState } from '../src/auth/provider';
import { ThemeProvider } from '../src/design/theme-provider';
import { t } from '../src/i18n/en';
import { memoryRepository } from './workout-repository';
jest.mock('expo-router',()=>({router:{push:jest.fn(),replace:jest.fn(),back:jest.fn(),canGoBack:jest.fn(()=>false)},Stack:{Screen:()=>null},useLocalSearchParams:()=>({})}));
jest.mock('../src/auth/client',()=>({getAuthClient:()=>null}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn()}));
jest.mock('../src/features/health/use-apple-health',()=>({useAppleHealth:()=>({access:'unavailable',busy:false,added:null,failed:false,connect:jest.fn()})}));
jest.mock('../src/features/health/use-oura',()=>({useOura:()=>({state:'unavailable',busy:false,failed:false,connect:jest.fn(),refresh:jest.fn(),disconnect:jest.fn()})}));
const state=():AuthState=>({initialPullComplete:true,session:null,demo:false,ready:true,configured:true,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',lookAround:jest.fn(),signIn:jest.fn(async()=>null),createAccount:jest.fn(async()=>null),signOut:jest.fn(async()=>{}),syncNow:jest.fn(async()=>{})});
const signedIn=(repository=memoryRepository()):AuthState=>({...state(),repository,session:{user:{id:'synthetic'}} as AuthState['session'],blockOnboarding:jest.fn()});
async function wrap(auth=state()){await render(<AuthContext.Provider value={auth}><OnboardingDraftProvider><ThemeProvider><Onboarding/></ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>);return auth;}
beforeEach(()=>{jest.mocked(router.replace).mockClear();});

test('setup opens on the first name, with no account form: signing in happens on Welcome first',async()=>{
 await wrap(signedIn());
 expect(screen.getByText(t('obbNameTitle'))).toBeTruthy();
 expect(screen.getByLabelText(t('obbFirstName'))).toBeTruthy();
 expect(screen.queryByLabelText(t('email'))).toBeNull();expect(screen.queryByLabelText(t('password'))).toBeNull();
 expect(screen.getByLabelText(t('obbScreen').replace('{eyebrow}',t('obbEbAbout')))).toBeTruthy();
});
test('without an account or a phone-only profile setup returns to Welcome, and the demo to sign-in',async()=>{
 await wrap({...state(),repository:memoryRepository()});expect(router.replace).toHaveBeenCalledWith('/auth');
 jest.mocked(router.replace).mockClear();
 await wrap({...state(),demo:true,repository:memoryRepository()});expect(router.replace).toHaveBeenCalledWith('/sign-in');
});
test('a phone-only guest sets up on this phone with no account',async()=>{
 const repository=memoryRepository();
 await wrap({...state(),phoneOnly:true,repository});
 expect(router.replace).not.toHaveBeenCalled();expect(screen.getByText(t('obbNameTitle'))).toBeTruthy();
});
test('a guest from Skip for now, Start as a guest, sets up on this phone with no account',async()=>{
 const repository=memoryRepository();
 await wrap({...state(),guest:true,repository});
 expect(router.replace).not.toHaveBeenCalled();expect(screen.getByText(t('obbNameTitle'))).toBeTruthy();
 // A guest already set up goes Home, as an account does.
 repository.localSave('onboardingComplete',true);
 await wrap({...state(),guest:true,repository});expect(router.replace).toHaveBeenCalledWith('/');
});

test('Settings profile edits persist, preserve historical rows, and never require optional stats',async()=>{
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

test('under-13 block survives Back and route remount in the same onboarding session',async()=>{
 const auth=signedIn();
 const Route=({show}:{show:boolean})=><AuthContext.Provider value={auth}><OnboardingDraftProvider><ThemeProvider>{show&&<Onboarding/>}</ThemeProvider></OnboardingDraftProvider></AuthContext.Provider>;
 const view=await render(<Route show/>);
 await fireEvent.changeText(screen.getByLabelText(t('obbFirstName')),'Sam');await fireEvent.press(screen.getByTestId('onboarding-continue'));
 await fireEvent.changeText(screen.getByLabelText(t('obbAgeYears')),'12');await fireEvent.press(screen.getByTestId('onboarding-continue'));
 expect(screen.getByText(t('ages13Title'))).toBeTruthy();expect(auth.blockOnboarding).toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:t('backWelcome')}));
 await view.rerender(<Route show={false}/>);await view.rerender(<Route show/>);
 expect(screen.getByText(t('ages13Title'))).toBeTruthy();expect(screen.queryByLabelText(t('obbFirstName'))).toBeNull();
 expect(auth.repository!.list('profile')).toEqual([]);
});
