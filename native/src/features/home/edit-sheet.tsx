import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { appleHealth } from '../health/apple';
import { HEALTH_TILES, addTile, isSmall, moveTile, offHome, removeTile, setWide, type HomeTiles, type TileId } from './tiles';

export const TILE_NAME: Record<TileId, 'homeTileMap' | 'homeTileScore' | 'homeTileWeek' | 'homeTileNext' | 'homeCalories' | 'homeProtein' | 'volume' | 'weight' | 'homeSteps' | 'homeSleep'> = {
  map: 'homeTileMap', score: 'homeTileScore', week: 'homeTileWeek', next: 'homeTileNext', calories: 'homeCalories', protein: 'homeProtein', volume: 'volume', weight: 'weight',
  steps: 'homeSteps', sleep: 'homeSleep',
};
const ABOUT: Record<TileId, 'homeTileMapAbout' | 'homeTileScoreAbout' | 'homeTileWeekAbout' | 'homeTileNextAbout' | 'homeTileCaloriesAbout' | 'homeTileProteinAbout' | 'homeTileVolumeAbout' | 'homeTileWeightAbout' | 'homeTileStepsAbout' | 'homeTileSleepAbout'> = {
  map: 'homeTileMapAbout', score: 'homeTileScoreAbout', week: 'homeTileWeekAbout', next: 'homeTileNextAbout', calories: 'homeTileCaloriesAbout', protein: 'homeTileProteinAbout',
  volume: 'homeTileVolumeAbout', weight: 'homeTileWeightAbout', steps: 'homeTileStepsAbout', sleep: 'homeTileSleepAbout',
};
const GLYPH = { up: 'M6 14l6-6 6 6', down: 'M6 10l6 6 6-6', remove: 'M6 12h12', add: 'M12 6v12M6 12h12' } as const;

function Round({ glyph, label, onPress, disabled, tone }: { glyph: keyof typeof GLYPH; label: string; onPress: () => void; disabled?: boolean; tone?: 'accent' | 'danger' }) {
  const { colors } = useTheme();
  const fill = tone === 'accent' ? colors.accent : colors['surface-2'];
  const ink = tone === 'accent' ? colors['on-accent'] : tone === 'danger' ? colors.danger : colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: fill, opacity: disabled ? 0.35 : pressed ? 0.8 : 1 })}>
    <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}><Path d={GLYPH[glyph]} fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
  </Pressable>;
}

/** Edit Home: what is on Home (reorder, resize, remove) and what can be added. Every change applies at once; Done only closes. */
export function EditHome({ visible, tiles, onChange, onClose }: { visible: boolean; tiles: HomeTiles; onChange: (next: HomeTiles) => void; onClose: () => void }) {
  const { colors, reduceMotion } = useTheme();
  // The Apple Health tiles are offered only where Apple Health can exist.
  const healthHere = useMemo(() => !!appleHealth(), []);
  const rest = offHome(tiles).filter(id => !HEALTH_TILES.includes(id) || healthHere);
  const row = { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], padding: tokens.spacing[2], borderRadius: 18, backgroundColor: colors.surface } as const;
  const name = (id: TileId) => t(TILE_NAME[id]);
  return <Modal testID="home-edit-sheet" visible={visible} animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: tokens.spacing[3] }}>
        <ThemedText variant="title" accessibilityRole="header" style={{ flex: 1, fontWeight: '600' }}>{t('homeEditTitle')}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('done')} onPress={onClose} hitSlop={6}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: tokens.spacing[3], borderRadius: 22, backgroundColor: colors.accent }}>
          <ThemedText style={{ color: colors['on-accent'], fontWeight: '600' }}>{t('done')}</ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: tokens.spacing[3], paddingTop: 0, gap: tokens.spacing[1] }}>
        <ThemedText variant="headline" accessibilityRole="header" style={{ fontWeight: '600' }}>{t('homeEditOn')}</ThemedText>
        {!tiles.order.length && <ThemedText muted variant="caption">{t('homeEditEmpty')}</ThemedText>}
        {tiles.order.map((id, index) => {
          const wide = tiles.wide.includes(id);
          return <View key={id} testID={`edit-on-${id}`} style={row}>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={{ fontWeight: '600' }}>{name(id)}</ThemedText>
              {isSmall(id)
                ? <Pressable accessibilityRole="switch" accessibilityLabel={`${name(id)}, ${t('homeEditWide')}`} accessibilityState={{ checked: wide }}
                  onPress={() => onChange(setWide(tiles, id, !wide))} hitSlop={{ top: 10, bottom: 10 }} style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' }}>
                  <ThemedText variant="caption" style={{ color: colors.accent, fontWeight: '600' }}>{t(wide ? 'homeEditWideOn' : 'homeEditWideOff')}</ThemedText>
                </Pressable>
                : <ThemedText muted variant="caption">{t(ABOUT[id])}</ThemedText>}
            </View>
            <Round glyph="up" label={`${t('homeEditUp')}, ${name(id)}`} disabled={index === 0} onPress={() => onChange(moveTile(tiles, id, -1))} />
            <Round glyph="down" label={`${t('homeEditDown')}, ${name(id)}`} disabled={index === tiles.order.length - 1} onPress={() => onChange(moveTile(tiles, id, 1))} />
            <Round glyph="remove" tone="danger" label={`${t('remove')}, ${name(id)}`} onPress={() => onChange(removeTile(tiles, id))} />
          </View>;
        })}
        <ThemedText variant="headline" accessibilityRole="header" style={{ fontWeight: '600', marginTop: tokens.spacing[3] }}>{t('homeEditAdd')}</ThemedText>
        {!rest.length && <ThemedText muted variant="caption">{t('homeEditAllOn')}</ThemedText>}
        {rest.map(id => <View key={id} testID={`edit-off-${id}`} style={row}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={{ fontWeight: '600' }}>{name(id)}</ThemedText>
            <ThemedText muted variant="caption">{t(ABOUT[id])}</ThemedText>
          </View>
          <Round glyph="add" tone="accent" label={`${t('homeAdd')}, ${name(id)}`} onPress={() => onChange(addTile(tiles, id))} />
        </View>)}
        <ThemedText muted variant="caption" style={{ marginTop: tokens.spacing[2] }}>{t('homeEditNote')}</ThemedText>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
