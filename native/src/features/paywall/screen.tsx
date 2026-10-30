import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import type { PaywallProduct } from './purchase-provider';

export interface PaywallScreenProps {
  products: readonly PaywallProduct[];
  onPurchase(id: string): void;
  onRestore(): void;
  onClose(): void;
  termsUrl: string;
  privacyUrl: string;
  busy?: boolean;
  error?: string | null;
}

const alwaysFree = [
  '988 crisis card', 'Data export', 'Data and account deletion', 'Logging',
  'Check-ins', 'Workouts', 'Barcode scan', 'PWA importer', 'Basic trends',
] as const;

/** Presentation only. The caller owns purchase/restore state and all access decisions. */
export function PaywallScreen({ products, onPurchase, onRestore, onClose, termsUrl, privacyUrl, busy = false, error }: PaywallScreenProps) {
  const { colors } = useTheme();
  const [linkError, setLinkError] = useState<string | null>(null);
  const openLegal = async (url: string) => {
    setLinkError(null);
    try { await Linking.openURL(url); }
    catch { setLinkError('Could not open the link. Please try again.'); }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={{ padding: tokens.spacing[2], alignItems: 'flex-end' }}>
      <Button label="Close" accessibilityLabel="Close paywall" variant="secondary" onPress={onClose} />
    </View>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: tokens.spacing[4], gap: tokens.spacing[4] }}>
      <ThemedText variant="title" accessibilityRole="header">Insight Plus</ThemedText>
      <ThemedText>More room for your food insights</ThemedText>
      <ThemedText>AI food Snap/Describe beyond free tries, higher AI daily caps and advanced trends.</ThemedText>
      <View testID="paywall-always-free" style={{ gap: tokens.spacing[2] }}>
        <ThemedText variant="headline" accessibilityRole="header">Always free</ThemedText>
        {alwaysFree.map(feature => <ThemedText key={feature}>{feature}</ThemedText>)}
        <ThemedText muted>No subscription required for these features.</ThemedText>
      </View>
      {products.length === 0 && <ThemedText>No plans available right now. Please try again later.</ThemedText>}
      {products.map(product => <View key={product.id} testID={`paywall-product-${product.id}`} style={{
        backgroundColor: colors.surface, borderRadius: tokens.radii.input,
        padding: tokens.spacing[4], gap: tokens.spacing[2],
      }}>
        <ThemedText variant="headline" accessibilityRole="header">{product.title}</ThemedText>
        <ThemedText>{product.priceString} per {product.period}</ThemedText>
        <ThemedText>{product.trialDays && product.trialDays > 0
          ? `${product.trialDays}-day free trial, then ${product.priceString} per ${product.period}.`
          : 'No free trial.'}</ThemedText>
        <ThemedText>Renews automatically unless cancelled at least 24 hours before the end of the period; manage in Settings.</ThemedText>
        <Button label={product.trialDays && product.trialDays > 0 ? 'Start free trial' : 'Subscribe'}
          accessibilityLabel={`Subscribe to ${product.title}`} disabled={busy}
          onPress={() => onPurchase(product.id)} />
      </View>)}
      {busy && <ThemedText accessibilityLiveRegion="polite">Processing. You can close this screen at any time.</ThemedText>}
      {!!error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
      <Button label="Restore Purchases" variant="secondary" disabled={busy} onPress={onRestore} />
      {[{ label: 'Terms (EULA)', url: termsUrl }, { label: 'Privacy', url: privacyUrl }].map(link => <Pressable
        key={link.label} accessibilityRole="link" accessibilityLabel={link.label} onPress={() => { void openLegal(link.url); }}
        style={{ minHeight: touchTarget, justifyContent: 'center' }}>
        <ThemedText style={{ textDecorationLine: 'underline' }}>{link.label}</ThemedText>
      </Pressable>)}
      {linkError && <ThemedText accessibilityRole="alert">{linkError}</ThemedText>}
    </ScrollView>
  </SafeAreaView>;
}
