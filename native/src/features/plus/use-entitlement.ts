import { createContext, createElement, useContext, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { createEntitlementStore, type EntitlementSnapshot, type EntitlementStore } from './entitlement-store';
import { isFeatureAvailable, type Feature } from './features';
import * as rootPurchase from './root-purchase';
import type { PurchaseProvider } from './types';

const PurchaseContext = createContext<PurchaseProvider | null>(null);
const EntitlementContext = createContext<EntitlementStore | null>(null);

/** Dev/test falls back to the simulator. Production falls back to a provider that cannot grant Plus. */
export function EntitlementProvider({ provider, children }: PropsWithChildren<{ provider?: PurchaseProvider }>) {
  // Build the fallback only when the caller did not inject a provider.
  const [fallbackProvider] = useState(() => provider ?? rootPurchase.createRootPurchaseProvider());
  const selectedProvider = provider ?? fallbackProvider;
  const store = useMemo(() => createEntitlementStore(selectedProvider), [selectedProvider]);
  return createElement(PurchaseContext.Provider, { value: selectedProvider }, createElement(EntitlementContext.Provider, { value: store }, children));
}

/** Unsettled and failed loads are not shown as the free plan. */
export function entitlementPlanLabel(snapshot: Pick<EntitlementSnapshot, 'settled' | 'status' | 'entitlement'>): string {
  if (!snapshot.settled) return snapshot.status === 'error' ? 'Plan status unavailable' : 'Checking plan…';
  return snapshot.entitlement === 'plus' ? 'Insight Plus active (simulated)' : 'Free plan';
}

export function useEntitlement() {
  const store = useContext(EntitlementContext);
  if (!store) throw new Error('useEntitlement requires EntitlementProvider.');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    ...snapshot,
    purchase: store.purchase,
    restore: store.restore,
    refresh: store.refresh,
    isFeatureAvailable: (feature: Feature) => isFeatureAvailable(feature, snapshot.entitlement),
  };
}

export function usePurchaseProvider() {
  const provider = useContext(PurchaseContext);
  if (!provider) throw new Error('usePurchaseProvider requires EntitlementProvider.');
  return provider;
}
