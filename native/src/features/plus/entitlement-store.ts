import type { Entitlement, ProductId, PurchaseError, PurchaseProvider, Result, Unsubscribe } from './types';

export interface EntitlementSnapshot {
  readonly entitlement: Entitlement;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: PurchaseError | null;
  /** False until the provider has reported an entitlement. Unsettled is not a free plan. */
  readonly settled: boolean;
}

const providerFailure = { status: 'error', error: { code: 'provider_failure' } } as const;
const PLAN_LOAD_ATTEMPTS = 3;
/** Two retries after the first read. Short enough that a failed load still settles in tests. */
const PLAN_LOAD_BACKOFF_MS = [20, 40] as const;

const delay = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

/** Per-provider memory only. Subscriptions exist only while React/other callers observe it. */
export function createEntitlementStore(provider: PurchaseProvider) {
  let snapshot: EntitlementSnapshot = { entitlement: 'free', status: 'loading', error: null, settled: false };
  const listeners = new Set<() => void>();
  let disconnect: Unsubscribe | undefined;
  let revision = 0;
  let connection = 0;
  const publish = (next: EntitlementSnapshot) => {
    snapshot = next;
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Isolate consumer failures; never log raw errors. */ }
    }
  };
  const run = async (operation: () => Promise<Result<Entitlement>>, finalLoad = false) => {
    const current = ++revision;
    publish({ ...snapshot, status: 'loading', error: null });
    let result: Result<Entitlement>;
    try { result = await operation(); } catch { result = providerFailure; }
    // A newer operation or provider notification supersedes this response.
    if (current === revision) {
      const giveUp = finalLoad && result.status !== 'success' && !snapshot.settled;
      const showError = result.status === 'error' && (snapshot.settled || giveUp);
      publish({
        entitlement: result.status === 'success' ? result.value : snapshot.entitlement,
        // Keep checking through the backoff. The last failure settles as free.
        status: result.status === 'error' ? (showError ? 'error' : 'loading') : 'ready',
        error: result.status === 'error' && showError ? result.error : null,
        settled: result.status === 'success' || giveUp ? true : snapshot.settled,
      });
    }
    return result;
  };
  const refresh = async () => {
    let latest: Result<Entitlement> = providerFailure;
    let epoch = revision;
    for (let attempt = 0; attempt < PLAN_LOAD_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await delay(PLAN_LOAD_BACKOFF_MS[attempt - 1] ?? PLAN_LOAD_BACKOFF_MS[PLAN_LOAD_BACKOFF_MS.length - 1]);
        // A purchase or provider push during backoff replaces this load.
        if (revision !== epoch) return latest;
      }
      epoch = revision;
      latest = await run(() => provider.getEntitlement(), attempt === PLAN_LOAD_ATTEMPTS - 1);
      // run() bumps revision once. Anything else means a newer purchase or push won.
      if (revision !== epoch + 1 || latest.status === 'success') return latest;
      epoch = revision;
    }
    return latest;
  };
  return {
    getSnapshot: () => snapshot,
    refresh,
    purchase: (id: ProductId) => run(() => provider.purchase(id)),
    restore: () => run(() => provider.restore()),
    subscribe: (listener: () => void): Unsubscribe => {
      const callback = () => listener();
      listeners.add(callback);
      if (listeners.size === 1) {
        const currentConnection = ++connection;
        let result: Result<Unsubscribe>;
        try {
          result = provider.subscribe(entitlement => {
            if (currentConnection !== connection) return;
            ++revision;
            publish({ entitlement, status: 'ready', error: null, settled: true });
          });
        } catch { result = providerFailure; }
        if (result.status === 'success') {
          disconnect = result.value;
          void refresh();
        } else if (result.status === 'error') {
          publish({ entitlement: 'free', status: 'error', error: result.error, settled: true });
        }
      }
      return () => {
        if (!listeners.delete(callback) || listeners.size > 0) return;
        ++connection;
        ++revision;
        const cleanup = disconnect;
        disconnect = undefined;
        try { cleanup?.(); } catch { /* A faulty adapter cannot break unmount. */ }
      };
    },
  };
}
export type EntitlementStore = ReturnType<typeof createEntitlementStore>;
