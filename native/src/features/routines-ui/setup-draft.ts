/* A first setup that was closed part way, kept while the app is open so it
   opens where it was left. It holds quiz answers only. It is never saved,
   sent or logged, and it is gone when the app closes.

   The answers belong to whoever gave them. They are kept under that owner,
   handed back to that owner only, and dropped when the owner signs out or
   deletes the account, so the next person on this phone starts a blank quiz. */

import { keepSessionMemory, sessionMemory } from '@/core/session-memory';
import type { SetupDraft } from '@/features/routines/model/setup';

const KEY = 'routines-setup-draft';

export function keptSetupDraft(owner: string | null | undefined): SetupDraft | null {
  return sessionMemory<SetupDraft>(owner, KEY);
}

export function keepSetupDraft(owner: string | null | undefined, draft: SetupDraft | null): void {
  keepSessionMemory(owner, KEY, draft);
}
