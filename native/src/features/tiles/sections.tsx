import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector, GestureHandlerRootView, useLongPressGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, measure, runOnJS, runOnUI, scrollTo, useAnimatedRef, useAnimatedStyle, useScrollOffset, useSharedValue, withDelay, withTiming, type AnimatedRef } from 'react-native-reanimated';
import { selectionTick } from '@/components/selection-haptic';
import { useTheme } from '@/design/theme-provider';
import { tokens, type ThemeColors, type ThemeMode } from '@/design/tokens';
import { t } from '@/i18n/en';
import { rgba } from './depth';
import { tileRoutes } from './nav';
import { optLine, rememberSections, sectionOrder, sectionStoreFor, sectionValues, type PageSection, type SectionPrefs, type SectionStore } from './section-store';
import type { TileStorage } from './store';
import { TileIcon } from './tile-icon';
import { fill, liftShadow } from './ui';
import { useTileRepository } from './use-tiles';

/* Page sections on the page: Edit page (or a hold on a section) folds each section into a card to drag, hide with
   minus, bring back with plus, or tap to customize. The saved choices live in section-store.ts. */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const SLOT = 74; // a 66 pt card and its 8 pt gap

export type { PageSection } from './section-store';

export function useSections(page: string, storage?: TileStorage | null) {
  const repo = useTileRepository();
  const store = sectionStoreFor(storage === undefined ? repo : storage, page);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { store, ...state };
}

/* ---------- the page ---------- */
export function PageSections({ page, sections, storage, scrollRef, stickyTop = 58 }: {
  page: string; sections: readonly PageSection[]; storage?: TileStorage | null; scrollRef?: AnimatedRef<Animated.ScrollView>; stickyTop?: number;
}) {
  const { colors, mode, reduceMotion: rm } = useTheme();
  const repo = useTileRepository();
  const { store, prefs, editing } = useSections(page, storage);
  useEffect(() => { rememberSections(page, sections); }, [page, sections]);
  useEffect(() => () => store.setEditing(false), [store]);
  const items = useMemo(() => sectionOrder(prefs, sections), [prefs, sections]);
  const shown = items.filter(x => !prefs.hidden.includes(x.id)), hidden = items.filter(x => prefs.hidden.includes(x.id));
  const offset = useScrollOffset(scrollRef ?? null);
  const rootRef = useAnimatedRef<View>();
  const rootY0 = useSharedValue(Number.NaN);
  const [back, setBack] = useState(0);
  const edit = useCallback((on: boolean) => {
    store.setEditing(on);
    if (!on) { setBack(n => n + 1); return; }
    selectionTick(repo);
    if (scrollRef) requestAnimationFrame(() => runOnUI(() => {
      'worklet';
      const r = measure(rootRef), s = measure(scrollRef); if (!r || !s) return;
      scrollTo(scrollRef, 0, Math.max(0, offset.value + r.pageY - s.pageY - 104), !rm);
    })());
  }, [store, repo, scrollRef, rootRef, offset, rm]);
  const barStyle = useAnimatedStyle(() => (!scrollRef || Number.isNaN(rootY0.value) ? {} : { transform: [{ translateY: Math.max(0, stickyTop - 14 - (rootY0.value - offset.value)) }] }));
  const onLayout = () => { if (scrollRef) runOnUI(() => { 'worklet'; const m = measure(rootRef); if (m) rootY0.value = m.pageY + offset.value; })(); };

  if (!editing) return <View ref={rootRef} collapsable={false} onLayout={onLayout}>
    <GestureHandlerRootView>
      {shown.map((x, i) => <HoldToEdit key={x.id} title={x.title} onHeld={() => edit(true)} index={i} back={rm ? 0 : back}>{x.render(sectionValues(prefs, x))}</HoldToEdit>)}
    </GestureHandlerRootView>
    <View style={s.foot}>
      <Pressable accessibilityRole="button" onPress={() => edit(true)} style={({ pressed }) => [s.footBtn, { backgroundColor: colors.surface }, mode !== 'dark' && { boxShadow: `0 0 0 1px ${colors.hair}` }, pressed && { opacity: 0.75 }]}>
        <TileIcon name="move" size={16} color={colors['text-muted']} />
        <Text style={[s.footText, { color: colors['text-muted'] }]}>{t('tilesEditPage')}</Text>
      </Pressable>
    </View>
  </View>;

  const anyOpts = shown.some(x => x.options?.length);
  return <View ref={rootRef} collapsable={false} onLayout={onLayout}>
    <Animated.View style={[s.barWrap, barStyle]}>
      <View accessibilityRole="toolbar" accessibilityLabel={t('sectionsEditingLabel')} style={[s.bar, { backgroundColor: colors['surface-2'], boxShadow: liftShadow(colors, mode) }]}>
        <Text style={[s.barText, { color: colors.text }]}>{t('sectionsBar')}</Text>
        <Pressable accessibilityRole="button" onPress={() => edit(false)} style={({ pressed }) => [s.ok, { backgroundColor: colors.accent }, pressed && { opacity: 0.75 }]}>
          <Text style={[s.okText, { color: colors['on-accent'] }]}>{t('tilesDone')}</Text>
        </Pressable>
      </View>
    </Animated.View>
    <GestureHandlerRootView>
      <SectionList page={page} list={shown} all={sections} prefs={prefs} store={store} colors={colors} mode={mode} rm={rm} haptic={() => selectionTick(repo)} />
    </GestureHandlerRootView>
    {hidden.length ? <>
      <Text accessibilityRole="header" style={[s.h, { color: colors['text-muted'] }]}>{t('sectionsHidden')}</Text>
      <View accessibilityLabel={t('sectionsHiddenList')} style={s.hidList}>
        {hidden.map((x, i) => <SectionCard key={x.id} x={x} hid line={x.sub ?? ''} colors={colors} mode={mode} rm={rm} index={i}
          onToggle={() => store.setHidden(sections, x.id, false)} />)}
      </View>
    </> : null}
    <Text style={[s.note, { color: colors['text-muted'] }]}>
      {!shown.length ? t('sectionsNoteAllHidden') : !anyOpts ? t('sectionsNoteKeep') : <>{t('sectionsNoteOptionsBefore')} <TileIcon name="sliders" size={13} color={colors['text-muted']} /> {t('sectionsNoteOptionsAfter')}</>}
    </Text>
    <Pressable accessibilityRole="button" onPress={() => store.reset()} style={({ pressed }) => [s.reset, pressed && { opacity: 0.6 }]}>
      <Text style={[s.resetText, { color: colors['text-muted'] }]}>{t('sectionsReset')}</Text>
    </Pressable>
  </View>;
}

