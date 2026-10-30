/** Store-independent boundary. No entitlement or user data belongs in this contract. */
export interface PaywallProduct {
  id: string;
  title: string;
  priceString: string;
  period: string;
  trialDays?: number;
}

export interface PurchaseProvider {
  readonly products: readonly PaywallProduct[];
  purchase(id: string): void;
  restore(): void;
}

/** Simulator fixture only: callbacks intentionally do nothing and grant no access. */
export const mockPurchaseProvider: PurchaseProvider = {
  products: [
    { id: 'mock-plus-monthly', title: 'Insight Plus Monthly', priceString: '$4.99', period: 'month', trialDays: 7 },
    { id: 'mock-plus-yearly', title: 'Insight Plus Yearly', priceString: '$39.99', period: 'year' },
  ],
  purchase: (_id: string) => {},
  restore: () => {},
};
