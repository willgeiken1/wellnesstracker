import { Redirect, router } from 'expo-router';
import { PaywallScreen } from '../features/paywall/screen';
import { mockPurchaseProvider } from '../features/paywall/purchase-provider';

/** The published terms and privacy pages (repository root, served by GitHub Pages). */
const SITE = 'https://willgeiken1.github.io/wellnesstracker';

/** The Insight Plus preview, kept for when Plus comes back. No store is connected: the plans come from the local
 * provider, and buying is switched off and says so. Insight launches free, so release builds never show it: a plan
 * that cannot be bought, at a made-up price, is not something to ship (App Review 2.1 and 3.1.1). Nothing in the
 * app links here and the link gate in +native-intent never lets a link reach it; this redirect is the last guard. */
export default function PaywallRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <PaywallScreen products={mockPurchaseProvider.products} purchasesAvailable={false}
    onPurchase={mockPurchaseProvider.purchase} onRestore={mockPurchaseProvider.restore}
    onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
    termsUrl={`${SITE}/insight-daily-terms`} privacyUrl={`${SITE}/insight-daily-privacy`} />;
}
