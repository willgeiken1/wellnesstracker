import { Pressable, View } from 'react-native';
import { Screen } from '@/components/screen';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { SegmentedControl } from '@/components/segmented-control';
import { useTheme } from '@/design/theme-provider';
import { paletteLocked, palettes, tokens, type Palette, type ThemeOverride } from '@/design/tokens';
import { t } from '@/i18n/en';

/** One theme, drawn in its own colours for the current light or dark mode: a small card, the accent and the three pillar colours. */
function ThemeTile({ id, selected, onPress }: { id: Palette; selected: boolean; onPress: () => void }) {
  const { mode, colors } = useTheme();
  const palette = tokens.palettes[id], c = palette[mode], locked = paletteLocked(id);
  return <Pressable testID={`theme-${id}`} accessibilityRole="button"
    accessibilityLabel={locked ? `${palette.name}, ${t('themeLocked')}` : palette.name}
    accessibilityState={{ selected, disabled: locked }} disabled={locked} onPress={onPress}
    style={{ flexGrow: 1, flexBasis: '45%', minHeight: 112, padding: tokens.spacing[2], gap: tokens.spacing[1],
      borderRadius: tokens.radii.card, backgroundColor: c.bg, opacity: locked ? 0.5 : 1,
      borderWidth: 2, borderColor: selected ? colors.accent : c['hair-2'] }}>
    <View accessible={false} style={{ backgroundColor: c.surface, borderRadius: tokens.radii.input, padding: tokens.spacing[1], gap: tokens.spacing[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0] }}>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
        <View style={{ width: 18, height: 8, borderRadius: 4, backgroundColor: c['surface-2'] }} />
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.spacing[0] }}>
        {([c.training, c.food, c.sleep] as const).map((color, index) =>
          <View key={index} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }} />)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0] }}>
      <ThemedText variant="caption" style={{ color: c.text, flex: 1, fontWeight: selected ? '600' : '400' }}>{palette.name}</ThemedText>
      {selected && <View testID="theme-selected-mark" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />}
    </View>
  </Pressable>;
}

export default function Appearance() {
  const { override, setOverride, palette, setPalette, persistenceError } = useTheme();
  return <Screen><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('themeMode')}</ThemedText>
    <SegmentedControl label={t('themeMode')} value={override} onChange={setOverride}
      options={(['system', 'light', 'dark'] as ThemeOverride[]).map(value => ({ value, label: t(value) }))} />
  </Card><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('theme')}</ThemedText>
    <ThemedText muted variant="caption">{t('themeBody')}</ThemedText>
    <View testID="theme-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
      {palettes.map(id => <ThemeTile key={id} id={id} selected={palette === id} onPress={() => setPalette(id)} />)}
      {palettes.length % 2 === 1 && <View style={{ flexGrow: 1, flexBasis: '45%' }} />}
    </View>
    <ThemedText muted variant="caption">{t('appearanceHint')}</ThemedText>
    {persistenceError && <ThemedText accessibilityRole="alert">{t('preferenceError')}</ThemedText>}
  </Card></Screen>;
}
