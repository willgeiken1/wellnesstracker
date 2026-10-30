import type { Entitlement, ProductId, PurchaseError, PurchaseProvider, Result, Unsubscribe } from './types';

export interface EntitlementSnapshot {
  readonly entitlement: Entitlement;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: PurchaseError | null;
}

const providerFailure = { status: 'error', error: { code: 'provider_failure' } } as const;

/** Per-provider memory only. Subscriptions exist only while React/other callers observe it. */
export function createEntitlementStore(provider: PurchaseProvider) {
  let snapshot: EntitlementSnapshot = { entitlement: 'free', status: 'idle', error: null };
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
  const run = async (operation: () => Promise<Result<Entitlement>>) => {
    const current = ++revision;
    publish({ ...snapshot, status: 'loading', error: null });
    let result: Result<Entitlement>;
    try { result = await operation(); } catch { result = providerFailure; }
    // A newer operation or provider notification supersedes this response.
    if (current === revision) {
      publish({
        entitlement: result.status === 'success' ? result.value : snapshot.entitlement,
        status: result.status === 'error' ? 'error' : 'ready',
        error: result.status === 'error' ? result.error : null,
      });
    }
    return result;
  };
  const refresh = () => run(() => provider.getEntitlement());
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
            publish({ entitlement, status: 'ready', error: null });
          });
        } catch { result = providerFailure; }
        if (result.status === 'success') {
          disconnect = result.value;
          void refresh();
        } else if (result.status === 'error') {
          publish({ ...snapshot, status: 'error', error: result.error });
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
