/* The auth module's error classes can't be imported here: the phone-only build has no src/auth (metro.config.js blocks it).
 * These read the errors by their messages and shape instead, as src/auth/sign-out.ts defines them. */
const DEPARTURE = 'Sign-out recovery required.', DELETION = 'Account deletion did not finish.';

/** What a failed sign-out says, as the Account screen said it. */
export function signOutError(cause: unknown): 'signOutFailed' | 'signOutNotStarted' {
  return cause instanceof Error && cause.message === DEPARTURE ? 'signOutFailed' : 'signOutNotStarted';
}
/** What a failed account deletion says. Anything unclear reads as uncertain, which erases nothing and asks to try again. */
export function deletionError(cause: unknown): 'deleteAccountUncertain' | 'deleteAccountFailed' | 'signOutFailed' {
  if (!(cause instanceof Error)) return 'deleteAccountUncertain';
  if (cause.message === DEPARTURE) return 'signOutFailed';
  if (cause.message === DELETION && !parentSaysDeletion(cause)) return 'deleteAccountFailed';
  return 'deleteAccountUncertain';
}

// The uncertain case is a subclass of the failed one, so its parent class
// still builds an error with the deletion message.
function parentSaysDeletion(cause: Error): boolean {
  try {
    const Parent = Object.getPrototypeOf(Object.getPrototypeOf(cause))?.constructor as (new () => unknown) | undefined;
    if (!Parent || Parent === Error) return false;
    const probe = new Parent();
    return probe instanceof Error && probe.message === DELETION;
  } catch { return false; }
}
