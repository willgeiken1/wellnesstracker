/* A first setup that was closed part way, kept while the app is open so it
   opens where it was left. It holds quiz answers only. It is never saved,
   sent or logged, and it is gone when the app closes. */

import type { SetupDraft } from '@/features/routines/model/setup';

const held: { draft: SetupDraft | null } = { draft: null };

export function keptSetupDraft(): SetupDraft | null {
  return held.draft;
}

export function keepSetupDraft(draft: SetupDraft | null): void {
  held.draft = draft;
}
