import type { Product, PurchaseProvider } from './types';

const unavailable = { status: 'error', error: { code: 'unavailable' } } as const;

/** No store SDK. Reads stay free and purchases never grant Plus. */
export function createStorelessPurchaseProvider(): PurchaseProvider {
  const products: readonly Product[] = Object.freeze([
    Object.freeze({ id: 'plus_monthly', price: 4.99, currency: 'USD', period: 'month', trialDays: 7 }),
    Object.freeze({ id: 'plus_yearly', price: 34.99, currency: 'USD', period: 'year', trialDays: 7 }),
  ]);
  return {
    getProducts: async () => ({ status: 'success', value: products }),
    getEntitlement: async () => ({ status: 'success', value: 'free' }),
    purchase: async () => unavailable,
    restore: async () => ({ status: 'success', value: 'free' }),
    subscribe: () => ({ status: 'success', value: () => {} }),
  };
}

/** Dev-only chunk. Release builds never reach the import, so the granting mock is not bundled. */
function loadDevPurchaseProvider(): Promise<PurchaseProvider> {
  if (!__DEV__) return Promise.resolve(createStorelessPurchaseProvider());
  return import('./mock-provider').then(mod => mod.createMockPurchaseProvider());
}

/**
 * The granting simulator mounts only in dev and Jest (`__DEV__`).
 * Production resolves the storeless provider and does not import the mock.
 */
export function createRootPurchaseProvider(dev = __DEV__): Promise<PurchaseProvider> {
  if (!dev) return Promise.resolve(createStorelessPurchaseProvider());
  return loadDevPurchaseProvider();
}
