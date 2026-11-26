import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { tokens, type ThemeColors } from '@/design/tokens';
import { t } from '@/i18n/en';
import { font } from '@/components/kit-style';
import { optionValues, pickStyle, sizesOf, trayDefs, trayGroups, trayStart } from './model';
import { tileRoutes } from './nav';
import { tilePageIds } from './registry';
import type { TileStorage } from './store';
import { TrayAddButton, TrayCard, type TrayPick } from './tray-card';
import type { TileDef, TilePageId, TileSize } from './types';
import { EmptyBlock, SecHead, SheetHeader, fill, sheetBg } from './ui';
import { useTileStore } from './use-tiles';

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const SIZE_WORD: Record<TileSize, string> = { S: t('tilesSizeS'), M: t('tilesSizeM'), L: t('tilesSizeL') };
export const isTilePage = (p: unknown): p is TilePageId => typeof p === 'string' && (tilePageIds() as string[]).includes(p);

/** A card that lifts out of the tray when its tile is added (Reduce Motion: it only fades). */
function TakeOut({ taking, rm, children }: { taking: boolean; rm: boolean; children: ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => { if (taking) v.value = withTiming(1, { duration: rm ? 150 : 260, easing: rm ? Easing.linear : EASE }); }, [taking, rm, v]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - v.value, transform: rm ? [] : [{ translateY: -16 * v.value }, { scale: 1 - 0.06 * v.value }] }));
  return <Animated.View style={style} pointerEvents={taking ? 'none' : 'auto'}>{children}</Animated.View>;
}

/**
 * The tile tray for one page, as a form sheet: every tile not on the page yet, grouped, each with a live preview, its
 * styles, options and sizes, and Add. Home's tray has its own copy, filter chips and a footnote; page trays end with Reset.
 */
export function TileTraySheet({ page, storage }: { page: unknown; storage?: TileStorage | null }) {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const close = useCallback(() => tileRoutes().close(), []);
  const bg = sheetBg(colors, mode);
  if (!isTilePage(page)) return <View style={[s.root, { backgroundColor: bg }]}>
    <View style={s.pad}><SheetHeader title={t('tilesTrayHomeTitle')} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} /></View>
    <EmptyBlock title={t('tilesNoTrayTitle')} body={t('tilesNoTrayBody')} colors={colors} />
  </View>;
  return <TrayBody page={page} storage={storage} close={close} bottom={insets.bottom} />;
}

