import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { Screen } from '../../components/screen';
import { ThemedText } from '../../components/themed-text';
import { Button } from '../../components/button';
import { SegmentedControl } from '../../components/segmented-control';
import { useAuth } from '../../auth/provider';
import { AuthForm } from '../../auth/screens';
import { t } from '../../i18n/en';
import { ProfileFields, Field, PreferenceFields } from './fields';
import { ageOn, emptyProfile, estimateTargets, finishOnboarding, validProfile, ONBOARDING_STEPS, type ProfileInput, type Targets } from './model';
import { saveDevicePreferences } from './device-preferences';
interface Draft { profile:ProfileInput;step:number;setProfile:(value:ProfileInput)=>void;setStep:(value:number)=>void;reset:()=>void }
const DraftContext=createContext<Draft|null>(null);
/** Outside owner-keyed theme/navigation: only memory, including email-confirmation transitions. */
export function OnboardingDraftProvider({children}:PropsWithChildren) {
  const [profile,setProfile]=useState(emptyProfile),[step,setStep]=useState(1);
  return <DraftContext.Provider value={{profile,step,setProfile,setStep,reset:()=>{setProfile(emptyProfile());setStep(1);}}}>{children}</DraftContext.Provider>;
}
export function Onboarding() {
  const draft=useContext(DraftContext);if(!draft)throw new Error('OnboardingDraftProvider required.');
  return <Flow draft={draft}/>;
}
function Flow({draft}:{draft:Draft}) {
  const auth=useAuth();const {profile,setProfile,step,setStep,reset}=draft;
  const [blocked,setBlocked]=useState(false),[error,setError]=useState(false);
  if(blocked)return <Screen topInset title={t('ages13Title')}><ThemedText>{t('ages13Body')}</ThemedText><Button label={t('backWelcome')} onPress={()=>{reset();router.replace('/auth');}}/></Screen>;
  const progress=<ThemedText>{t('onboardingStep').replace('{step}',String(step+1))}</ThemedText>;
  const validate=()=>{
    const age=ageOn(profile.dob);
    if(age!==null&&age<13){reset();setBlocked(true);return false;}
    if(!validProfile(profile)){setError(true);return false;}
    setError(false);return true;
  };
  if(step===1)return <Screen topInset title={t('aboutYou')}>{progress}<ProfileFields value={profile} onChange={setProfile}/>
    {error&&<ThemedText accessibilityRole="alert">{t('invalidProfile')}</ThemedText>}
    {auth.session?<Button label={t('continueOnboarding')} onPress={()=>{if(validate())setStep(2);}}/>:
      <AuthForm embedded create dob={profile.dob} beforeSubmit={validate} onCreated={()=>setStep(2)}/>}
    <Button label={t('backWelcome')} variant="secondary" onPress={()=>{reset();router.replace(auth.demo?'/settings/account':'/auth');}}/>
  </Screen>;
  return <Start profile={profile} progress={<ThemedText>{t('onboardingStep').replace('{step}',String(ONBOARDING_STEPS.length))}</ThemedText>} onFinish={reset}/>;
}
function Start({profile,progress,onFinish}:{profile:ProfileInput;progress:React.ReactNode;onFinish:()=>void}) {
  const auth=useAuth(),[template,setTemplate]=useState<'empty'|'fullBody'>('empty');
  const [estimated]=useState(()=>estimateTargets(profile));
  const [values,setValues]=useState(()=>estimated?{energy_kj:String(Math.round(estimated.energy_kj/4.184)),protein_g:String(estimated.protein_g),carbs_g:String(estimated.carbs_g),fat_g:String(estimated.fat_g)}:null);
  const [prefs,setPrefs]=useState({crashReports:true,analytics:false});
  const [error,setError]=useState<'invalidTargets'|'workoutSaveError'|null>(null),[busy,setBusy]=useState(false);
  return <Screen topInset title={t('startOnboarding')}>{progress}
    <SegmentedControl label={t('starterChoice')} value={template} options={[{value:'empty',label:t('startEmpty')},{value:'fullBody',label:t('starterFullBody')}]} onChange={setTemplate}/>
    {values?<><ThemedText variant="title">{t('estimatedTargets')}</ThemedText><ThemedText>{t('estimatedTargetsHelp')}</ThemedText>
      {(['energy_kj','protein_g','carbs_g','fat_g'] as const).map((key,i)=><Field key={key} numeric label={t((['targetCalories','targetProtein','targetCarbs','targetFat'] as const)[i])} value={values[key]} onChange={value=>setValues({...values,[key]:value})}/>)}</>:<ThemedText>{t('targetsUnset')}</ThemedText>}
    <PreferenceFields value={prefs} onChange={setPrefs}/>
    {error&&<ThemedText accessibilityRole="alert">{t(error)}</ThemedText>}
    <Button label={t(busy?'working':'finishOnboarding')} disabled={busy||!auth.session||!auth.repository} onPress={()=>{void (async()=>{
      let targets:Targets|null=null;
      if(values){if(Object.values(values).some(v=>!v.trim()||!Number.isFinite(Number(v))||Number(v)<0)||Number(values.energy_kj)<=0){setError('invalidTargets');return;}
        targets={energy_kj:Number(values.energy_kj)*4.184,protein_g:Number(values.protein_g),carbs_g:Number(values.carbs_g),fat_g:Number(values.fat_g)};}
      if(!auth.repository||!auth.session||busy)return;
      setBusy(true);try{finishOnboarding(auth.repository,profile,template,targets);await saveDevicePreferences(prefs);onFinish();router.replace('/');}catch{setError('workoutSaveError');}finally{setBusy(false);}
    })();}}/>
  </Screen>;
}
