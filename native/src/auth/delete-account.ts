import type { SupabaseClient } from '@supabase/supabase-js';

/** The server did not confirm the deletion, so nothing on this phone was erased. */
export class AccountDeleteFailure extends Error { constructor(){super('Account deletion did not finish.');} }

/** The word the person types, and the server checks, before an account is deleted. */
export const DELETE_WORD = 'DELETE';

/**
 * Asks the delete-account function to remove the signed-in person's account and everything stored with it.
 * Resolves only when the server answers ok; any other answer, or no answer, throws AccountDeleteFailure.
 * Error text from the server is never passed on, so no account detail can reach a log or the screen.
 */
export async function deleteServerAccount(client: Pick<SupabaseClient, 'functions'>): Promise<void> {
  let ok = false;
  try {
    const { data, error } = await client.functions.invoke('delete-account', { body: { confirm: DELETE_WORD } });
    ok = !error && !!data && (data as { ok?: unknown }).ok === true;
  } catch { ok = false; }
  if (!ok) throw new AccountDeleteFailure();
}
