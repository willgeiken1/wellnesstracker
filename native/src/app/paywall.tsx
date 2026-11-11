import { router } from 'expo-router';
import { PaywallScreen } from '../features/paywall/screen';
import { mockPurchaseProvider } from '../features/paywall/purchase-provider';

/** No store is connected in this build: the plans come from the local provider, and buying is switched off and says so. */
export default function PaywallRoute() {
  return <PaywallScreen products={mockPurchaseProvider.products} purchasesAvailable={false}
    onPurchase={mockPurchaseProvider.purchase} onRestore={mockPurchaseProvider.restore}
    onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
    termsUrl="https://example.invalid/terms" privacyUrl="https://example.invalid/privacy" />;
}
