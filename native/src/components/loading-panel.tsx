import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { Card } from './card';
import { ThemedText } from './themed-text';

/** What a tab shows while its data is still opening (REDESIGN §3.7). Nothing for the first 0.3 s, so a quick
 * open never flickers; then one quiet panel. Never an empty state, and never a "coming soon" badge. */
export function LoadingPanel({ testID = 'loading-panel' }: { testID?: string }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setShown(true), 300); return () => clearTimeout(timer); }, []);
  if (!shown) return null;
  return <Card testID={testID} style={{ borderRadius: 18, padding: tokens.spacing[3] }}>
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('loadingData')} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
      <ActivityIndicator color={colors['text-muted']} />
      <ThemedText muted>{t('loadingData')}</ThemedText>
    </View>
  </Card>;
}
