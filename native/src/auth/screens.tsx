import { DepartureFailure } from './sign-out';
import { useRef, useState } from 'react';
import { TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/screen';
import { ThemedText } from '../components/themed-text';
import { Button, touchTarget } from '../components/button';
import { Badge } from '../components/badge';
import { useTheme } from '../design/theme-provider';
import { signOutUnsynced, t, type MessageKey } from '../i18n/en';
import { useAuth } from './provider';
import { syncBeforeSignOut } from './sign-out-sync';
export function Welcome() {
  const auth=useAuth();
  return <Screen title={t('authWelcome')}>
    {!auth.configured && <ThemedText accessibilityRole="alert">{t('authUnavailable')}</ThemedText>}
    {auth.configError && <ThemedText accessibilityRole="alert">{auth.configError}</ThemedText>}
    <Button label={t('getStarted')} disabled={!auth.configured} onPress={()=>router.push('/auth/create-account')}/>
    <Button label={t('haveAccount')} disabled={!auth.configured} variant="secondary" onPress={()=>router.push('/auth/sign-in')}/>
    <Button label={t('lookAround')} variant="secondary" onPress={auth.lookAround}/>
  </Screen>;
}
export function AuthForm({create=false}: {create?:boolean}) {
  const auth=useAuth(),{colors}=useTheme();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [error,setError]=useState<MessageKey|null>(null),[busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('invalidEmail');return;}
    if(create&&password.length<8){setError('shortPassword');return;}
    if(!password){setError('requiredPassword');return;}
    if(create&&password!==confirm){setError('passwordMismatch');return;}
    setBusy(true);setError(null);
    try {
      const result=await (create?auth.createAccount:auth.signIn)(email.trim(),password);
      setPassword('');setConfirm('');
      if(result)setError(['authUnavailable','confirmEmail'].includes(result)?result as MessageKey:'authFailed');
      else if(create)router.replace('/onboarding');
    }catch{setError('authFailed');}finally{setBusy(false);}
  };
  const style={color:colors.text,backgroundColor:colors['surface-2'],borderRadius:8,minHeight:touchTarget,padding:12,fontSize:16};
  return <Screen title={t(create?'createAccount':'signIn')}>
    {!auth.configured&&<ThemedText accessibilityRole="alert">{t('authUnavailable')}</ThemedText>}
    <TextInput accessibilityLabel={t('email')} placeholder={t('email')} placeholderTextColor={colors['text-muted']} style={style}
      value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" editable={!busy}/>
    <TextInput accessibilityLabel={t('password')} placeholder={t('password')} placeholderTextColor={colors['text-muted']} style={style}
      value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={create?'new-password':'current-password'} textContentType={create?'newPassword':'password'} editable={!busy}/>
    {create&&<TextInput accessibilityLabel={t('confirmPassword')} placeholder={t('confirmPassword')} placeholderTextColor={colors['text-muted']} style={style}
      value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" editable={!busy}/>}
    {error&&<ThemedText accessibilityRole="alert">{t(error)}</ThemedText>}
    <Button label={t(busy?'working':create?'createAccount':'signIn')} disabled={busy||!auth.configured} onPress={()=>{void submit();}}/>
    <Button label={t('backWelcome')} variant="secondary" onPress={()=>router.replace('/auth')}/>
  </Screen>;
}
export function Account() {
  const auth=useAuth();const [error,setError]=useState<'signOutFailed'|'signOutNotStarted'|null>(null),[busy,setBusy]=useState(false);
  const submitting=useRef(false);
  const leave=async(discardUnsynced=false)=>{
    if(submitting.current)return;
    submitting.current=true;setBusy(true);
    try { if(discardUnsynced)await auth.signOut(true);else await auth.signOut(); }
    catch(cause) {setError(cause instanceof DepartureFailure?'signOutFailed':'signOutNotStarted');}
    finally {submitting.current=false;setBusy(false);}
  };
  const signOut=async()=>{
    if(submitting.current)return;
    submitting.current=true;setBusy(true);setError(null);
    try {
      await (auth.prepareSignOut?auth.prepareSignOut():syncBeforeSignOut(auth.syncNow));
      const count=auth.repository?.unsyncedCount()??auth.pending;
      if(count===0) {await auth.signOut();return;}
      Alert.alert(t('signOutConfirm'),`${t('signOutBody')} ${signOutUnsynced(count)}`,[
        {text:t('cancel'),style:'cancel'},
        {text:t('signOut'),style:'destructive',onPress:()=>{void leave(true);}},
      ]);
    } catch(cause) {setError(cause instanceof DepartureFailure?'signOutFailed':'signOutNotStarted');}
    finally {submitting.current=false;setBusy(false);}
  };
  return <Screen title={t('account')}>
    <ThemedText>{auth.demo?t('demoMode'):auth.session?.user.email}</ThemedText>
    {auth.demo?<Button label={t('leaveDemo')} variant="secondary" disabled={busy} busy={busy} onPress={()=>{void signOut();}}/>:<>
      <ThemedText accessibilityLiveRegion="polite">{t(auth.syncStatus==='syncing'?'syncBusy':auth.syncStatus==='offline'?'syncOffline':auth.pending>0?'syncPending':auth.conflicts>0?'syncConflictStatus':'syncIdle')}</ThemedText>
      {auth.conflicts>0&&<Badge label={`${auth.conflicts} ${t('syncConflicts')}`}/>}
      {auth.pending>0&&<Badge label={`${auth.pending} ${t('pending')}`}/>}
      <Button label={t('syncNow')} disabled={auth.syncStatus==='syncing'} onPress={()=>{void auth.syncNow();}}/>
      <Button label={t('signOut')} variant="destructive" disabled={busy} busy={busy} onPress={()=>{void signOut();}}/>
    </>}
    {error&&<ThemedText accessibilityRole="alert">{t(error)}</ThemedText>}
  </Screen>;
}

/** Recovery actions remain outside the locked navigation routes. */
export function LocalDataRecovery() {
  const auth=useAuth(),submitting=useRef(false);const [busy,setBusy]=useState(false),[error,setError]=useState(false);
  if(!auth.recovery)return null;
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
        Alert.alert(t('eraseAllLocal'),`${t('eraseAllBody')} ${count===undefined?t('eraseAllUnsynced'):signOutUnsynced(count)}`,[{text:t('cancel'),style:'cancel'},{text:t('eraseAllLocal'),style:'destructive',onPress:()=>{void run();}}]);
      })();}
      else void run();
    }}/></>}
    {(error||auth.recoveryFailed)&&<ThemedText accessibilityRole="alert">{t('recoveryFailed')}</ThemedText>}
  </Screen>;
}
