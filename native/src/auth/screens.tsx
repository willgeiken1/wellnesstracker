import { SyncRecovery } from './sync-recovery';
import { BootRecovery } from './boot-recovery';
import { DepartureFailure } from './sign-out';
import { AccountDeletedLocalPending, DELETE_WORD } from './delete-account';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ageOn, onboardingProgress } from '../features/onboarding/model';
import { PreferenceFields } from '../features/onboarding/fields';
import { useDevicePreferences } from '../features/onboarding/device-preferences';
import { TextInput, Alert, Modal, View, KeyboardAvoidingView, Platform, ScrollView, AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/screen';
import { ThemedText } from '../components/themed-text';
import { Button, touchTarget } from '../components/button';
import { Badge } from '../components/badge';
import { useTheme } from '../design/theme-provider';
import { signOutUnsynced, t, type MessageKey } from '../i18n/en';
import { useAuth } from './provider';
import { syncBeforeSignOut } from './sign-out-sync';
import { Card } from '../components/card';
import { SectionLabel } from '../features/settings/parts';
const accountCard={borderRadius:18,padding:16,gap:12} as const;
export function Welcome() {
  const auth=useAuth();
  return <Screen topInset title={t('authWelcome')}>
    <ThemedText>{onboardingProgress(1)}</ThemedText>
    {!auth.configured && <ThemedText accessibilityRole="alert">{t('authUnavailable')}</ThemedText>}
    {auth.configError && <ThemedText accessibilityRole="alert">{auth.configError}</ThemedText>}
    <Button label={t('getStarted')} disabled={!auth.configured} onPress={()=>router.push('/onboarding')}/>
    <Button label={t('importChoose')} variant="secondary" onPress={()=>router.push('/import')}/>
    <Button label={t('lookAround')} variant="secondary" onPress={auth.lookAround}/>
    <Button label={t('haveAccount')} disabled={!auth.configured} variant="secondary" onPress={()=>router.push('/auth/sign-in')}/>
  </Screen>;
}
export function AuthForm({create=false,dob,progress,onCreated,embedded=false,beforeSubmit}: {create?:boolean;dob?:string;progress?:ReactNode;onCreated?:()=>void;embedded?:boolean;beforeSubmit?:()=>boolean}) {
  const auth=useAuth(),{colors}=useTheme();
  const cancelFlow=auth.cancelAuthFlow;
  useEffect(()=>()=>cancelFlow?.(),[cancelFlow]);
  const preferences=useDevicePreferences();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [error,setError]=useState<MessageKey|null>(null),[busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(beforeSubmit&&!beforeSubmit())return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('invalidEmail');return;}
    if(create&&password.length<8){setError('shortPassword');return;}
    if(!password){setError('requiredPassword');return;}
    if(create&&password!==confirm){setError('passwordMismatch');return;}
    if(create){const age=ageOn(dob??'');if(age===null||age<13){setError('invalidProfile');return;}}
    setBusy(true);setError(null);
    try {
      const result=await (create?auth.createAccount(email.trim(),password,dob):auth.signIn(email.trim(),password));
      setPassword('');setConfirm('');
      if(result)setError(['authUnavailable','confirmEmail','invalidProfile','demoCarryUnavailable'].includes(result)?result as MessageKey:'authFailed');
      else if(create){if(onCreated)onCreated();else router.replace('/onboarding');}
      else {await preferences.save();}
    }catch{setError('authFailed');}finally{setBusy(false);}
  };
  const style={color:colors.text,backgroundColor:colors['surface-2'],borderRadius:8,minHeight:touchTarget,padding:12,fontSize:16};
  const content=<>{progress}
    {embedded&&<ThemedText accessibilityRole="header">{t('createAccount')}</ThemedText>}
    {!auth.configured&&<ThemedText accessibilityRole="alert">{t('authUnavailable')}</ThemedText>}
    <TextInput accessibilityLabel={t('email')} placeholder={t('email')} placeholderTextColor={colors['text-muted']} style={style}
      value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" editable={!busy}/>
    <TextInput accessibilityLabel={t('password')} placeholder={t('password')} placeholderTextColor={colors['text-muted']} style={style}
      value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={create?'new-password':'current-password'} textContentType={create?'newPassword':'password'} editable={!busy}/>
    {create&&<TextInput accessibilityLabel={t('confirmPassword')} placeholder={t('confirmPassword')} placeholderTextColor={colors['text-muted']} style={style}
      value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" editable={!busy}/>}
    {!create&&<PreferenceFields value={preferences.value} onChange={preferences.onChange}/>}
    {error&&<ThemedText accessibilityRole="alert">{t(error)}</ThemedText>}
    <Button testID={create?'onboarding-create-account':'auth-sign-in'} label={t(busy?'working':create?'createAccount':'signIn')} disabled={busy||!auth.configured} onPress={()=>{void submit();}}/>
    {!embedded&&<Button label={t('backWelcome')} variant="secondary" onPress={()=>router.replace('/auth')}/>}
  </>;
  return embedded?content:<Screen topInset title={t(create?'createAccount':'signIn')}>{content}</Screen>;
}
export function Account() {
  const {colors}=useTheme();
  const [lossCount,setLossCount]=useState<number|null>(null);
  const auth=useAuth();const [error,setError]=useState<'signOutFailed'|'signOutNotStarted'|'deleteAccountFailed'|'deleteAccountLocalFailed'|null>(null),[busy,setBusy]=useState(false);
  const [deleting,setDeleting]=useState(false),[typed,setTyped]=useState('');
  const typedOk=typed.trim().toUpperCase()===DELETE_WORD;
  const closeDelete=()=>{if(!submitting.current){setDeleting(false);setTyped('');}};
  const deleteAccount=async()=>{
    if(submitting.current||!typedOk||!auth.deleteAccount)return;
    submitting.current=true;setBusy(true);setError(null);
    try {await auth.deleteAccount();}
    catch(cause) {
      // Only a failure before the server confirmed says nothing was erased; after it, the account is already gone.
      const key=cause instanceof AccountDeletedLocalPending?'deleteAccountLocalFailed':cause instanceof DepartureFailure?'signOutFailed':'deleteAccountFailed';
      setError(key);AccessibilityInfo.announceForAccessibility(t(key));
    }
    finally {submitting.current=false;setBusy(false);setDeleting(false);setTyped('');}
  };
  const submitting=useRef(false);
  const leave=async(discardUnsynced=false)=>{
    if(submitting.current)return;
    submitting.current=true;setBusy(true);
    try { if(discardUnsynced)await auth.signOut(true);else await auth.signOut(); }
    catch(cause) {setError(cause instanceof DepartureFailure?'signOutFailed':'signOutNotStarted');}
    finally {submitting.current=false;setBusy(false);setLossCount(null);}
  };
  const signOut=async()=>{
    if(submitting.current)return;
    submitting.current=true;setBusy(true);setError(null);
    try {
      await (auth.prepareSignOut?auth.prepareSignOut():syncBeforeSignOut(auth.syncNow));
      const count=auth.repository?.unsyncedCount()??auth.pending;
      if(count===0) {await auth.signOut();return;}
      setLossCount(count);
    } catch(cause) {setError(cause instanceof DepartureFailure?'signOutFailed':'signOutNotStarted');}
    finally {submitting.current=false;setBusy(false);}
  };
  return <Screen title={t('account')}>
    <Card style={accountCard}>
      <ThemedText variant="headline" style={{fontWeight:'600'}}>{auth.demo?t('settingsExample'):auth.session?.user.email}</ThemedText>
      {auth.demo&&<ThemedText muted>{t('settingsExampleBody')}</ThemedText>}
    </Card>
    {auth.demo?<><Button label={t('createAccount')} disabled={!auth.configured||busy} onPress={()=>router.push('/onboarding')}/><Button label={t('haveAccount')} disabled={!auth.configured||busy} onPress={()=>router.push('/sign-in')}/><Button label={t('leaveDemo')} variant="secondary" disabled={busy} busy={busy} onPress={()=>{void signOut();}}/></>:<>
      <SectionLabel>{t('settingsSync')}</SectionLabel>
      <Card style={accountCard}>
      <ThemedText accessibilityLiveRegion="polite">{t(auth.syncStatus==='syncing'?'syncBusy':auth.syncStatus==='offline'?'syncOffline':auth.pending>0?'syncPending':auth.conflicts>0?'syncConflictStatus':'syncIdle')}</ThemedText>
      {auth.conflicts>0&&<Badge label={`${auth.conflicts} ${t('syncConflicts')}`}/>}
      {auth.pending>0&&<Badge label={`${auth.pending} ${t('pending')}`}/>}
      <SyncRecovery repository={auth.repository}/>
      <Button label={t('syncNow')} disabled={auth.syncStatus==='syncing'} onPress={()=>{void auth.syncNow();}}/>
      </Card>
      <Button label={t('signOut')} variant="destructive" disabled={busy} busy={busy} onPress={()=>{void signOut();}}/>
      {auth.deleteAccount&&<Button testID="account-delete" label={t('deleteAccount')} variant="secondary" disabled={busy} onPress={()=>{setError(null);setDeleting(true);}}/>}
    </>}
    {error&&<ThemedText muted accessibilityRole="alert">{t(error)}</ThemedText>}
    <Modal transparent visible={lossCount!==null} animationType="none" onRequestClose={()=>{if(!submitting.current)setLossCount(null);}}>
      {lossCount!==null&&<View style={{flex:1,justifyContent:'flex-end',backgroundColor:colors.scrim}}>
        <View accessibilityViewIsModal onAccessibilityEscape={()=>{if(!submitting.current)setLossCount(null);}}
          style={{backgroundColor:colors.surface,padding:24,paddingBottom:40,gap:16,borderTopLeftRadius:24,borderTopRightRadius:24}}>
          <ThemedText accessibilityRole="header">{t('signOutConfirm')}</ThemedText>
          <ThemedText>{t('signOutBody')} {signOutUnsynced(lossCount)}</ThemedText>
          <Button label={t('signOutWait')} disabled={busy} variant="secondary" onPress={()=>setLossCount(null)}/>
          <Button label={t('signOutAnyway')} disabled={busy} busy={busy} variant="destructive" onPress={()=>{void leave(true);}}/>
        </View>
      </View>}
    </Modal>
    <Modal transparent visible={deleting} animationType="none" onRequestClose={closeDelete}>
      {deleting&&<KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,justifyContent:'flex-end',backgroundColor:colors.scrim}}>
        <View testID="account-delete-sheet" accessibilityViewIsModal onAccessibilityEscape={closeDelete}
          style={{backgroundColor:colors.surface,maxHeight:'92%',borderTopLeftRadius:24,borderTopRightRadius:24}}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,paddingBottom:40,gap:16}}>
          <ThemedText accessibilityRole="header" variant="headline" style={{fontWeight:'600'}}>{t('deleteAccountTitle')}</ThemedText>
          <ThemedText>{t('deleteAccountBody')}</ThemedText>
          <ThemedText muted>{t('deleteAccountKeeps')}</ThemedText>
          <ThemedText style={{fontWeight:'600'}} importantForAccessibility="no" accessibilityElementsHidden>{t('deleteAccountType')}</ThemedText>
          <TextInput testID="account-delete-word" accessibilityLabel={t('deleteAccountType')} placeholder={DELETE_WORD} placeholderTextColor={colors['text-muted']}
            style={{color:colors.text,backgroundColor:colors['surface-2'],borderRadius:8,minHeight:touchTarget,padding:12,fontSize:16}}
            value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} autoComplete="off" editable={!busy}/>
          <Button label={t('cancel')} variant="secondary" disabled={busy} onPress={closeDelete}/>
          <Button testID="account-delete-confirm" label={t('deleteAccountConfirm')} variant="destructive" disabled={busy||!typedOk} busy={busy} onPress={()=>{void deleteAccount();}}/>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>}
    </Modal>
  </Screen>;
}

