import { createMockPurchaseProvider, DEFAULT_MOCK_PRICING } from './mock-provider';
import type { Product, PurchaseProvider } from './types';

const unavailable = { status: 'error', error: { code: 'unavailable' } } as const;

/** No store SDK. Reads stay free and purchases never grant Plus. */
export function createStorelessPurchaseProvider(): PurchaseProvider {
  const products: readonly Product[] = Object.freeze([
    Object.freeze({ id: 'plus_monthly', price: DEFAULT_MOCK_PRICING.monthlyPrice, currency: 'USD', period: 'month', trialDays: DEFAULT_MOCK_PRICING.trialDays }),
    Object.freeze({ id: 'plus_yearly', price: DEFAULT_MOCK_PRICING.yearlyPrice, currency: 'USD', period: 'year', trialDays: DEFAULT_MOCK_PRICING.trialDays }),
  ]);
  return {
    getProducts: async () => ({ status: 'success', value: products }),
    getEntitlement: async () => ({ status: 'success', value: 'free' }),
    purchase: async () => unavailable,
    restore: async () => ({ status: 'success', value: 'free' }),
    subscribe: () => ({ status: 'success', value: () => {} }),
  };
}

/**
 * The granting simulator mounts only in dev and Jest (`__DEV__`).
 * Production uses the storeless provider so Subscribe cannot grant free Plus.
 */
export function createRootPurchaseProvider(dev = __DEV__): PurchaseProvider {
  return dev ? createMockPurchaseProvider() : createStorelessPurchaseProvider();
}
