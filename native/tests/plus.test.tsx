import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { ALWAYS_FREE, FEATURE_ENTITLEMENTS, FREE_AI_FOOD_LOGS_PER_DAY, isFeatureAvailable } from '../src/features/plus/features';
import { createMockPurchaseProvider } from '../src/features/plus/mock-provider';
import { createEntitlementStore } from '../src/features/plus/entitlement-store';
import { EntitlementProvider, useEntitlement } from '../src/features/plus/use-entitlement';
import type { Entitlement, PurchaseProvider, Result } from '../src/features/plus/types';

const FREE = ['crisis988', 'dataExport', 'dataDeletion', 'logging', 'checkins', 'workouts', 'barcode', 'pwaImport', 'basicTrends', 'advancedTrends', 'workoutSummary', 'widgets', 'liveActivity'] as const;
const PLUS = ['aiFoodUnlimited', 'aiHigherCaps', 'aiVoiceFoodLog', 'aiRecipeImport', 'aiMenuScan'] as const;
const failure = { status: 'error', error: { code: 'unavailable' } } as const;

describe('Plus feature policy', () => {
  it('lists every always-free feature', () => {
    expect([...ALWAYS_FREE].sort()).toEqual([...FREE].sort());
  });
  it.each(FREE)('keeps %s free regardless of entitlement', feature => {
    expect(FEATURE_ENTITLEMENTS[feature]).toBe('free');
    expect(isFeatureAvailable(feature, 'free')).toBe(true);
    expect(isFeatureAvailable(feature, 'plus')).toBe(true);
  });
  it('configures two free AI food logs per day', () => {
    expect(FREE_AI_FOOD_LOGS_PER_DAY).toBe(2);
  });
  it('gates only the AI extras', () => {
    expect(Object.entries(FEATURE_ENTITLEMENTS).filter(([, entitlement]) => entitlement === 'plus').map(([feature]) => feature).sort()).toEqual([...PLUS].sort());
  });
  it.each(PLUS)('requires Plus for %s', feature => {
    expect(FEATURE_ENTITLEMENTS[feature]).toBe('plus');
    expect(isFeatureAvailable(feature, 'free')).toBe(false);
    expect(isFeatureAvailable(feature, 'plus')).toBe(true);
  });
});

describe('local purchase provider', () => {
  it('supplies configured prices and trial without exposing mutable config', async () => {
    const provider = createMockPurchaseProvider();
    expect(await provider.getProducts()).toEqual({ status: 'success', value: [
      { id: 'plus_monthly', price: 4.99, currency: 'USD', period: 'month', trialDays: 7 },
      { id: 'plus_yearly', price: 39.99, currency: 'USD', period: 'year', trialDays: 7 },
    ] });
    const config = { monthlyPrice: 2, yearlyPrice: 20, trialDays: 14 };
    const configured = createMockPurchaseProvider(config);
    config.monthlyPrice = 100;
    expect(await configured.getProducts()).toMatchObject({ value: [ { price: 2, trialDays: 14 }, { price: 20, trialDays: 14 } ] });
    const products = await provider.getProducts();
    if (products.status !== 'success') throw new Error('products unavailable');
    expect(Object.isFrozen(products.value)).toBe(true);
    expect(Object.isFrozen(products.value[0])).toBe(true);
  });
  it('purchases, notifies, restores, and unsubscribes idempotently', async () => {
    const provider = createMockPurchaseProvider();
    const listener = jest.fn();
    const subscription = provider.subscribe(listener);
    expect(await provider.restore()).toEqual({ status: 'success', value: 'free' });
    listener.mockClear();
    expect(await provider.purchase('plus_yearly')).toEqual({ status: 'success', value: 'plus' });
    expect(listener).toHaveBeenCalledWith('plus');
    expect(await provider.restore()).toEqual({ status: 'success', value: 'plus' });
    expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'plus' });
    if (subscription.status !== 'success') throw new Error('subscription failed');
    subscription.value(); subscription.value(); listener.mockClear();
    await provider.purchase('plus_monthly');
    expect(listener).not.toHaveBeenCalled();
  });
  it.each(['cancelled', 'pending', 'error'] as const)('does not grant Plus for %s', async status => {
    const provider = createMockPurchaseProvider({ purchaseResult: status === 'error' ? failure : { status } });
    expect(await provider.purchase('plus_monthly')).toMatchObject({ status });
    expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'free' });
  });
  it('supports restore-only ownership and errors for each provider operation', async () => {
    expect(await createMockPurchaseProvider({ restoredEntitlement: 'plus' }).restore()).toEqual({ status: 'success', value: 'plus' });
    const provider = createMockPurchaseProvider({ productsResult: failure, entitlementResult: failure, restoreResult: failure, subscribeResult: failure });
    expect(await provider.getProducts()).toEqual(failure);
    expect(await provider.getEntitlement()).toEqual(failure);
    expect(await provider.restore()).toEqual(failure);
    expect(provider.subscribe(jest.fn())).toEqual(failure);
  });
  it('rejects unknown product identifiers without granting ownership', async () => {
    const provider = createMockPurchaseProvider();
    // Exercise an untyped/native caller without weakening the public ProductId union.
    expect(await provider.purchase('unknown' as never)).toEqual({ status: 'error', error: { code: 'invalid_product' } });
    expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'free' });
  });
  it('isolates instances and listener exceptions', async () => {
    const provider = createMockPurchaseProvider();
    provider.subscribe(() => { throw new Error('synthetic listener failure'); });
    const listener = jest.fn(); provider.subscribe(listener);
    await expect(provider.purchase('plus_monthly')).resolves.toEqual({ status: 'success', value: 'plus' });
    expect(listener).toHaveBeenCalledWith('plus');
    expect(await createMockPurchaseProvider().getEntitlement()).toEqual({ status: 'success', value: 'free' });
  });
});

