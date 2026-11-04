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

export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function parseReceipt(value: unknown): BillingReceipt | undefined {
  if (typeof value !== 'object' || value === null) return;
  const receipt = value as Partial<BillingReceipt>;
  if (typeof receipt.active !== 'boolean' || typeof receipt.expiresAtMs !== 'number'
    || !Number.isFinite(receipt.expiresAtMs)) return;
  return { active: receipt.active, expiresAtMs: receipt.expiresAtMs };
}

const unavailable = { status: 'error', error: { code: 'unavailable' } } as const;
const failure = { status: 'error', error: { code: 'provider_failure' } } as const;

/** In-memory boundary only: no SDK, persistence, network, or app wiring.
 * Refresh on foreground and at access deadlines; unreachable refreshes allow bounded seven-day grace.
 * Dispose before logout/account changes, then create a fresh instance for the new account.
 */
export function createBillingProvider(port: BillingPort, now: () => number = Date.now, timeoutMs = 30_000): PurchaseProvider & { dispose(): void } {
  let disposed = false;
  let busy = false;
  let revision = 0;
  let revokedRevision = 0;
  let confirmedAtMs: number | undefined;
  let offline = false;
  let receipt: BillingReceipt | undefined;
  let disconnect: Unsubscribe | undefined;
  const listeners = new Set<(value: Entitlement) => void>();
  const entitlement = (): Entitlement => {
    const time = now();
    if (!receipt?.active || !Number.isFinite(time)) return 'free';
    const deadline = offline && confirmedAtMs !== undefined
      ? Math.min(confirmedAtMs + OFFLINE_GRACE_MS, receipt.expiresAtMs + OFFLINE_GRACE_MS)
      : receipt.expiresAtMs;
    return time < deadline ? 'plus' : 'free';
  };
  const publish = () => {
    for (const listener of [...listeners]) {
      try { listener(entitlement()); } catch { /* Isolate consumers without logging. */ }
    }
  };
  const confirm = (value: BillingReceipt | undefined) => {
    const current = ++revision;
    receipt = value;
    offline = false;
    const time = now();
    confirmedAtMs = value?.active && Number.isFinite(time) && value.expiresAtMs > time ? time : undefined;
    if (!value?.active) revokedRevision = current;
    publish();
  };
  // Timeout only settles the boundary; a late SDK result has no state-changing handler.
  const withTimeout = async <T>(operation: () => Promise<Result<T>>): Promise<Result<T>> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        new Promise<Result<T>>(resolve => {
          timer = setTimeout(() => resolve(failure), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000);
        }),
        operation(),
      ]);
    } catch { return failure; }
    finally { clearTimeout(timer); }
  };
  try {
    disconnect = port.subscribe(value => {
      if (disposed) return;
      confirm(parseReceipt(value));
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
      const result = await withTimeout(operation);
      if (disposed) return unavailable;
      if (result.status === 'success') {
        const value = parseReceipt(result.value);
        if (!value) {
          confirm(undefined);
          return failure;
        }
        // Completion is newer than active snapshots delivered mid-operation. A
        // revocation delivered after this operation started remains a barrier.
        if (!value.active || revokedRevision <= started) confirm(value);
        return { status: 'success', value: entitlement() };
      }
      if (refresh && started === revision) {
        offline = result.status === 'error' && result.error.code !== 'invalid_product' && confirmedAtMs !== undefined;
        if (!offline) { receipt = undefined; confirmedAtMs = undefined; }
        publish();
      }
      // Only allowlisted error codes cross this boundary, never raw SDK details.
      if (result.status === 'error') return failure;
      return { status: result.status };
    } finally { busy = false; }
  };
  return {
    getProducts: async () => {
      if (disposed) return unavailable;
      try {
        const result = await withTimeout(() => port.getProducts());
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
