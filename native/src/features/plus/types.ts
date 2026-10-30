export type Entitlement = 'free' | 'plus';
export type PlusFeature = 'aiFoodUnlimited' | 'aiHigherCaps' | 'advancedTrends';
export type ProductId = 'plus_monthly' | 'plus_yearly';

export interface Product {
  readonly id: ProductId;
  readonly price: number;
  readonly currency: 'USD';
  readonly period: 'month' | 'year';
  readonly trialDays: number;
}

/** Codes only: never forward raw SDK errors or purchase/customer attributes. */
export interface PurchaseError {
  readonly code: 'unavailable' | 'invalid_product' | 'provider_failure';
}
export type Result<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'cancelled' }
  | { readonly status: 'pending' }
  | { readonly status: 'error'; readonly error: PurchaseError };
export type Unsubscribe = () => void;

/** Implementations must resolve typed results, never throw/reject across this boundary.
 * Listeners receive entitlement only. Unsubscribe must be idempotent and never throw.
 */
export interface PurchaseProvider {
  getProducts(): Promise<Result<readonly Product[]>>;
  purchase(id: ProductId): Promise<Result<Entitlement>>;
  restore(): Promise<Result<Entitlement>>;
  getEntitlement(): Promise<Result<Entitlement>>;
  subscribe(listener: (entitlement: Entitlement) => void): Result<Unsubscribe>;
}