function TrayBody({ page, storage, close, bottom }: { page: TilePageId; storage?: TileStorage | null; close: () => void; bottom: number }) {
  const { colors, mode, reduceMotion: rm } = useTheme();
  const { store, state, cfg } = useTileStore(page, storage);
  const home = cfg.variant === 'home';
  // The tray's list is taken when the sheet opens, so a card taken out keeps its place while it lifts away.
  const [defs] = useState<TileDef[]>(() => trayDefs(cfg, state.tiles));
  const [picks, setPicks] = useState<Record<string, TrayPick>>({});
  const [taking, setTaking] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const groups = useMemo(() => trayGroups(cfg, defs), [cfg, defs]);
  const pickOf = (d: TileDef): TrayPick => picks[d.id] ?? trayStart(cfg, state.tiles, d);
  const setPick = (d: TileDef, next: Partial<TrayPick>) => setPicks(p => ({ ...p, [d.id]: { ...pickOf(d), ...next } }));
  const left = defs.length - (taking ? 1 : 0), all = cfg.tiles.length;

  const take = (d: TileDef) => {
    if (taking) return;
    const pk = pickOf(d), opts = optionValues(d, pk.style, pk.options);
    setTaking(d.id);
    setTimeout(() => { close(); setTimeout(() => store.add(d.id, pk.size, pk.style, opts), rm ? 0 : 280); }, rm ? 150 : home ? 300 : 240);
  };
  const reset = () => { close(); setTimeout(() => store.reset(true), rm ? 0 : 280); };

  const intro = home
    ? (left ? fill(t(left === 1 ? 'tilesTrayHomeIntroOne' : 'tilesTrayHomeIntro'), { n: left }) : '')
    : (left ? (left === all ? '' : fill(t('tilesTrayIntroCount'), { n: left, all, page: cfg.label })) + (cfg.intro ?? t('tilesTrayIntroDefault')) : '');
  const card = (d: TileDef, tint: string) => {
    const pk = pickOf(d);
    return <TakeOut key={d.id} taking={taking === d.id} rm={rm}>
      <TrayCard cfg={cfg} def={d} tint={tint} pick={pk} preview colors={colors} mode={mode} rm={rm}
        onStyle={key => setPick(d, { style: key, size: pickStyle(d, pk, key, home) })}
        onSize={z => { if (sizesOf(d, pk.style).includes(z)) setPick(d, { size: z }); }}
        onOption={(id, v) => setPick(d, { options: { ...pk.options, [id]: v } })}
        action={<TrayAddButton colors={colors} onPress={() => take(d)}
          label={fill(t(home ? 'tilesTrayAddHomeLabel' : 'tilesTrayAddLabel'), { title: d.title, size: SIZE_WORD[pk.size] })} />} />
    </TakeOut>;
  };
  const count = (n: number) => fill(t(n === 1 ? 'tilesTrayCountOne' : 'tilesTrayCountOther'), { n });
  const shownGroups = home && filter !== 'all' ? groups.filter(g => g.name === filter) : groups;

  return <ScrollView style={{ backgroundColor: sheetBg(colors, mode) }} contentContainerStyle={[s.pad, { paddingBottom: 40 + bottom }]} stickyHeaderIndices={[0]}>
    <SheetHeader title={home ? t('tilesTrayHomeTitle') : fill(t('tilesTrayTitle'), { page: cfg.label })} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} />
    <View>
      {intro ? <Text style={[s.intro, { color: colors['text-muted'] }, !home && { marginBottom: 16 }]}>{intro}</Text> : null}
      {home && defs.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsWrap} contentContainerStyle={s.chips}
        accessibilityRole="radiogroup" accessibilityLabel={t('tilesTrayShow')}>
        {[{ name: 'all', title: t('tilesTrayAll'), color: colors.accent }, ...groups.map(g => ({ name: g.name, title: g.title, color: colors[g.color as keyof ThemeColors] as string }))].map(c =>
          <Chip key={c.name} label={c.title} on={filter === c.name} color={c.color} colors={colors} dark={mode === 'dark'} onPress={() => setFilter(c.name)} />)}
      </ScrollView> : null}
      {!defs.length
        ? (home
          ? <EmptyBlock icon="check" color={colors.accent} colors={colors} style={s.homeNone} title={fill(t('tilesTrayEmptyTitle'), { page: cfg.label })} body={t('tilesTrayHomeEmptyBody')} />
          : <View accessible style={[s.empty, { backgroundColor: colors.surface }]}>
            <Text style={[s.emptyT, { color: colors.text }]}>{fill(t('tilesTrayEmptyTitle'), { page: cfg.label })}</Text>
            <Text style={[s.emptyP, { color: colors['text-muted'] }]}>{t('tilesTrayEmptyBody')}</Text>
          </View>)
        : shownGroups.map((g, gi) => <View key={g.name || 'all'}>
          {g.title ? <SecHead title={g.title} aside={g.name === 'More' ? undefined : count(g.defs.length)} first={home || gi === 0} colors={colors} /> : null}
          {g.defs.map(d => card(d, home ? colors[g.color as keyof ThemeColors] as string : (colors[d.color] as string) ?? colors.accent))}
        </View>)}
      {home
        ? <Text style={[s.foot, { color: colors['text-muted'] }]}>{t('tilesTrayFoot')}</Text>
        : <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [s.reset, pressed && { opacity: 0.6 }]}>
          <Text style={[s.resetText, { color: colors['text-muted'] }]}>{fill(t('tilesTrayReset'), { page: cfg.label })}</Text>
        </Pressable>}
    </View>
  </ScrollView>;
}

function Chip({ label, on, color, colors, dark, onPress }: { label: string; on: boolean; color: string; colors: ThemeColors; dark: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
    style={({ pressed }) => [s.chip, on ? { backgroundColor: color } : dark ? { backgroundColor: colors['surface-2'] } : { backgroundColor: colors.surface, boxShadow: `0 0 0 1px ${colors.hair}` }, pressed && { opacity: 0.75 }]}>
    <Text style={[s.chipText, { color: on ? colors['on-accent'] : colors.text }]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  intro: { marginHorizontal: 4, marginBottom: 4, fontFamily: tokens.font.body, fontSize: 14, lineHeight: 20.3 },
  chipsWrap: { marginHorizontal: -16, marginTop: 9, marginBottom: 6, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: tokens.font.bodyStrong, fontSize: 13.5 },
  homeNone: { marginTop: 28, marginBottom: 8, paddingVertical: 36, paddingHorizontal: 24 },
  empty: { marginTop: 18, marginHorizontal: 4, marginBottom: 6, paddingVertical: 22, paddingHorizontal: 18, borderRadius: 18, alignItems: 'center' },
  emptyT: { fontFamily: tokens.font.bodyStrong, fontSize: 16, lineHeight: 20.8, textAlign: 'center' },
  emptyP: { marginTop: 6, fontFamily: tokens.font.body, fontSize: 14, lineHeight: 20.3, textAlign: 'center' },
  foot: { marginTop: 8, marginHorizontal: 16, ...font(500, 12.5, 1.45) },
  reset: { alignSelf: 'center', marginTop: 16, marginBottom: 4, minHeight: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  resetText: { fontFamily: tokens.font.bodyStrong, fontSize: 14 },
});
