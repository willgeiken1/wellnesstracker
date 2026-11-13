import { createContext, useCallback, useContext, useRef, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '../../components/themed-text';
import { useAuth } from '../../auth/provider';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n/en';
import { ProfileFields, Field, PreferenceFields, profileErrors } from './fields';
import { AuthForm } from './auth-form';
import { Group, Heading, Notice, PrimaryButton, ChoiceTile, Shell, type ShellScroll } from './parts';
import { ageOn, emptyProfile, estimateTargets, finishOnboarding, validProfile, ONBOARDING_STEPS, type ProfileInput, type Targets } from './model';
import { useDevicePreferences } from './device-preferences';
import { HealthStep, shouldOfferHealth } from './health-step';
interface Draft { blocked:boolean;block:()=>void; profile:ProfileInput;step:number;setProfile:(value:ProfileInput)=>void;setStep:(value:number)=>void;reset:()=>void }
const DraftContext=createContext<Draft|null>(null);
/** Outside owner-keyed theme/navigation: only memory, including email-confirmation transitions. */
export function OnboardingDraftProvider({children}:PropsWithChildren) {
  // Session-only boolean survives route unmounts; reset discards DOB, not the age block.
  const [blocked,setBlocked]=useState(false);
  const [profile,setProfile]=useState(emptyProfile),[step,setStep]=useState(1);
  return <DraftContext.Provider value={{blocked,block:()=>setBlocked(true),profile,step,setProfile,setStep,reset:()=>{setProfile(emptyProfile());setStep(1);}}}>{children}</DraftContext.Provider>;
}
export function Onboarding() {
  const draft=useContext(DraftContext);if(!draft)throw new Error('OnboardingDraftProvider required.');
  return <Flow draft={draft}/>;
}
function Flow({draft}:{draft:Draft}) {
  const auth=useAuth();const {profile,setProfile,step,setStep,reset,blocked}=draft;
  const [error,setError]=useState(false);
  // The button sits below a long form, so a failed check scrolls back up to the field that carries the message.
  const scroll=useRef<ShellScroll>(null);
  // Leaving setup: Home first, then the draft is cleared, so the About you step never flashes on the way out.
  const leave=useCallback(()=>{router.replace('/');reset();},[reset]);
  if(blocked)return <Shell><Heading title={t('ages13Title')} body={t('ages13Body')}/>
    <PrimaryButton label={t('backWelcome')} onPress={()=>{reset();router.replace('/auth');}}/></Shell>;
  const validate=()=>{
    const age=ageOn(profile.dob);
    if(age!==null&&age<13){reset();draft.block();auth.blockOnboarding?.();return false;}
    if(!validProfile(profile)){setError(true);scroll.current?.scrollTo({y:0,animated:true});return false;}
    setError(false);return true;
  };
  if(step===1)return <Shell step={2} scrollRef={scroll} onBack={()=>{reset();router.replace(auth.demo?'/settings/account':'/auth');}}>
    <Heading title={t('aboutYou')}/>
    <ProfileFields value={profile} onChange={value=>{setProfile(value);setError(false);}} errors={error?profileErrors(profile):undefined}/>
    {auth.session?<PrimaryButton testID="onboarding-continue" label={t('continueOnboarding')} onPress={()=>{if(validate())setStep(2);}}/>:
      <AuthForm embedded create dob={profile.dob} beforeSubmit={validate} onCreated={()=>setStep(2)}/>}
  </Shell>;
  if(step===3)return <HealthStep onDone={leave}/>;
  // Saved: Apple Health comes next where it can be offered (REDESIGN §3.6), otherwise Home.
  return <Start profile={profile} onFinish={async()=>{if(await shouldOfferHealth())setStep(3);else leave();}}/>;
}
const TARGET_LABELS=['targetCalories','targetProtein','targetCarbs','targetFat'] as const;
function Start({profile,onFinish}:{profile:ProfileInput;onFinish:()=>Promise<void>}) {
  const auth=useAuth(),[template,setTemplate]=useState<'empty'|'fullBody'>('empty');
  const [estimated]=useState(()=>estimateTargets(profile));
  const [values,setValues]=useState(()=>estimated?{energy_kj:String(Math.round(estimated.energy_kj/4.184)),protein_g:String(estimated.protein_g),carbs_g:String(estimated.carbs_g),fat_g:String(estimated.fat_g)}:null);
  const preferences=useDevicePreferences();
  const [error,setError]=useState<'invalidTargets'|'workoutSaveError'|null>(null),[busy,setBusy]=useState(false);
  const ready=!!auth.session&&!!auth.repository&&!!auth.initialPullComplete;
  const finish=async()=>{
    let targets:Targets|null=null;
    if(values){if(Object.values(values).some(v=>!v.trim()||!Number.isFinite(Number(v))||Number(v)<0)||Number(values.energy_kj)<=0){setError('invalidTargets');return;}
      targets={energy_kj:Number(values.energy_kj)*4.184,protein_g:Number(values.protein_g),carbs_g:Number(values.carbs_g),fat_g:Number(values.fat_g)};}
    if(!auth.repository||!auth.session||busy||!auth.initialPullComplete)return;
    setBusy(true);try{finishOnboarding(auth.repository,profile,template,targets);await preferences.save();}catch{setError('workoutSaveError');setBusy(false);return;}
    try{await onFinish();}finally{setBusy(false);}
  };
  return <Shell step={ONBOARDING_STEPS.length}>
    <Heading title={t('startOnboarding')}/>
    <Group testID="onboarding-starter" title={t('starterChoice')}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('starterChoice')} style={{gap:tokens.spacing[1]}}>
        <ChoiceTile testID="starter-empty" label={t('starterNone')} body={t('starterNoneBody')} selected={template==='empty'} onPress={()=>setTemplate('empty')}/>
        <ChoiceTile testID="starter-full-body" label={t('starterFullBody')} body={t('starterFullBodyBody')} selected={template==='fullBody'} onPress={()=>setTemplate('fullBody')}/>
      </View>
    </Group>
    {values?<Group testID="onboarding-targets" title={t('estimatedTargets')} body={t(profile.goal==='lose'?'estimatedTargetsHelpLose':profile.goal==='gain'?'estimatedTargetsHelpGain':'estimatedTargetsHelp')}>
      <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-end',gap:tokens.spacing[2]}}>
        {(['energy_kj','protein_g','carbs_g','fat_g'] as const).map((key,i)=><View key={key} style={{flexGrow:1,flexBasis:'45%'}}>
          <Field numeric label={t(TARGET_LABELS[i])} value={values[key]} onChange={value=>setValues({...values,[key]:value})}/></View>)}
      </View>
      {error==='invalidTargets'&&<Notice testID="onboarding-targets-error" text={t(error)}/>}
    </Group>:<Group testID="onboarding-targets-unset" title={t('onboardingTargets')}><ThemedText muted>{t('targetsUnset')}</ThemedText></Group>}
    <PreferenceFields value={preferences.value} onChange={preferences.onChange}/>
    {auth.session&&!ready&&<ThemedText testID="onboarding-preparing" muted variant="caption" accessibilityLiveRegion="polite">{t('onboardingPreparing')}</ThemedText>}
    {error==='workoutSaveError'&&<Notice testID="onboarding-save-error" text={t(error)} onRetry={()=>{void finish();}}/>}
    <PrimaryButton testID="onboarding-finish" label={t(busy?'working':'finishOnboarding')} busy={busy} disabled={busy||!ready} onPress={()=>{void finish();}}/>
  </Shell>;
}
