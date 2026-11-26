import { createHash } from 'node:crypto';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { ThemeProvider } from '../src/design/theme-provider';
import { AppleSignIn, appleNonce, signInWithApple } from '../src/features/onboarding/apple-sign-in';
import type { AuthState } from '../src/auth/provider';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256),
  digestStringAsync: async (_algorithm: string, value: string) => require('node:crypto').createHash('sha256').update(value).digest('hex'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
jest.mock('expo-apple-authentication', () => {
  const { Pressable } = require('react-native');
  return {
    signInAsync: jest.fn(), isAvailableAsync: jest.fn(async () => true),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0 }, AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: (props: { onPress: () => void }) => <Pressable testID="apple-button" onPress={props.onPress} />,
  };
});
let mockAuth: Partial<AuthState> = {};
jest.mock('../src/auth/provider', () => ({ useAuth: () => mockAuth }));
const signInAsync = jest.mocked(AppleAuthentication.signInAsync);
beforeEach(() => { signInAsync.mockReset(); });

test('the nonce Apple signs is the SHA-256 of a fresh 32-byte value, which goes to the backend raw', async () => {
  const { raw, hashed } = await appleNonce();
  expect(raw).toMatch(/^[0-9a-f]{64}$/);
  expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'));
  signInAsync.mockResolvedValue({ identityToken: 'apple-token' } as AppleAuthentication.AppleAuthenticationCredential);
  const backend = jest.fn(async () => null);
  expect(await signInWithApple(backend)).toBe('done');
  const sent = signInAsync.mock.calls[0][0]!;
  expect(sent.requestedScopes).toEqual([0, 1]);
  expect(backend).toHaveBeenCalledWith('apple-token', raw);
  expect(sent.nonce).toBe(hashed);
});

test('closing Apple\'s sheet ends quietly without reaching the backend; failures say so plainly', async () => {
  const backend = jest.fn(async () => null);
  signInAsync.mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
  expect(await signInWithApple(backend)).toBe('cancelled');
  signInAsync.mockRejectedValueOnce(Object.assign(new Error('failed'), { code: 'ERR_REQUEST_FAILED' }));
  expect(await signInWithApple(backend)).toBe('appleSignInFailed');
  signInAsync.mockResolvedValueOnce({ identityToken: null } as AppleAuthentication.AppleAuthenticationCredential);
  expect(await signInWithApple(backend)).toBe('appleSignInFailed');
  expect(backend).not.toHaveBeenCalled();
  signInAsync.mockResolvedValue({ identityToken: 'apple-token' } as AppleAuthentication.AppleAuthenticationCredential);
  expect(await signInWithApple(async () => 'authFailed')).toBe('appleSignInFailed');
  expect(await signInWithApple(async () => { throw new Error('offline'); })).toBe('appleSignInFailed');
  expect(await signInWithApple(async () => 'invalidProfile')).toBe('invalidProfile');
});

test('Welcome shows the button only where accounts exist and shows plain copy when sign-in fails', async () => {
  mockAuth = { phoneOnly: true, configured: false };
  const phone = await render(<ThemeProvider><AppleSignIn /></ThemeProvider>);
  expect(screen.queryByTestId('apple-button')).toBeNull();
  await phone.unmount();
  mockAuth = { configured: false, signInWithApple: jest.fn() };
  const unset = await render(<ThemeProvider><AppleSignIn /></ThemeProvider>);
  expect(screen.queryByTestId('apple-button')).toBeNull();
  await unset.unmount();
  const backend = jest.fn(async () => 'authFailed');
  mockAuth = { configured: true, signInWithApple: backend };
  await render(<ThemeProvider><AppleSignIn /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('apple-button')).toBeTruthy());
  signInAsync.mockResolvedValue({ identityToken: 'apple-token' } as AppleAuthentication.AppleAuthenticationCredential);
  await act(async () => { fireEvent.press(screen.getByTestId('apple-button')); await new Promise(r => setTimeout(r, 0)); });
  expect(screen.getByText("Sign in with Apple didn't finish. Try again in a moment.")).toBeTruthy();
  expect(backend).toHaveBeenCalledTimes(1);
});
