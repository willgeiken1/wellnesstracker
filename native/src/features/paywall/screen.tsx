import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { touchTarget } from '../../components/button';
import { Card } from '../../components/card';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { FREE_AI_FOOD_LOGS_PER_DAY } from '../food/ai/config';
import { Line } from '../workout/primitives';
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
  /** False when this build cannot take payments. The plans still show; buying and restoring are switched off and say why. */
  purchasesAvailable?: boolean;
}

const alwaysFree = [
  '988 crisis card', 'Data export', 'Data and account deletion', 'Logging',
  'Check-ins', 'Workouts', 'Barcode scan', 'Import from the web app', 'Basic trends',
  'Advanced trends', 'Plain workout summary',
] as const;

const plusBenefits = [
  'AI food logging beyond the free tries',
  'Higher daily AI limits',
] as const;

export const paywallCopy = {
  title: 'Insight Plus',
  lead: 'Insight is free. Plus adds extra AI help, and nothing else.',
  adds: 'What Plus adds',
  staysFree: 'Everything else stays free, with or without Plus.',
  choose: 'Choose a plan',
  free: 'Always free',
  noSubscription: 'No subscription required for these features.',
  noPlans: 'No plans available right now. Please try again later.',
  noTrial: 'No free trial.',
  renewal: 'Renews automatically unless cancelled at least 24 hours before the end of the period; manage in Settings.',
  unavailable: 'Purchases are not available in this version of the app yet.',
  busy: 'Processing. You can close this screen at any time.',
  restore: 'Restore purchases',
  terms: 'Terms of use',
  privacy: 'Privacy policy',
  linkError: 'Could not open the link. Please try again.',
  retry: 'Retry',
  close: 'Close Insight Plus',
} as const;

const semibold = { fontWeight: '600' } as const;
const price = (product: PaywallProduct) => `${product.priceString} per ${product.period}`;
const trial = (product: PaywallProduct) => product.trialDays && product.trialDays > 0
  ? `${product.trialDays}-day free trial, then ${price(product)}.`
  : paywallCopy.noTrial;

