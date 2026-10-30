import type { Product, PurchaseProvider } from './types';

const unavailable = { status: 'error', error: { code: 'unavailable' } } as const;

/** No store SDK. Regular prices are $4.99/month and $39.99/year. $34.99 is the waitlist price only. */
export function createStorelessPurchaseProvider(): PurchaseProvider {
  const products: readonly Product[] = Object.freeze([
    Object.freeze({ id: 'plus_monthly', price: 4.99, currency: 'USD', period: 'month', trialDays: 7 }),
    Object.freeze({ id: 'plus_yearly', price: 39.99, currency: 'USD', period: 'year', trialDays: 7 }),
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
 * Require stays inside `if (__DEV__)` so Metro can drop it from the release bundle.
 * Dynamic import() is inlined into the release .hbc and must not be used here.
 */
export function createRootPurchaseProvider(dev = __DEV__): PurchaseProvider {
  if (!dev) return createStorelessPurchaseProvider();
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMockPurchaseProvider } = require('./mock-provider') as typeof import('./mock-provider');
    return createMockPurchaseProvider();
  }
  return createStorelessPurchaseProvider();
}
