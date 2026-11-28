import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { tokens, type ThemeColors } from '@/design/tokens';
import { t } from '@/i18n/en';
import { font } from '@/components/kit-style';
import { Editor } from './editor/editor-sheet';
import { extrasOf } from './look';
import { optionValues, trayDefs, trayGroups, trayStart } from './model';
import { tileRoutes } from './nav';
import { isTilePage } from './registry';
import type { TileStorage } from './store';
import { cardTint, TrayCard, type TrayPick } from './tray-card';
import type { TileDef, TilePageId } from './types';
import { EmptyBlock, SecHead, SheetHeader, fill, sheetBg } from './ui';
import { useTileStore } from './use-tiles';

export { isTilePage } from './registry';
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** A card that lifts out of the tray when its tile is added (Reduce Motion: it only fades). */
function TakeOut({ taking, rm, children }: { taking: boolean; rm: boolean; children: ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => { if (taking) v.value = withTiming(1, { duration: rm ? 150 : 260, easing: rm ? Easing.linear : EASE }); }, [taking, rm, v]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - v.value, transform: rm ? [] : [{ translateY: -14 * v.value }, { scale: 1 - 0.04 * v.value }] }));
  return <Animated.View style={style} pointerEvents={taking ? 'none' : 'auto'}>{children}</Animated.View>;
}