/** A section outside edit mode: a hold of 560 ms opens edit mode; it rises back in when edit mode ends. */
function HoldToEdit({ title, onHeld, index, back, children }: { title: string; onHeld: () => void; index: number; back: number; children: ReactNode }) {
  const hold = useLongPressGesture({ minDuration: 560, maxDistance: 8, onActivate: () => { 'worklet'; runOnJS(onHeld)(); } });
  const v = useSharedValue(1);
  useEffect(() => { if (back) { v.value = 0; v.value = withTiming(1, { duration: 400, easing: EASE }); } }, [back, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: 8 * (1 - v.value) }] }));
  void index;
  return <GestureDetector gesture={hold}><Animated.View accessibilityLabel={title} style={style}>{children}</Animated.View></GestureDetector>;
}

function SectionList({ page, list, all, prefs, store, colors, mode, rm, haptic }: {
  page: string; list: PageSection[]; all: readonly PageSection[]; prefs: SectionPrefs; store: SectionStore; colors: ThemeColors; mode: ThemeMode; rm: boolean; haptic: () => void;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const ids = order ?? list.map(x => x.id);
  const orderRef = useRef<string[] | null>(null);
  const start = useCallback((id: string) => { orderRef.current = list.map(x => x.id); setOrder(orderRef.current); setLifted(id); haptic(); }, [list, haptic]);
  const move = useCallback((id: string, y: number) => {
    const cur = orderRef.current; if (!cur) return;
    const at = Math.max(0, Math.min(cur.length - 1, Math.round(y / SLOT))), was = cur.indexOf(id);
    if (at === was) return;
    const next = cur.filter(x => x !== id); next.splice(at, 0, id);
    orderRef.current = next; setOrder(next); haptic();
  }, [haptic]);
  const end = useCallback(() => {
    const cur = orderRef.current; orderRef.current = null; setLifted(null); setOrder(null);
    if (cur) store.setOrder([...cur, ...sectionOrder(prefs, all).map(x => x.id).filter(x => !cur.includes(x))]);
  }, [store, prefs, all]);
  const shift = (id: string, by: -1 | 1) => {
    const cur = list.map(x => x.id), i = cur.indexOf(id), to = i + by; if (to < 0 || to >= cur.length) return;
    cur.splice(i, 1); cur.splice(to, 0, id); store.setOrder([...cur, ...prefs.hidden]);
  };
  return <View accessibilityLabel={t('sectionsListLabel')} style={{ height: Math.max(0, ids.length * SLOT - 8) }}>
    {list.map(x => {
      const i = ids.indexOf(x.id), opts = !!x.options?.length;
      return <DraggableCard key={x.id} y={i * SLOT} lifted={lifted === x.id} rm={rm} onStart={() => start(x.id)} onMove={dy => move(x.id, dy)} onEnd={end}>
        <SectionCard x={x} line={opts ? optLine(prefs, x) : x.sub ?? ''} opts={opts} lifted={lifted === x.id} colors={colors} mode={mode} rm={rm} index={i}
          onToggle={() => store.setHidden(all, x.id, true)} onPress={opts ? () => tileRoutes().section(page, x.id) : undefined}
          onMove={by => shift(x.id, by)} />
      </DraggableCard>;
    })}
  </View>;
}

function DraggableCard({ y, lifted, rm, onStart, onMove, onEnd, children }: { y: number; lifted: boolean; rm: boolean; onStart: () => void; onMove: (y: number) => void; onEnd: () => void; children: ReactNode }) {
  const pos = useSharedValue(y), base = useSharedValue(0), ty = useSharedValue(0), active = useSharedValue(false), lift = useSharedValue(0);
  useEffect(() => { if (!active.value) pos.value = rm ? y : withTiming(y, { duration: 300, easing: EASE }); }, [y, rm, pos, active]);
  useEffect(() => { lift.value = rm ? (lifted ? 1 : 0) : withTiming(lifted ? 1 : 0, { duration: 200 }); }, [lifted, rm, lift]);
  const pan = usePanGesture({
    minDistance: 5,
    onActivate: () => { 'worklet'; active.set(true); base.set(pos.value); ty.set(0); runOnJS(onStart)(); },
    onUpdate: e => { 'worklet'; ty.value = e.translationY; runOnJS(onMove)(base.value + e.translationY); },
    onFinalize: () => { 'worklet'; if (!active.value) return; pos.set(base.value + ty.value); ty.set(0); active.set(false); runOnJS(onEnd)(); },
  });
  const style = useAnimatedStyle(() => ({
    zIndex: active.value ? 5 : 1,
    transform: [{ translateY: active.value ? base.value + ty.value : pos.value }, { scale: 1 + 0.02 * lift.value }],
  }));
  return <GestureDetector gesture={pan}><Animated.View style={[s.slot, style]}>{children}</Animated.View></GestureDetector>;
}

function SectionCard({ x, hid, line, opts, lifted, colors, mode, rm, index, onToggle, onPress, onMove }: {
  x: PageSection; hid?: boolean; line: string; opts?: boolean; lifted?: boolean; colors: ThemeColors; mode: ThemeMode; rm: boolean; index: number;
  onToggle: () => void; onPress?: () => void; onMove?: (by: -1 | 1) => void;
}) {
  const c = (x.color ? colors[x.color] : colors.accent) as string;
  const v = useSharedValue(rm ? 1 : 0);
  useEffect(() => { if (!rm) v.value = withDelay(Math.min(5, index) * 30, withTiming(1, { duration: 420, easing: EASE })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const inStyle = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: 10 * (1 - v.value) }, { scale: 0.98 + 0.02 * v.value }] }));
  const label = hid ? fill(t('sectionsCardHidden'), { title: x.title }) : opts ? fill(t('sectionsCardCustomize'), { title: x.title, line }) : x.title;
  const actions = hid ? [] : [{ name: 'earlier', label: t('tilesMoveEarlier') }, { name: 'later', label: t('tilesMoveLater') }];
  const onAction = (e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'earlier') onMove?.(-1); if (e.nativeEvent.actionName === 'later') onMove?.(1); };
  return <Animated.View style={inStyle}>
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} accessibilityActions={actions} onAccessibilityAction={onAction} onPress={onPress} disabled={!onPress}
      style={[s.card, hid ? { backgroundColor: 'transparent', boxShadow: `inset 0 0 0 1px ${colors['hair-2']}` }
        : lifted ? { backgroundColor: colors['surface-2'], boxShadow: mode === 'dark' ? '0 22px 40px -14px rgba(0,0,0,0.55), 0 8px 16px -8px rgba(0,0,0,0.35)' : `0 22px 40px -14px ${rgba(colors.text, 0.3)}, 0 8px 16px -8px ${rgba(colors.text, 0.2)}` }
        : { backgroundColor: colors.surface, boxShadow: mode === 'dark' ? undefined : `0 0 0 1px ${colors.hair}` }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={fill(t(hid ? 'sectionsShow' : 'sectionsHide'), { title: x.title })} hitSlop={8} onPress={onToggle}
        style={[s.b, { backgroundColor: rgba(hid ? colors.success : colors.danger, hid ? 0.18 : 0.16) }]}>
        <TileIcon name={hid ? 'plus' : 'minus'} size={15} color={hid ? colors.success : colors.danger} />
      </Pressable>
      <View style={[s.ic, { backgroundColor: rgba(c, 0.15) }, hid && s.dim]}><TileIcon name={x.icon} size={18} color={c} /></View>
      <View style={[s.tx, hid && s.dim]}>
        <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{x.title}</Text>
        {line ? <Text numberOfLines={1} style={[s.sub, { color: colors['text-muted'] }]}>{line}</Text> : null}
      </View>
      {opts && !hid ? <View style={s.side}><TileIcon name="sliders" size={17} color={colors['text-muted']} /></View> : null}
      {!hid ? <View style={[s.side, { opacity: 0.7 }]}><TileIcon name="reorder" size={17} color={colors['text-muted']} /></View> : null}
    </Pressable>
  </Animated.View>;
}

const s = StyleSheet.create({
  foot: { flexDirection: 'row', justifyContent: 'center', marginTop: 22, marginBottom: 4 },
  footBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 15, borderRadius: 999 },
  footText: { fontFamily: tokens.font.bodyStrong, fontSize: 13.5 },
  barWrap: { zIndex: 6, marginTop: 14, marginBottom: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 6, borderRadius: 999 },
  barText: { flex: 1, minWidth: 0, fontFamily: tokens.font.bodyStrong, fontSize: 14 },
  ok: { minHeight: 36, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  okText: { fontFamily: tokens.font.heading, fontSize: 14 },
  slot: { position: 'absolute', left: 0, right: 0, top: 0 },
  hidList: { gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 66, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, borderRadius: 20 },
  b: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ic: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tx: { flex: 1, minWidth: 0, gap: 2 },
  dim: { opacity: 0.55 },
  title: { fontFamily: tokens.font.heading, fontSize: 16, lineHeight: 19.2, letterSpacing: -0.16 },
  sub: { fontFamily: tokens.font.body, fontSize: 13, lineHeight: 16.9 },
  side: { width: 28, alignItems: 'center', justifyContent: 'center' },
  h: { marginTop: 22, marginHorizontal: 4, marginBottom: 8, fontFamily: tokens.font.bodyStrong, fontSize: 13, lineHeight: 13 },
  note: { marginTop: 16, marginHorizontal: 6, fontFamily: tokens.font.body, fontSize: 13, lineHeight: 18.9, textAlign: 'center' },
  reset: { alignSelf: 'center', marginTop: 14, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  resetText: { fontFamily: tokens.font.bodyStrong, fontSize: 13.5 },
});
