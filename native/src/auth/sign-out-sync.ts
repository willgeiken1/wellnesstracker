export const SIGN_OUT_SYNC_TIMEOUT_MS = 10_000;
/** A stalled/offline sync still reaches the caller's unsynced-loss check. */
export async function syncBeforeSignOut(sync: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(sync),
      new Promise<void>(resolve => { timer=setTimeout(resolve,SIGN_OUT_SYNC_TIMEOUT_MS); }),
    ]);
  } catch { /* Retain the outbox and let the caller check for unsynced loss. */ }
  finally { if(timer !== undefined)clearTimeout(timer); }
}
