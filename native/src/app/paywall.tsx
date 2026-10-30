import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ThemedText } from '../components/themed-text';
import { PaywallScreen } from '../features/paywall/screen';
import { useEntitlement, usePurchaseProvider } from '../features/plus/use-entitlement';
import type { Product } from '../features/plus/types';

/** Local mock purchases only; no store SDK or customer attributes. */
export default function PaywallRoute() {
  const provider = usePurchaseProvider();
  const { entitlement, status, error, purchase, restore } = useEntitlement();
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [productError, setProductError] = useState(false);
  useEffect(() => {
    let active = true;
    void provider.getProducts().then(result => {
      if (!active) return;
      if (result.status === 'success') setProducts(result.value);
      else setProductError(true);
    }).catch(() => { if (active) setProductError(true); });
    return () => { active = false; };
  }, [provider]);
  return <View style={{ flex: 1 }}>
    <ThemedText accessibilityRole="alert">Simulator preview · Sample prices · No real purchases</ThemedText>
    <ThemedText accessibilityLiveRegion="polite">{entitlement === 'plus' ? 'Insight Plus active (simulated)' : 'Free plan'}</ThemedText>
    <PaywallScreen products={products.map(product => ({ ...product,
      title: product.period === 'month' ? 'Insight Plus Monthly' : 'Insight Plus Yearly',
      priceString: new Intl.NumberFormat('en-US', { style: 'currency', currency: product.currency }).format(product.price),
    }))}
      onPurchase={id => { const product = products.find(p => p.id === id); if (product) void purchase(product.id); }}
      onRestore={() => { void restore(); }} busy={status === 'loading'}
      error={error || productError ? 'Could not load or update simulated purchases. Please try again.' : null}
      onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
      termsUrl="https://example.invalid/terms" privacyUrl="https://example.invalid/privacy" />
  </View>;
}
