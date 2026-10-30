import { router } from 'expo-router';
import { View } from 'react-native';
import { ThemedText } from '../components/themed-text';
import { PaywallScreen } from '../features/paywall/screen';
import { mockPurchaseProvider } from '../features/paywall/purchase-provider';

/** Local preview. Prices are synthetic; no store, account or entitlement calls. */
export default function PaywallRoute() {
  return <View style={{ flex: 1 }}>
    <ThemedText accessibilityRole="alert">Simulator preview · Sample prices · Purchases disabled</ThemedText>
    <PaywallScreen products={mockPurchaseProvider.products}
      onPurchase={mockPurchaseProvider.purchase} onRestore={mockPurchaseProvider.restore}
      onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
      termsUrl="https://example.invalid/terms" privacyUrl="https://example.invalid/privacy" />
  </View>;
}
