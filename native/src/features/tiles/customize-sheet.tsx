import { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { tokens, type ThemeColors } from '@/design/tokens';
import { t } from '@/i18n/en';
import { pickStyle, sizesOf } from './model';
import { tileRoutes } from './nav';
import { tileEdit, type TileStorage } from './store';
import { TileIcon } from './tile-icon';
import { TrayCard } from './tray-card';
import { isTilePage } from './tray-sheet';
import type { TilePageId } from './types';
import { EmptyBlock, SheetHeader, fill, sheetBg, sheetCard } from './ui';
import { useTileStore } from './use-tiles';

/**
 * Customize a tile: tap one in edit mode. The tile on the page is the preview (it sits outlined above this half-height
 * sheet); its style, size and options change as they are picked. Remove sends it back to the tray.
 */
export function TileCustomizeSheet({ page, id, storage }: { page: unknown; id: unknown; storage?: TileStorage | null }) {
  const { colors, mode } = useTheme();
  const close = useCallback(() => tileRoutes().close(), []);
  if (!isTilePage(page)) return <NoTile colors={colors} mode={mode} close={close} />;
  return <CustomizeBody page={page} id={typeof id === 'string' ? id : ''} storage={storage} close={close} />;
}

function NoTile({ colors, mode, close }: { colors: ThemeColors; mode: 'light' | 'dark'; close: () => void }) {
  return <View style={[s.root, { backgroundColor: sheetBg(colors, mode) }]}>
    <View style={s.pad}><SheetHeader title={t('tilesCustomizeTitle')} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} /></View>
    <EmptyBlock title={t('tilesNoTileTitle')} body={t('tilesNoTileBody')} colors={colors} />
  </View>;
}

function CustomizeBody({ page, id, storage, close }: { page: TilePageId; id: string; storage?: TileStorage | null; close: () => void }) {
  const { colors, mode, reduceMotion: rm } = useTheme();
  const insets = useSafeAreaInsets();
  const { store, state, cfg } = useTileStore(page, storage);
  const entry = state.tiles.find(e => e.id === id) ?? state.tiles[0];
  const def = entry && cfg.tiles.find(d => d.id === entry.id);
  // Closing the sheet (Done, a swipe down or Remove) takes the outline off the tile.
  useEffect(() => () => { if (tileEdit.get().customizing) tileEdit.customize(page, null); }, [page]);
  if (!entry || !def) return <NoTile colors={colors} mode={mode} close={close} />;
  const home = cfg.variant === 'home';
  const group = cfg.groups?.find(g => g[0] === def.group);
  const tint = (home && group ? colors[group[1]] : colors[def.color]) as string ?? colors.accent;
  const apply = (next: { style?: string; size?: (typeof entry)['size']; options?: Record<string, string> }) =>
    store.customize(entry.id, { style: next.style ?? entry.style, size: next.size ?? entry.size, options: next.options ?? entry.options });
  const remove = () => { const rid = entry.id; close(); setTimeout(() => store.remove(rid), rm ? 0 : 260); };

  return <ScrollView style={{ backgroundColor: sheetBg(colors, mode) }} contentContainerStyle={[s.pad, { paddingBottom: 40 + insets.bottom }]} stickyHeaderIndices={[0]}>
    <SheetHeader title={t('tilesCustomizeTitle')} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} />
    <View style={s.ed}>
      <TrayCard cfg={cfg} def={def} tint={tint} pick={entry} edit colors={colors} mode={mode} rm={rm}
        onStyle={key => apply({ style: key, size: pickStyle(def, entry, key, home) })}
        onSize={z => { if (sizesOf(def, entry.style).includes(z) && z !== entry.size) apply({ size: z }); }}
        onOption={(oid, v) => apply({ options: { ...entry.options, [oid]: v } })} />
      <Pressable accessibilityRole="button" onPress={remove}
        style={({ pressed }) => [s.rm, sheetCard(colors, mode), pressed && { opacity: 0.75 }]}>
        <TileIcon name="x" size={15} color={colors.danger} />
        <Text style={[s.rmText, { color: colors.danger }]}>{fill(t('tilesRemoveFrom'), { page: cfg.label })}</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  ed: { paddingTop: 6 },
  rm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', minHeight: 50, borderRadius: 16 },
  rmText: { fontFamily: tokens.font.bodyStrong, fontSize: 15 },
});
