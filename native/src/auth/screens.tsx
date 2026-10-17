import { useState } from 'react';
import { TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/screen';
import { ThemedText } from '../components/themed-text';
import { Button, touchTarget } from '../components/button';
import { Badge } from '../components/badge';
import { useTheme } from '../design/theme-provider';
import { t, type MessageKey } from '../i18n/en';
import { useAuth } from './provider';
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
  const auth=useAuth();const [error,setError]=useState(false);
  const signOut=async()=>{
    await auth.syncNow();
    Alert.alert(t('signOutConfirm'),`${t('signOutBody')} ${t('signOutUnsynced')}`,[
    {text:t('cancel'),style:'cancel'},
    {text:t('signOut'),style:'destructive',onPress:()=>{void auth.signOut(true).catch(()=>setError(true));}},
  ]);
  };
  return <Screen title={t('account')}>
    <ThemedText>{auth.demo?t('demoMode'):auth.session?.user.email}</ThemedText>
    {auth.demo?<Button label={t('leaveDemo')} variant="secondary" onPress={signOut}/>:<>
      <ThemedText accessibilityLiveRegion="polite">{t(auth.syncStatus==='syncing'?'syncBusy':auth.syncStatus==='offline'?'syncOffline':auth.pending>0?'syncPending':auth.conflicts>0?'syncConflictStatus':'syncIdle')}</ThemedText>
      {auth.conflicts>0&&<Badge label={`${auth.conflicts} ${t('syncConflicts')}`}/>}
      {auth.pending>0&&<Badge label={`${auth.pending} ${t('pending')}`}/>}
      <Button label={t('syncNow')} disabled={auth.syncStatus==='syncing'} onPress={()=>{void auth.syncNow();}}/>
      <Button label={t('signOut')} variant="destructive" onPress={signOut}/>
    </>}
    {error&&<ThemedText accessibilityRole="alert">{t('signOutFailed')}</ThemedText>}
  </Screen>;
}
