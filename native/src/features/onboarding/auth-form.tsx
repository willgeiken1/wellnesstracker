import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../../auth/provider';
import { t, type MessageKey } from '../../i18n/en';
import { ageOn } from './model';
import { Field, PreferenceFields, type FieldInput } from './fields';
import { useDevicePreferences } from './device-preferences';
import { Group, Heading, Notice, PrimaryButton, Shell } from './parts';

// Problems the person fixes by typing something else. Everything else is a failed request, which gets Retry.
const TYPED: readonly MessageKey[] = ['invalidEmail', 'shortPassword', 'requiredPassword', 'passwordMismatch', 'invalidProfile', 'confirmEmail', 'demoCarryUnavailable'];

/**
 * Email and password for signing in or creating an account. This is the look only: the checks, their order
 * and the calls into the auth provider match the form in src/auth/screens.tsx line for line.
 */
export function AuthForm({ create = false, dob, onCreated, embedded = false, beforeSubmit }: { create?: boolean; dob?: string; onCreated?: () => void; embedded?: boolean; beforeSubmit?: () => boolean }) {
  const auth = useAuth();
  const cancelFlow = auth.cancelAuthFlow;
  useEffect(() => () => cancelFlow?.(), [cancelFlow]);
  const preferences = useDevicePreferences();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [error, setError] = useState<MessageKey | null>(null), [busy, setBusy] = useState(false);
  const passwordInput = useRef<FieldInput>(null), confirmInput = useRef<FieldInput>(null);
  const submit = async () => {
    if (busy) return;
    if (beforeSubmit && !beforeSubmit()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('invalidEmail'); return; }
    if (create && password.length < 8) { setError('shortPassword'); return; }
    if (!password) { setError('requiredPassword'); return; }
    if (create && password !== confirm) { setError('passwordMismatch'); return; }
    if (create) { const age = ageOn(dob ?? ''); if (age === null || age < 13) { setError('invalidProfile'); return; } }
    setBusy(true); setError(null);
    try {
      const result = await (create ? auth.createAccount(email.trim(), password, dob) : auth.signIn(email.trim(), password));
      setPassword(''); setConfirm('');
      if (result) setError(['authUnavailable', 'confirmEmail', 'invalidProfile', 'demoCarryUnavailable'].includes(result) ? result as MessageKey : 'authFailed');
      else if (create) { if (onCreated) onCreated(); else router.replace('/onboarding'); }
      else { await preferences.save(); }
    } catch { setError('authFailed'); } finally { setBusy(false); }
  };
  const fields = <Group testID="auth-fields" title={embedded ? t('signInDetails') : undefined}>
    {!auth.configured && <Notice testID="auth-unavailable" text={t('accountsUnavailable')} />}
    <Field label={t('email')} value={email} onChange={setEmail} disabled={busy}
      input={{ keyboardType: 'email-address', autoComplete: 'email', textContentType: 'emailAddress', returnKeyType: 'next',
        submitBehavior: 'submit', onSubmitEditing: () => passwordInput.current?.focus() }} />
    <Field ref={passwordInput} label={t('password')} value={password} onChange={setPassword} disabled={busy} helper={create ? t('passwordHelp') : undefined}
      input={{ secureTextEntry: true, autoComplete: create ? 'new-password' : 'current-password', textContentType: create ? 'newPassword' : 'password',
        returnKeyType: create ? 'next' : 'go', submitBehavior: create ? 'submit' : 'blurAndSubmit',
        onSubmitEditing: () => { if (create) confirmInput.current?.focus(); else void submit(); } }} />
    {create && <Field ref={confirmInput} label={t('confirmPassword')} value={confirm} onChange={setConfirm} disabled={busy}
      input={{ secureTextEntry: true, autoComplete: 'new-password', textContentType: 'newPassword', returnKeyType: 'go', onSubmitEditing: () => { void submit(); } }} />}
  </Group>;
  // The password is cleared after a failed request, so Retry puts the cursor back in it instead of resending.
  const notice = error && <Notice testID="auth-error" text={t(error === 'authUnavailable' ? 'accountsUnavailable' : error)} onRetry={TYPED.includes(error) || !auth.configured ? undefined : () => passwordInput.current?.focus()} />;
  const action = <PrimaryButton testID={create ? 'onboarding-create-account' : 'auth-sign-in'} label={t(busy ? 'working' : create ? 'createAccount' : 'signIn')}
    busy={busy} disabled={busy || !auth.configured} onPress={() => { void submit(); }} />;
  const prefs = !create && <PreferenceFields value={preferences.value} onChange={preferences.onChange} />;
  if (embedded) return <>{fields}{prefs}{notice}{action}</>;
  return <Shell onBack={() => router.replace('/auth')}>
    <Heading title={t(create ? 'createAccount' : 'signIn')} body={create ? undefined : t('signInBody')} />
    {fields}
    {prefs}
    {notice}
    {action}
  </Shell>;
}
