import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, KIT, KitText, Sheet, SheetHeader, TextField, font, useKit } from '@/components/kit';
import { LEGAL_LINKS, openPage } from '@/features/settings/links';
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
  const prefs = !create && <PreferenceFields value={preferences.value} disabled={!preferences.loaded} onChange={preferences.onChange} />;
  if (embedded) return <>{fields}{prefs}{notice}{action}</>;
  return <Shell onBack={() => router.replace('/auth')}>
    <Heading title={t(create ? 'createAccount' : 'signIn')} body={create ? undefined : t('signInBody')} />
    {fields}
    {prefs}
    {notice}
    {action}
  </Shell>;
}

/** Typed problems with the email sheet's own fields, checked before anything is sent. */
export function emailProblem(email: string, password: string): MessageKey | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'invalidEmail';
  if (!password) return 'requiredPassword';
  return null;
}

/**
 * ob-email, the Continue with email sheet: one path for new and returning people. It signs in, or makes the account when
 * there is none (the auth provider's `continueWithEmail`). Once signed in, the sign-in screens close and the app's own
 * check for a new account opens setup. Forgot your password opens Help and support.
 */
export function EmailSheet() {
  const auth = useAuth();
  const cancelFlow = auth.cancelAuthFlow;
  useEffect(() => () => cancelFlow?.(), [cancelFlow]);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState<MessageKey | null>(null), [busy, setBusy] = useState(false);
  const passwordInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const submit = async () => {
    if (busy) return;
    const problem = emailProblem(email, password);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const go = auth.continueWithEmail ?? auth.signIn;
      const result = await go(email.trim(), password);
      setPassword('');
      if (result) setError(['authUnavailable', 'confirmEmail', 'invalidProfile', 'demoCarryUnavailable'].includes(result) ? result as MessageKey : 'authFailed');
    } catch { setError('authFailed'); } finally { setBusy(false); }
  };
  return <Sheet testID="email-sheet" header={<SheetHeader />}>
    <View>
      <KitText weight={700} size={30} lineHeight={1.1} tracking={-0.03} accessibilityRole="header" style={{ marginTop: 2, marginBottom: 6 }}>{t('obaEmail')}</KitText>
      <KitText weight={500} size={15} lineHeight={1.45} color="text-muted" style={{ marginBottom: 18 }}>{t('obaEmailLede')}</KitText>
      <View style={{ gap: 10 }}>
        <TextField testID="email-sheet-email" label={t('obaEmailLabel')} placeholder={t('obaEmailPlaceholder')} value={email} onChangeText={setEmail} editable={!busy}
          keyboardType="email-address" autoComplete="email" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false}
          returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} />
        <PasswordField inputRef={passwordInput} value={password} onChange={setPassword} disabled={busy} onSubmit={() => { void submit(); }} />
        {error && <Notice testID="auth-error" text={t(error === 'authUnavailable' ? 'accountsUnavailable' : error)} />}
        <Button testID="email-sheet-continue" full label={t(busy ? 'working' : 'obaContinue')} busy={busy} onPress={() => { void submit(); }} style={{ marginTop: 8 }} />
        <KitText weight={500} size={12.5} lineHeight={1.45} color="text-muted" style={{ textAlign: 'center', marginTop: 6, marginHorizontal: 4 }}>
          {t('obaForgot')}<KitText weight={600} size={12.5} color="accent" accessibilityRole="link" accessibilityHint={t('obaResetHint')}
            onPress={() => { void openPage(LEGAL_LINKS.support); }}>{t('obaReset')}</KitText>
        </KitText>
      </View>
    </View>
  </Sheet>;
}

/** The kit field with a password in it: the same look as TextField, with secure entry and a ref for Return on Email. */
function PasswordField({ inputRef, value, onChange, disabled, onSubmit }: { inputRef: React.RefObject<React.ComponentRef<typeof TextInput> | null>; value: string; onChange: (v: string) => void; disabled: boolean; onSubmit: () => void }) {
  const k = useKit();
  const [focused, setFocused] = useState(false);
  return <View testID="email-sheet-password" style={{ backgroundColor: k.cardBg, borderRadius: KIT.radius.field, paddingVertical: 10, paddingHorizontal: 14,
    boxShadow: focused ? `0px 0px 0px 1.5px ${k.c.accent}` : k.cardEdge }}>
    <KitText weight={600} size={12} color="text-muted">{t('obaPasswordLabel')}</KitText>
    <TextInput ref={inputRef} accessibilityLabel={t('obaPasswordLabel')} value={value} onChangeText={onChange} editable={!disabled}
      placeholder={t('obaPasswordPlaceholder')} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password"
      returnKeyType="go" onSubmitEditing={onSubmit} allowFontScaling maxFontSizeMultiplier={0}
      placeholderTextColor={k.tint(k.c['text-muted'], 0.78)} selectionColor={k.c.accent} cursorColor={k.c.accent}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={[font(600, 17), { color: k.c.text, paddingTop: 2, paddingBottom: 0, paddingHorizontal: 0, minHeight: 24 }]} />
  </View>;
}