describe('entitlement store and hook', () => {
  it('restores ownership and propagates external provider changes to React', async () => {
    const provider = createMockPurchaseProvider({ restoredEntitlement: 'plus' });
    const wrapper = ({ children }: PropsWithChildren) => createElement(EntitlementProvider, { provider }, children);
    const { result, unmount } = await renderHook(() => useEntitlement(), { wrapper });
    expect(result.current.entitlement).toBe('free');
    for (const feature of FREE) expect(result.current.isFeatureAvailable(feature)).toBe(true);
    for (const feature of PLUS) expect(result.current.isFeatureAvailable(feature)).toBe(false);
    await act(async () => { await result.current.restore(); });
    expect(result.current.entitlement).toBe('plus');
    for (const feature of FREE) expect(result.current.isFeatureAvailable(feature)).toBe(true);
    for (const feature of PLUS) expect(result.current.isFeatureAvailable(feature)).toBe(true);
    await unmount();
  });
  it('uses a local default in development', async () => {
    const wrapper = ({ children }: PropsWithChildren) => createElement(EntitlementProvider, {}, children);
    const { result } = await renderHook(() => useEntitlement(), { wrapper });
    await act(async () => { await result.current.purchase('plus_monthly'); });
    expect(result.current.entitlement).toBe('plus');
  });
  it('subscribes only while observed and cleans up after the last subscriber', async () => {
    const provider = createMockPurchaseProvider();
    const unsubscribe = jest.fn();
    const subscribe = jest.spyOn(provider, 'subscribe').mockReturnValue({ status: 'success', value: unsubscribe });
    const store = createEntitlementStore(provider);
    expect(subscribe).not.toHaveBeenCalled();
    const offA = store.subscribe(jest.fn()); const offB = store.subscribe(jest.fn());
    expect(subscribe).toHaveBeenCalledTimes(1);
    offA(); expect(unsubscribe).not.toHaveBeenCalled();
    offB(); offB(); expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it('contains rejected or throwing providers without leaking their error text', async () => {
    const provider = createMockPurchaseProvider();
    provider.purchase = () => { throw new Error('synthetic private detail'); };
    provider.restore = async () => { throw new Error('synthetic private detail'); };
    const store = createEntitlementStore(provider);
    expect(await store.purchase('plus_monthly')).toEqual({ status: 'error', error: { code: 'provider_failure' } });
    expect(await store.restore()).toEqual({ status: 'error', error: { code: 'provider_failure' } });
    expect(store.getSnapshot().entitlement).toBe('free');
  });
  it('preserves entitlement on cancelled, pending and failed purchases', async () => {
    for (const purchaseResult of [{ status: 'cancelled' }, { status: 'pending' }, failure] as const) {
      const store = createEntitlementStore(createMockPurchaseProvider({ initialEntitlement: 'plus', purchaseResult }));
      await store.refresh();
      expect(await store.purchase('plus_monthly')).toEqual(purchaseResult);
      expect(store.getSnapshot().entitlement).toBe('plus');
    }
  });
  it('contains subscription errors and refresh errors', async () => {
    const store = createEntitlementStore(createMockPurchaseProvider({ subscribeResult: failure, entitlementResult: failure }));
    const off = store.subscribe(jest.fn());
    expect(store.getSnapshot().error).toEqual(failure.error);
    expect(await store.refresh()).toEqual(failure);
    expect(store.getSnapshot().entitlement).toBe('free'); off();
  });
  it('contains thrown subscription setup and rejected refresh calls', async () => {
    const provider = createMockPurchaseProvider();
    provider.subscribe = () => { throw new Error('synthetic adapter detail'); };
    provider.getEntitlement = async () => { throw new Error('synthetic adapter detail'); };
    const store = createEntitlementStore(provider);
    const off = store.subscribe(jest.fn());
    expect(store.getSnapshot().error).toEqual({ code: 'provider_failure' });
    expect(await store.refresh()).toEqual({ status: 'error', error: { code: 'provider_failure' } });
    off();
  });
  it('updates all observers on provider changes and ignores callbacks after cleanup', async () => {
    let notify!: (entitlement: Entitlement) => void;
    const provider = createMockPurchaseProvider();
    provider.subscribe = listener => { notify = listener; return { status: 'success', value: jest.fn() }; };
    const store = createEntitlementStore(provider);
    const off = store.subscribe(jest.fn());
    await store.refresh();
    notify('plus'); expect(store.getSnapshot().entitlement).toBe('plus');
    notify('free'); expect(store.getSnapshot().entitlement).toBe('free');
    off(); notify('plus');
    expect(store.getSnapshot().entitlement).toBe('free');
  });
  it('does not let a stale refresh revoke a newer purchase', async () => {
    let resolve!: (result: Result<Entitlement>) => void;
    const provider: PurchaseProvider = { ...createMockPurchaseProvider(), getEntitlement: () => new Promise(done => { resolve = done; }) };
    const store = createEntitlementStore(provider);
    const refresh = store.refresh();
    await store.purchase('plus_monthly');
    resolve({ status: 'success', value: 'free' }); await refresh;
    expect(store.getSnapshot().entitlement).toBe('plus');
  });
});
