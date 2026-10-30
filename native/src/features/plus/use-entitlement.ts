import { createContext, createElement, useContext, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { createEntitlementStore, type EntitlementStore } from './entitlement-store';
import { isFeatureAvailable, type Feature } from './features';
import { createMockPurchaseProvider } from './mock-provider';
import type { PurchaseProvider } from './types';

const PurchaseContext = createContext<PurchaseProvider | null>(null);
const EntitlementContext = createContext<EntitlementStore | null>(null);

/** App-wide purchase state. The root explicitly injects the local simulator adapter. */
export function EntitlementProvider({ provider, children }: PropsWithChildren<{ provider?: PurchaseProvider }>) {
  const [developmentProvider] = useState(() => __DEV__ ? createMockPurchaseProvider() : undefined);
  const selectedProvider = provider ?? developmentProvider;
  const store = useMemo(() => selectedProvider ? createEntitlementStore(selectedProvider) : null, [selectedProvider]);
  if (!store) throw new Error('EntitlementProvider requires an explicit purchase provider outside development.');
  return createElement(PurchaseContext.Provider, { value: selectedProvider! }, createElement(EntitlementContext.Provider, { value: store }, children));
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
