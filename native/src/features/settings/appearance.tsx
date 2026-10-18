import { View } from 'react-native';
import { Screen } from '@/components/screen';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { SegmentedControl } from '@/components/segmented-control';
import { useTheme } from '@/design/theme-provider';
import { accents, tokens, type ThemeOverride } from '@/design/tokens';
import { t } from '@/i18n/en';
export default function Appearance() {
  const { override, setOverride, accent, setAccent, persistenceError } = useTheme();
  return <Screen><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('theme')}</ThemedText>
    <SegmentedControl label={t('theme')} value={override} onChange={setOverride}
      options={(['system', 'light', 'dark'] as ThemeOverride[]).map(value => ({ value, label: t(value) }))} />
    <ThemedText variant="headline" accessibilityRole="header">{t('accent')}</ThemedText>
    {accents.map(value => <View key={value} style={{ gap: tokens.spacing[1] }}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing[1] }} accessible={false}>
        {tokens.accents[value].swatches.map(color => <View key={color} style={{ width: 24, height: 24, borderRadius: tokens.radii.input, backgroundColor: color }} />)}
      </View>
      <Chip label={t(value)} selected={accent === value} onPress={() => setAccent(value)} />
    </View>)}
    <ThemedText muted variant="caption">{t('appearanceHint')}</ThemedText>
    {persistenceError && <ThemedText accessibilityRole="alert">{t('preferenceError')}</ThemedText>}
  </Card></Screen>;
}
