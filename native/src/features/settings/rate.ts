import { Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';

/** The parts of expo-store-review Rate Insight uses, so tests can stand in for the App Store. */
export interface ReviewHost { isAvailableAsync(): Promise<boolean>; requestReview(): Promise<void>; storeUrl(): string | null }

/**
 * Settings, About, Rate Insight: the system's own rating prompt where iOS offers it, otherwise the App Store page when
 * the app config names one (`ios.appStoreUrl`), otherwise nothing. iOS decides whether its prompt shows, so a tap
 * that shows nothing is expected and says nothing.
 */
export async function rateInsight(host: ReviewHost = StoreReview, open: (url: string) => Promise<unknown> = url => Linking.openURL(url)): Promise<'review' | 'store' | 'none'> {
  try {
    if (await host.isAvailableAsync()) { await host.requestReview(); return 'review'; }
  } catch { /* falls through to the store page */ }
  let url: string | null = null;
  try { url = host.storeUrl(); } catch { url = null; }
  if (!url) return 'none';
  try { await open(url); return 'store'; } catch { return 'none'; }
}