/** The tile's preview slides in from the side as it opens, and the tiles slide back the other way (Reduce Motion: a fade). */
function SlideIn({ from, rm, children }: { from: 1 | -1; rm: boolean; children: ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withTiming(1, { duration: rm ? 200 : 320, easing: rm ? Easing.linear : EASE }); }, [rm, v]);
  const style = useAnimatedStyle(() => ({ flex: 1, opacity: rm ? v.value : 0.4 + 0.6 * v.value, transform: rm ? [] : [{ translateX: 28 * from * (1 - v.value) }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Add a tile, for one page, as a form sheet: every tile not on the page yet, grouped, each drawn live as it will look.
 * Add puts one on the page as it is; tapping one opens the same preview as Edit tile, where its style, size, what it shows,
 * its units and its colour change in place, and a button at the bottom adds it as shown. Home has filter chips and a
 * footnote; the other pages end with Reset.
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
  const [open, setOpen] = useState<string | null>(null);
  const [back, setBack] = useState(false);
  // Where the tiles were scrolled to, so going back from a preview lands on the same card.
  const top = useRef(0);
  const [backTo, setBackTo] = useState(0);
  const groups = useMemo(() => trayGroups(cfg, defs), [cfg, defs]);
  const pickOf = (d: TileDef): TrayPick => picks[d.id] ?? trayStart(cfg, state.tiles, d);
  const left = defs.length - (taking ? 1 : 0);

  const take = (d: TileDef, lift: boolean) => {
    if (taking) return;
    // The tile's own units and colour go with it, as Edit tile keeps them.
    const pk = pickOf(d), opts = { ...optionValues(d, pk.style, pk.options), ...extrasOf(pk.options) };
    setTaking(d.id);
    const add = () => { close(); setTimeout(() => store.add(d.id, pk.size, pk.style, opts), rm ? 0 : 280); };
    if (lift) setTimeout(add, rm ? 150 : 260); else add();
  };
  const reset = () => { close(); setTimeout(() => store.reset(true), rm ? 0 : 280); };

  const openDef = open ? defs.find(d => d.id === open) : undefined;
  if (openDef) return <View style={[s.root, { backgroundColor: sheetBg(colors, mode) }]}>
    <SlideIn from={1} rm={rm}>
      <Editor page={page} id={openDef.id} storage={storage} close={close} add={{
        def: openDef, pick: pickOf(openDef),
        onPick: p => setPicks(x => ({ ...x, [openDef.id]: p })),
        onBack: () => { setBackTo(top.current); setBack(true); setOpen(null); },
        onAdd: () => take(openDef, false),
      }} />
    </SlideIn>
  </View>;

  const intro = home
    ? (left ? fill(t(left === 1 ? 'tilesTrayHomeIntroOne' : 'tilesTrayHomeIntro'), { n: left }) : '')
    : (left ? (left === cfg.tiles.length ? '' : fill(t('tilesTrayIntroCount'), { n: left, all: cfg.tiles.length, page: cfg.label })) + t('tilesTrayIntroDefault') : '');
  const count = (n: number) => fill(t(n === 1 ? 'tilesTrayCountOne' : 'tilesTrayCountOther'), { n });
  const shownGroups = home && filter !== 'all' ? groups.filter(g => g.name === filter) : groups;
  const card = (d: TileDef, own: string) => {
    const pk = pickOf(d);
    return <TakeOut key={d.id} taking={taking === d.id} rm={rm}>
      <TrayCard cfg={cfg} def={d} tint={cardTint(colors, pk, own)} pick={pk} colors={colors} mode={mode} rm={rm}
        onOpen={() => { if (!taking) { setBack(false); setOpen(d.id); } }} onAdd={() => take(d, true)} />
    </TakeOut>;
  };

  const list = <ScrollView style={{ backgroundColor: sheetBg(colors, mode) }} contentContainerStyle={[s.pad, { paddingBottom: 40 + bottom }]} stickyHeaderIndices={[0]}
    contentOffset={{ x: 0, y: backTo }} scrollEventThrottle={32} onScroll={e => { top.current = e.nativeEvent.contentOffset.y; }}>
    <SheetHeader title={home ? t('tilesTrayHomeTitle') : t('tilesTrayTitle')} left={t('tilesDone')} onLeft={close} colors={colors} mode={mode} />
    <View>
      {intro ? <Text style={[s.intro, { color: colors['text-muted'] }]}>{intro}</Text> : null}
      {home && groups.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsWrap} contentContainerStyle={s.chips}
        accessibilityRole="radiogroup" accessibilityLabel={t('tilesTrayShow')}>
        {[{ name: 'all', title: t('tilesTrayAll'), color: colors.accent }, ...groups.map(g => ({ name: g.name, title: g.title, color: colors[g.color as keyof ThemeColors] as string }))].map(c =>
          <Chip key={c.name} label={c.title} on={filter === c.name} color={c.color} colors={colors} dark={mode === 'dark'} onPress={() => setFilter(c.name)} />)}
      </ScrollView> : null}
      {!defs.length
        ? <EmptyBlock icon="check" color={colors.accent} colors={colors} style={s.none} title={fill(t('tilesTrayEmptyTitle'), { page: cfg.label })}
          body={t(home ? 'tilesTrayHomeEmptyBody' : 'tilesTrayEmptyBody')} />
        : shownGroups.map((g, gi) => <View key={g.name || 'all'}>
          {g.title ? <SecHead title={g.title} aside={count(g.defs.length)} first={gi === 0} colors={colors} /> : <View style={{ height: 12 }} />}
          {g.defs.map(d => card(d, home ? colors[g.color as keyof ThemeColors] as string : (colors[d.color] as string) ?? colors.accent))}
        </View>)}
      {home
        ? <Text style={[s.foot, { color: colors['text-muted'] }]}>{t('tilesTrayFoot')}</Text>
        : <>
          {cfg.intro && defs.length ? <Text style={[s.foot, { color: colors['text-muted'] }]}>{cfg.intro}</Text> : null}
          <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [s.reset, pressed && { opacity: 0.6 }]}>
            <Text style={[s.resetText, { color: colors['text-muted'] }]}>{fill(t('tilesTrayReset'), { page: cfg.label })}</Text>
          </Pressable>
        </>}
    </View>
  </ScrollView>;
  return back ? <SlideIn from={-1} rm={rm}>{list}</SlideIn> : list;
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
  intro: { marginHorizontal: 4, marginBottom: 6, fontFamily: tokens.font.body, fontSize: 14, lineHeight: 20.3 },
  chipsWrap: { marginHorizontal: -16, marginTop: 8, marginBottom: 6, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: tokens.font.bodyStrong, fontSize: 13.5 },
  none: { marginTop: 24, marginBottom: 8, paddingVertical: 36, paddingHorizontal: 24 },
  foot: { marginTop: 8, marginHorizontal: 16, ...font(500, 12.5, 1.45) },
  reset: { alignSelf: 'center', marginTop: 16, marginBottom: 4, minHeight: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  resetText: { fontFamily: tokens.font.bodyStrong, fontSize: 14 },
});