/** Recovery actions remain outside the locked navigation routes. */
export function LocalDataRecovery() {
  const auth=useAuth(),submitting=useRef(false);const [busy,setBusy]=useState(false),[error,setError]=useState(false);
  if(!auth.recovery)return null;
  if(auth.recovery==='boot-error')return <BootRecovery/>;
  const run=async()=>{
    if(submitting.current)return;submitting.current=true;setBusy(true);setError(false);
    try {if(auth.recovery==='corrupt-marker'||auth.recovery==='unreadable-marker')await auth.recoverLocalData?.();else await auth.signOut(true);}
    catch {setError(true);}finally{submitting.current=false;setBusy(false);}
  };
  const escape=auth.recovery==='corrupt-marker'||auth.recovery==='unreadable-marker';
  return <Screen title={t('localRecovery')}>
    <ThemedText>{t(escape?'eraseAllBody':auth.recovery==='read-error'?'markerReadFailed':'signOutFailed')}</ThemedText>
    {(auth.recovery==='read-error'||auth.recovery==='unreadable-marker')&&<Button label={t('tryAgain')} onPress={()=>auth.retryMarkerRead?.()}/>}
    {auth.recovery!=='read-error'&&<>
    <Button label={t(escape?'eraseAllLocal':'retrySignOut')} variant="destructive" busy={busy} disabled={busy} onPress={()=>{
      if(escape){void (async()=>{
        let count:number|undefined;try{count=await auth.countRecoveryUnsynced?.();}catch{ /* Warning still required when count is unavailable. */ }
        Alert.alert(t('eraseAllLocal'),count===0?t('eraseAllBody'):`${t('eraseAllBody')} ${count===undefined?t('eraseAllUnsynced'):signOutUnsynced(count)}`,[{text:t('cancel'),style:'cancel'},{text:t('eraseAllLocal'),style:'destructive',onPress:()=>{void run();}}]);
      })();}
      else void run();
    }}/></>}
    {(error||auth.recoveryFailed)&&<ThemedText accessibilityRole="alert">{t('recoveryFailed')}</ThemedText>}
  </Screen>;
}
