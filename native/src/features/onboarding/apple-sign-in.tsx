import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useAuth, type AuthState } from '@/auth/provider';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { Notice } from './parts';

/* Sign in with Apple on Welcome (pages/settings.js `welcome`, `.st-apple`): the first way in, a full-width pill 52 points
 * tall in the text colour (white in Dark, black in Light). iOS draws the button itself, so its look and wording are the
 * ones Apple approves. Apple's sheet confirms who it is; the backend then signs in with the token Apple returns. */

/** A one-time value for this request: Apple gets its SHA-256, the backend gets the raw value and checks the two match. */
export async function appleNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Array.from(Crypto.getRandomBytes(32), b => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

export type AppleResult = 'done' | 'cancelled' | 'appleSignInFailed' | 'authUnavailable' | 'invalidProfile' | 'demoCarryUnavailable';
/** One Sign in with Apple attempt. Closing Apple's sheet is not an error: it ends quietly. */
export async function signInWithApple(signIn: NonNullable<AuthState['signInWithApple']>): Promise<AppleResult> {
  let token: string | null = null, raw = '';
  try {
    const nonce = await appleNonce();
    raw = nonce.raw;
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });
    token = credential.identityToken;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED' ? 'cancelled' : 'appleSignInFailed';
  }
  if (!token) return 'appleSignInFailed';
  const failure = await signIn(token, raw).catch(() => 'authFailed');
  if (!failure) return 'done';
  return failure === 'authUnavailable' || failure === 'invalidProfile' || failure === 'demoCarryUnavailable' ? failure : 'appleSignInFailed';
}

/** The button, or nothing where there are no accounts (the phone-only build, a build without a backend) or Apple's sign-in
 * isn't on this device. */
export function AppleSignIn() {
  const auth = useAuth();
  const { mode } = useTheme();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Exclude<AppleResult, 'done' | 'cancelled'> | null>(null);
  const inFlight = useRef(false);
  const accounts = !auth.phoneOnly && auth.configured && !!auth.signInWithApple;
  useEffect(() => {
    let active = true;
    if (!accounts || Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(ok => { if (active) setAvailable(ok); }, () => {});
    return () => { active = false; };
  }, [accounts]);
  if (!accounts || !available || !auth.signInWithApple) return null;
  const signIn = auth.signInWithApple;
  const press = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const result = await signInWithApple(signIn);
      if (result !== 'done' && result !== 'cancelled') setError(result);
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <View testID="welcome-apple" style={{ gap: 8 }}>
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={mode === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={26}
      accessibilityState={{ busy, disabled: busy }}
      style={{ height: 52, width: '100%', opacity: busy ? 0.6 : 1 }}
      onPress={() => { void press(); }} />
    {error ? <Notice testID="welcome-apple-error" text={t(error)} /> : null}
  </View>;
}
