import type { Entitlement, Product, ProductId, PurchaseProvider, Result, Unsubscribe } from '../plus/types';

/** Normalized by a future RevenueCat adapter, never a raw CustomerInfo object.
 * active includes store-confirmed trial/grace access; disabling renewal is not revocation.
 * expiresAtMs is the effective access deadline, including any confirmed grace period.
 */
export interface BillingReceipt {
  readonly active: boolean;
  readonly expiresAtMs: number;
}

/** Account-scoped port. Bind identity before creating it; never pass health data or
 * customer attributes. A future SDK adapter owns product mapping and verification.
 * Events must be ordered snapshots for this account only.
 */
export interface BillingPort {
  getProducts(): Promise<Result<readonly Product[]>>;
  getReceipt(): Promise<Result<BillingReceipt>>;
  purchase(id: ProductId): Promise<Result<BillingReceipt>>;
  restore(): Promise<Result<BillingReceipt>>;
  subscribe(listener: (receipt: BillingReceipt) => void): Unsubscribe;
}

const unavailable = { status: 'error', error: { code: 'unavailable' } } as const;
const failure = { status: 'error', error: { code: 'provider_failure' } } as const;

/** In-memory boundary only: no SDK, persistence, network, or app wiring.
 * Refresh on foreground and at the effective deadline; no offline grace is invented.
 * Dispose before logout/account changes, then create a fresh instance for the new account.
 */
export function createBillingProvider(port: BillingPort, now: () => number = Date.now): PurchaseProvider & { dispose(): void } {
  let disposed = false;
  let busy = false;
  let revision = 0;
  let receipt: BillingReceipt | undefined;
  let disconnect: Unsubscribe | undefined;
  const listeners = new Set<(value: Entitlement) => void>();
  const entitlement = (): Entitlement => {
    const time = now();
    return receipt?.active === true && Number.isFinite(receipt.expiresAtMs)
      && Number.isFinite(time) && receipt.expiresAtMs > time ? 'plus' : 'free';
  };
  const publish = () => {
    for (const listener of [...listeners]) {
      try { listener(entitlement()); } catch { /* Isolate consumers without logging. */ }
    }
  };
  try {
    disconnect = port.subscribe(value => {
      if (disposed) return;
      ++revision;
      receipt = { active: value.active, expiresAtMs: value.expiresAtMs };
      publish();
    });
  } catch {
    // Without revocation notifications this instance cannot safely grant access.
    disposed = true;
  }
  const run = async (operation: () => Promise<Result<BillingReceipt>>, refresh = false): Promise<Result<Entitlement>> => {
    if (disposed) return unavailable;
    if (busy) return { status: 'pending' };
    busy = true;
    const started = revision;
    try {
      let result: Result<BillingReceipt>;
      try { result = await operation(); } catch { result = failure; }
      if (disposed) return unavailable;
      if (started !== revision) return { status: 'success', value: entitlement() };
      if (result.status === 'success') {
        receipt = { active: result.value.active, expiresAtMs: result.value.expiresAtMs };
        publish();
        return { status: 'success', value: entitlement() };
      }
      if (refresh) { receipt = undefined; publish(); }
      // Only allowlisted error codes cross this boundary, never raw SDK details.
      if (result.status === 'error') return failure;
      return { status: result.status };
    } finally { busy = false; }
  };
  return {
    getProducts: async () => {
      if (disposed) return unavailable;
      try {
        const result = await port.getProducts();
        if (disposed) return unavailable;
        if (result.status === 'error') return failure;
        if (result.status !== 'success') return { status: result.status };
        // Copy only the existing product contract; no raw store/customer metadata.
        return { status: 'success', value: result.value.map(p => ({
          id: p.id, price: p.price, currency: p.currency, period: p.period, trialDays: p.trialDays,
        })) };
      } catch { return failure; }
    },
    getEntitlement: () => run(() => port.getReceipt(), true),
    purchase: id => id === 'plus_monthly' || id === 'plus_yearly'
      ? run(() => port.purchase(id))
      : Promise.resolve({ status: 'error', error: { code: 'invalid_product' } }),
    restore: () => run(() => port.restore()),
    subscribe: listener => {
      if (disposed) return unavailable;
      const callback = (value: Entitlement) => listener(value);
      listeners.add(callback);
      return { status: 'success', value: () => { listeners.delete(callback); } };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      receipt = undefined;
      publish();
      listeners.clear();
      try { disconnect?.(); } catch { /* Cleanup never forwards raw errors. */ }
    },
  };
}
