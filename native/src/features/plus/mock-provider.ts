import type { Entitlement, Product, PurchaseProvider, Result, Unsubscribe } from './types';

export interface MockPurchaseConfig {
  readonly monthlyPrice?: number;
  readonly yearlyPrice?: number;
  readonly trialDays?: number;
  readonly initialEntitlement?: Entitlement;
  readonly restoredEntitlement?: Entitlement;
  readonly productsResult?: Result<readonly Product[]>;
  readonly purchaseResult?: Result<Entitlement>;
  readonly restoreResult?: Result<Entitlement>;
  readonly entitlementResult?: Result<Entitlement>;
  readonly subscribeResult?: Exclude<Result<Unsubscribe>, { status: 'success' }>;
}

export const DEFAULT_MOCK_PRICING = Object.freeze({ monthlyPrice: 4.99, yearlyPrice: 34.99, trialDays: 7 });

/** Synthetic ownership only. No persistence, timers, store SDK, network or user data. */
export function createMockPurchaseProvider(config: MockPurchaseConfig = {}): PurchaseProvider {
  const options = { ...config };
  const pricing = { ...DEFAULT_MOCK_PRICING, ...options };
  const products: readonly Product[] = Object.freeze([
    Object.freeze({ id: 'plus_monthly', price: pricing.monthlyPrice, currency: 'USD', period: 'month', trialDays: pricing.trialDays }),
    Object.freeze({ id: 'plus_yearly', price: pricing.yearlyPrice, currency: 'USD', period: 'year', trialDays: pricing.trialDays }),
  ]);
  let entitlement = options.initialEntitlement ?? 'free';
  let owned = options.restoredEntitlement ?? entitlement;
  const listeners = new Set<(value: Entitlement) => void>();
  const apply = (result: Result<Entitlement>): Result<Entitlement> => {
    if (result.status === 'success') {
      entitlement = result.value;
      owned = result.value;
      for (const listener of [...listeners]) {
        // One consumer must not break a completed purchase or other subscribers.
        try { listener(entitlement); } catch { /* No error details leave this boundary. */ }
      }
    }
    return result;
  };
  return {
    getProducts: async () => options.productsResult ?? { status: 'success', value: products },
    getEntitlement: async () => options.entitlementResult ?? { status: 'success', value: entitlement },
    purchase: async id => {
      if (!products.some(product => product.id === id)) return { status: 'error', error: { code: 'invalid_product' } };
      return apply(options.purchaseResult ?? { status: 'success', value: 'plus' });
    },
    restore: async () => apply(options.restoreResult ?? { status: 'success', value: owned }),
    subscribe: listener => {
      if (options.subscribeResult) return options.subscribeResult;
      // Unique registration so subscribing the same callback twice remains independent.
      const callback = (value: Entitlement) => listener(value);
      listeners.add(callback);
      return { status: 'success', value: () => { listeners.delete(callback); } };
    },
  };
}
