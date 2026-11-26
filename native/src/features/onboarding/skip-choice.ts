import type { AuthState } from '@/auth/provider';
import { requestTour } from './tour/store';

export type SkipChoice = 'guest' | 'demo';
/** What the two skip choices need: the auth calls and the router's replace. */
export interface SkipDeps { auth: Pick<AuthState, 'continueAsGuest' | 'lookAround'>; replace: (href: '/onboarding') => void }

/**
 * Skip for now: Start as a guest goes into setup (About you) with the app open to this phone only; Explore with sample
 * data opens the app on the example week with the four-stop tour first. Setup is opened before guest use starts, so
 * the sign-in screens close behind it rather than over it.
 */
export function chooseSkip(choice: SkipChoice, { auth, replace }: SkipDeps) {
  if (choice === 'guest') { replace('/onboarding'); auth.continueAsGuest?.(); return; }
  requestTour();
  auth.lookAround();
}
