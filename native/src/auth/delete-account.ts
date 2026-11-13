import type { SupabaseClient } from '@supabase/supabase-js';

/** Insight could not confirm the deletion, so nothing on this phone was erased. */
export class AccountDeleteFailure extends Error { constructor(){super('Account deletion did not finish.');} }
/** The account is deleted on the server, but this phone's copy is not fully erased yet. */
export class AccountDeletedLocalPending extends Error { constructor(){super('Account deleted; local erase pending.');} }

/** The word the person types, and the server checks, before an account is deleted. */
export const DELETE_WORD = 'DELETE';
/** Longer than the server needs; short enough that the sheet never looks stuck. */
export const DELETE_TIMEOUT_MS = 30_000;

/** True only when the sign-in server says this account no longer exists, never for a network or token problem. */
async function accountIsGone(client: Pick<SupabaseClient, 'auth'>): Promise<boolean> {
  try {
    const { error } = await client.auth.getUser();
    if (!error) return false;
    const code = (error as { code?: unknown }).code;
    return code === 'user_not_found' || /user (not found|does not exist)|sub claim .*does not exist/i.test(error.message ?? '');
  } catch { return false; }
}

/**
 * Asks the delete-account function to remove the signed-in person's account and everything stored with it.
 * Resolves when the server answers ok, or when an earlier request already deleted the account but its answer was
 * lost (the retry then gets "not signed in", and the sign-in server confirms the account is gone). Anything else
 * throws AccountDeleteFailure. Error text from the server is never passed on, so no detail reaches a log or the screen.
 */
export async function deleteServerAccount(client: Pick<SupabaseClient, 'functions' | 'auth'>, timeoutMs = DELETE_TIMEOUT_MS): Promise<void> {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
  let ok = false;
  try {
    const { data, error } = await client.functions.invoke('delete-account', { body: { confirm: DELETE_WORD }, signal: abort.signal });
    ok = !error && !!data && (data as { ok?: unknown }).ok === true;
  } catch { ok = false; }
  finally { clearTimeout(timer); }
  if (!ok && !(await accountIsGone(client))) throw new AccountDeleteFailure();
}
