import type { Entitlement, ProductId, PurchaseError, PurchaseProvider, Result, Unsubscribe } from './types';

export interface EntitlementSnapshot {
  readonly entitlement: Entitlement;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: PurchaseError | null;
  /** False until the provider has reported an entitlement. Unsettled is not a free plan. */
  readonly settled: boolean;
}

const providerFailure = { status: 'error', error: { code: 'provider_failure' } } as const;
/** First read, then retries after 1s, 2s and 4s. */
const PLAN_LOAD_ATTEMPTS = 4;
const PLAN_LOAD_BACKOFF_MS = [1000, 2000, 4000] as const;

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
  const loadEntitlement = async () => {
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
  /** Retry a failed store subscribe, then keep the successful listener. */
  const openSubscription = async (currentConnection: number): Promise<boolean> => {
    let lastError: PurchaseError = providerFailure.error;
    for (let attempt = 0; attempt < PLAN_LOAD_ATTEMPTS; attempt++) {
      if (currentConnection !== connection || listeners.size === 0) return false;
      if (attempt > 0) {
        await delay(PLAN_LOAD_BACKOFF_MS[attempt - 1] ?? PLAN_LOAD_BACKOFF_MS[PLAN_LOAD_BACKOFF_MS.length - 1]);
        if (currentConnection !== connection || listeners.size === 0) return false;
      }
      if (disconnect) return true;
      let result: Result<Unsubscribe>;
      try {
        result = provider.subscribe(entitlement => {
          if (currentConnection !== connection) return;
          ++revision;
          publish({ entitlement, status: 'ready', error: null, settled: true });
        });
      } catch { result = providerFailure; }
      if (currentConnection !== connection) {
        if (result.status === 'success') {
          try { result.value(); } catch { /* A late adapter cannot keep a dead subscription. */ }
        }
        return false;
      }
      if (result.status === 'success') {
        disconnect = result.value;
        return true;
      }
      lastError = result.status === 'error' ? result.error : providerFailure.error;
    }
    if (currentConnection === connection) {
      publish({
        entitlement: snapshot.settled ? snapshot.entitlement : 'free',
        status: 'error',
        error: lastError,
        settled: true,
      });
    }
    return false;
  };
  const refresh = async () => {
    if (!disconnect && listeners.size > 0) {
      const opened = await openSubscription(connection);
      if (!opened) return { status: 'error' as const, error: snapshot.error ?? providerFailure.error };
    }
    return loadEntitlement();
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
        void (async () => {
          const opened = await openSubscription(currentConnection);
          if (opened && currentConnection === connection) void refresh();
        })();
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
