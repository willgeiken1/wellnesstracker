import { Redirect, router } from 'expo-router';
import { PaywallScreen } from '../features/paywall/screen';
import { mockPurchaseProvider } from '../features/paywall/purchase-provider';
import { LEGAL_LINKS } from '../features/settings/links';

/** The Insight Plus preview. No store is connected: the plans come from the local provider, and buying is
 * switched off and says so. Release builds never show it, because a plan that cannot be bought, at a made-up
 * price, is not something to ship (App Review 2.1 and 3.1.1); nothing in the app links here. */
export default function PaywallRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <PaywallScreen products={mockPurchaseProvider.products} purchasesAvailable={false}
    onPurchase={mockPurchaseProvider.purchase} onRestore={mockPurchaseProvider.restore}
    onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
    termsUrl={LEGAL_LINKS.terms} privacyUrl={LEGAL_LINKS.privacy} />;
}