/** Presentation only. The caller owns purchase/restore state and all access decisions. */
export function PaywallScreen({ products, onPurchase, onRestore, onClose, termsUrl, privacyUrl, busy = false, error, purchasesAvailable = true }: PaywallScreenProps) {
  const { colors } = useTheme();
  // The first plan the store lists starts selected, so the button always names a plan. No plan is pushed over another.
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = products.find(product => product.id === chosen) ?? products[0];
  const [failedLink, setFailedLink] = useState<string | null>(null);
  const openLegal = async (url: string) => {
    setFailedLink(null);
    try { await Linking.openURL(url); }
    catch { setFailedLink(url); }
  };
  const blocked = busy || !purchasesAvailable;
  const hint = purchasesAvailable ? undefined : paywallCopy.unavailable;
  const note = [styles.note, { backgroundColor: colors['surface-2'] }];

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={styles.bar}>
      <Pressable testID="paywall-close" accessibilityRole="button" accessibilityLabel={paywallCopy.close} onPress={onClose}
        style={({ pressed }) => [styles.close, { backgroundColor: colors['surface-2'], opacity: pressed ? 0.7 : 1 }]}>
        <Line name="close" size={18} color={colors.text} />
      </Pressable>
    </View>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={{ gap: tokens.spacing[0] }}>
        <ThemedText variant="display" accessibilityRole="header" style={semibold}>{paywallCopy.title}</ThemedText>
        <ThemedText muted>{paywallCopy.lead}</ThemedText>
      </View>

      <Card testID="paywall-plus-benefits" style={styles.card}>
        <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{paywallCopy.adds}</ThemedText>
        {plusBenefits.map(benefit => <View key={benefit} style={styles.benefit}>
          <View style={[styles.tick, { backgroundColor: colors['accent-tint'] }]}><Line name="check" size={14} color={colors.text} /></View>
          <ThemedText style={{ flex: 1 }}>{benefit}</ThemedText>
        </View>)}
      </Card>
      <ThemedText testID="paywall-stays-free" style={semibold}>{paywallCopy.staysFree}</ThemedText>

      {products.length === 0
        ? <View style={note}><ThemedText muted style={{ flex: 1 }}>{paywallCopy.noPlans}</ThemedText></View>
        : <View style={{ gap: tokens.spacing[1] }}>
          <View accessibilityRole="radiogroup" accessibilityLabel={paywallCopy.choose} style={{ gap: tokens.spacing[1] }}>
            {products.map(product => {
              const on = product.id === selected?.id;
              return <Pressable key={product.id} testID={`paywall-product-${product.id}`} accessibilityRole="radio"
                accessibilityLabel={`${product.title}, ${price(product)}. ${trial(product)}`}
                accessibilityState={{ selected: on, checked: on }} onPress={() => setChosen(product.id)}
                style={[styles.plan, { borderColor: on ? colors.accent : colors['hair-2'], backgroundColor: on ? colors['accent-tint'] : colors.surface }]}>
                <View style={[styles.dot, { borderColor: on ? colors.accent : colors['text-muted'] }]}>
                  {on && <View style={[styles.dotFill, { backgroundColor: colors.accent }]} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText variant="headline" style={semibold}>{product.title}</ThemedText>
                  <ThemedText numeric style={semibold}>{price(product)}</ThemedText>
                  <ThemedText muted={!on} variant="caption">{trial(product)}</ThemedText>
                </View>
              </Pressable>;
            })}
          </View>
          {selected && <Pressable testID="paywall-subscribe" accessibilityRole="button"
            accessibilityLabel={`Subscribe to ${selected.title}`} accessibilityHint={hint}
            accessibilityState={{ disabled: blocked, busy }} disabled={blocked} onPress={() => onPurchase(selected.id)}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: blocked ? 0.5 : pressed ? 0.75 : 1 }]}>
            {busy && <ActivityIndicator color={colors['on-accent']} />}
            <ThemedText style={[semibold, { color: colors['on-accent'], textAlign: 'center' }]}>
              {selected.trialDays && selected.trialDays > 0 ? 'Start free trial' : 'Subscribe'}
            </ThemedText>
          </Pressable>}
          {!purchasesAvailable && <View testID="paywall-unavailable" style={note}>
            <ThemedText muted style={{ flex: 1 }}>{paywallCopy.unavailable}</ThemedText>
          </View>}
          <ThemedText muted variant="caption">{paywallCopy.renewal}</ThemedText>
        </View>}
      {busy && <ThemedText muted accessibilityLiveRegion="polite">{paywallCopy.busy}</ThemedText>}
      {!!error && <View testID="paywall-error" style={note}>
        <ThemedText muted accessibilityRole="alert" style={{ flex: 1 }}>{error}</ThemedText>
      </View>}

      <Card testID="paywall-always-free" style={styles.card}>
        <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{paywallCopy.free}</ThemedText>
        <View style={styles.pills}>
          {alwaysFree.map(feature => <View key={feature} style={[styles.pill, { backgroundColor: colors['surface-2'] }]}>
            <ThemedText variant="caption">{feature}</ThemedText>
          </View>)}
        </View>
        <ThemedText>{`${FREE_AI_FOOD_LOGS_PER_DAY} free AI food logs per day with Snap/Describe.`}</ThemedText>
        <ThemedText muted variant="caption">{paywallCopy.noSubscription}</ThemedText>
      </Card>

      <View style={{ alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={paywallCopy.restore} accessibilityHint={hint}
          accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={onRestore}
          style={[styles.quiet, { opacity: blocked ? 0.5 : 1 }]}>
          <ThemedText style={[semibold, { color: colors.accent }]}>{paywallCopy.restore}</ThemedText>
        </Pressable>
        <View style={styles.links}>
          {[{ label: paywallCopy.terms, url: termsUrl }, { label: paywallCopy.privacy, url: privacyUrl }].map(link => <Pressable
            key={link.label} accessibilityRole="link" accessibilityLabel={link.label} onPress={() => { void openLegal(link.url); }}
            style={styles.quiet}>
            <ThemedText muted>{link.label}</ThemedText>
          </Pressable>)}
        </View>
      </View>
      {failedLink && <View testID="paywall-link-error" style={note}>
        <ThemedText muted accessibilityRole="alert" style={{ flex: 1 }}>{paywallCopy.linkError}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={paywallCopy.retry} onPress={() => { void openLegal(failedLink); }} style={styles.quiet}>
          <ThemedText style={[semibold, { color: colors.accent }]}>{paywallCopy.retry}</ThemedText>
        </Pressable>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: tokens.spacing[3], paddingTop: tokens.spacing[1] },
  close: { width: touchTarget, height: touchTarget, borderRadius: touchTarget / 2, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: tokens.spacing[3], paddingBottom: tokens.spacing[5], gap: tokens.spacing[3] },
  card: { borderRadius: 18, padding: tokens.spacing[3] },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] },
  tick: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plan: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: 72, padding: tokens.spacing[2], borderRadius: 18, borderWidth: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotFill: { width: 10, height: 10, borderRadius: 5 },
  primary: { minHeight: 52, borderRadius: 16, paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[1],
    flexDirection: 'row', gap: tokens.spacing[1], alignItems: 'center', justifyContent: 'center', marginTop: tokens.spacing[1] },
  note: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: touchTarget,
    borderRadius: tokens.radii.input, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[1] },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { minHeight: 28, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: tokens.spacing[2] },
  quiet: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: tokens.spacing[1], alignItems: 'center', justifyContent: 'center' },
});
