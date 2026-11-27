import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, interpolate, measure, runOnJS, runOnUI, scrollTo, useAnimatedRef, useAnimatedStyle,
  useFrameCallback, useScrollOffset, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type AnimatedRef,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { selectionTick } from '@/components/selection-haptic';
import { useTheme } from '@/design/theme-provider';
import { tokens, type ThemeColors, type ThemeMode } from '@/design/tokens';
import { t } from '@/i18n/en';
import { liftShadows, rgba } from './depth';
import { FRAMES, GRID_W, bestOrder, fitGrid, layoutTiles, outlineFor, readingOrder, resizeTarget } from './geometry';
import { nextSize, optionValues, sizesOf } from './model';
import { tileRoutes } from './nav';
import { tileEdit, type TileStorage } from './store';
import { TileFrame } from './tile-frame';
import { TileIcon } from './tile-icon';
import type { LayoutEntry, TileDef, TilePageConfig, TilePageId, TilePos, TileSize } from './types';
import { EmptyBlock, fill, liftShadow } from './ui';
import { useTileEdit, useTileRepository, useTileStore } from './use-tiles';
import { Tappable } from '@/components/tappable';
import { PressScale } from '@/components/press-scale';

/* Motion from the design: reflow glides with a slight overshoot, other moves ease out. */
const SPRING = Easing.bezier(0.3, 1.28, 0.5, 1);
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const ARC = 'M40.6 22 A23 23 0 0 1 22 40.6';
const REFLOW_MS = 480, LIFT_MS = 240, REMOVE_MS = 240, OUTLINE_MS = 340;
/** A page's first visit: its tiles fade and rise 10 pt one after another, 360 ms each and 60 ms apart (grid.js). Home's wait
 * for its hero to build first, so they start at 520 ms; other pages start at 120 ms. */
export const TILE_ENTRANCE = { ms: 360, step: 60, rise: 10, start: 120, homeStart: 520 } as const;
export const entranceDelay = (index: number, home: boolean) => (home ? TILE_ENTRANCE.homeStart : TILE_ENTRANCE.start) + index * TILE_ENTRANCE.step;
const SIZE_WORD: Record<TileSize, string> = { S: t('tilesSizeS'), M: t('tilesSizeM'), L: t('tilesSizeL') };
/** Pages whose tiles already rose in once this session (the entrance plays on a page's first visit only). */
const entered = new Set<TilePageId>();

export interface TileGridProps {
  page: TilePageId;
  /** Where layouts are saved; defaults to the signed-in owner's repository. */
  storage?: TileStorage | null;
  /** The page's Animated.ScrollView (useAnimatedRef): edit mode scrolls it, a drag near an edge autoscrolls it, and the Done bar sticks under its top. */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  /** Where the Done bar sticks, from the top of the screen. Default: the safe area plus 4 pt. */
  stickyTop?: number;
}

/** A page made of tiles: the grid, its edit mode (Done bar, wiggle, remove, resize, drag to reorder), the empty state and the Edit page / Add a tile buttons. */
export function TileGrid({ page, storage, scrollRef, stickyTop }: TileGridProps) {
  const { colors, mode, reduceMotion: rm } = useTheme();
  const repo = useTileRepository();
  const haptic = useCallback(() => selectionTick(repo), [repo]);
  const { store, state, cfg } = useTileStore(page, storage);
  const { editing, customizing } = useTileEdit(page);
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const stick = stickyTop ?? insets.top + 4;

  const [width, setWidth] = useState(GRID_W);
  const { k, left } = fitGrid(width);
  const [live, setLive] = useState<LayoutEntry[] | null>(null);
  const [leaving, setLeaving] = useState<readonly string[]>([]);
  const [lifted, setLifted] = useState<string | null>(null);
  const [settle, setSettle] = useState(0);
  const [outline, setOutline] = useState<{ id: string; pos: TilePos; size: TileSize } | null>(null);
  const [animateIn] = useState(() => !entered.has(page) && !rm);
  useEffect(() => { entered.add(page); }, [page]);

  const defs = useMemo(() => { const m = new Map<string, TileDef>(); for (const d of cfg.tiles) m.set(d.id, d); return m; }, [cfg]);
  const base = live ?? state.tiles;
  const shown = useMemo(() => base.filter(e => !leaving.includes(e.id) && defs.has(e.id)), [base, leaving, defs]);
  const L = useMemo(() => layoutTiles(shown), [shown]);
  // Where each tile last stood, so a tile on its way out fades where it was.
  const [known, setKnown] = useState(() => ({ L, pos: L.pos }));
  if (known.L !== L) setKnown({ L, pos: { ...known.pos, ...L.pos } });
  const drawn = useMemo(() => [...shown, ...base.filter(e => leaving.includes(e.id))], [shown, base, leaving]);

  // Leaving the page (or another page entering edit mode) ends this one's edit mode; so does unmounting.
  useEffect(() => () => tileEdit.set(page, false), [page]);

  /* ---------- scroll: autoscroll while dragging, the sticky Done bar, scrolling a tile into place ---------- */
  const offset = useScrollOffset(scrollRef ?? null);
  const rootRef = useAnimatedRef<View>();
  const gridRef = useAnimatedRef<Animated.View>();
  const rootY0 = useSharedValue(Number.NaN);
  const measureRoot = useCallback(() => {
    if (!scrollRef) return;
    runOnUI(() => { 'worklet'; const m = measure(rootRef); if (m) rootY0.value = m.pageY + offset.value; })();
  }, [scrollRef, rootRef, rootY0, offset]);
  /** Scrolls so a point of the grid (grid points) lands `top` pt below the scroll view's top edge. */
  const scrollGridTo = useCallback((gridY: number, top: number) => {
    if (!scrollRef) return;
    const animated = !rm, kk = k;
    runOnUI(() => {
      'worklet';
      const g = measure(gridRef), s = measure(scrollRef);
      if (!g || !s) return;
      const d = g.pageY + gridY * kk - s.pageY - top;
      if (Math.abs(d) > 4) scrollTo(scrollRef, 0, Math.max(0, offset.value + d), animated);
    })();
  }, [scrollRef, gridRef, offset, k, rm]);

  /* ---------- drag ---------- */
  const dragId = useSharedValue('');
  const dragBase = useSharedValue({ x: 0, y: 0, w: 0, h: 0, off: 0 });
  const dragT = useSharedValue({ x: 0, y: 0, absY: 0 });
  const kv = useSharedValue(k);
  useEffect(() => { kv.value = k; }, [k, kv]);
  const liveRef = useRef<LayoutEntry[] | null>(null);
  const onDragMove = useCallback((id: string, cx: number, cy: number) => {
    const list = liveRef.current ?? store.getState().tiles;
    const o = bestOrder(list, id, cx, cy);
    if (o) { liveRef.current = o; setLive(o); haptic(); }
  }, [store, haptic]);
  const lastSent = useSharedValue({ x: -1e6, y: -1e6 });
  const autoscroll = useFrameCallback(() => {
    'worklet';
    if (!dragId.value) return;
    const y = dragT.value.absY, H = win.height;
    let v = 0;
    if (y > H - 150) v = Math.min(14, (y - (H - 150)) / 7);
    else if (y < 130) v = -Math.min(14, (130 - y) / 7);
    if (v && scrollRef) scrollTo(scrollRef, 0, Math.max(0, offset.value + v), false);
    const b = dragBase.value, kk = kv.value || 1;
    const cx = b.x + dragT.value.x / kk + b.w / 2, cy = b.y + (dragT.value.y + offset.value - b.off) / kk + b.h / 2;
    if (Math.abs(cx - lastSent.value.x) + Math.abs(cy - lastSent.value.y) > 1.5) { lastSent.value = { x: cx, y: cy }; runOnJS(onDragMove)(dragId.value, cx, cy); }
  }, false);
  const onLift = useCallback((id: string) => { liveRef.current = store.getState().tiles; setLifted(id); autoscroll.setActive(true); haptic(); }, [store, haptic, autoscroll]);
  const onDragEnd = useCallback(() => {
    const list = liveRef.current; liveRef.current = null;
    autoscroll.setActive(false);
    setLifted(null); setSettle(n => n + 1); setLive(null);
    if (list) {
      const next = readingOrder(list), was = store.getState().tiles;
      if (next.some((e, i) => was[i]?.id !== e.id)) store.setOrder(next);
    }
  }, [store, autoscroll]);
  const drag = useMemo(() => ({ id: dragId, base: dragBase, t: dragT, off: offset, k: kv, lastSent }), [dragId, dragBase, dragT, offset, kv, lastSent]);

  /* ---------- actions ---------- */
  const enterEdit = useCallback((scroll: boolean) => {
    if (tileEdit.get().page === page) return;
    tileEdit.set(page, true);
    // Bring the first tile to just under the sticky Done bar (48 pt tall).
    if (scroll && scrollRef) requestAnimationFrame(() => requestAnimationFrame(() => scrollGridTo(0, stick + 48 + 22)));
  }, [page, scrollRef, scrollGridTo, stick]);
  const onHeld = useCallback(() => { haptic(); enterEdit(false); }, [haptic, enterEdit]);
  const remove = useCallback((id: string) => {
    haptic();
    if (rm) { store.remove(id); return; }
    setLeaving(l => [...l, id]);
    setTimeout(() => { store.remove(id); setLeaving(l => l.filter(x => x !== id)); }, REMOVE_MS);
  }, [store, rm, haptic]);
  const customize = useCallback((id: string) => {
    tileEdit.customize(page, id);
    // The tile is the preview (grid.js customize): it rises to 70 pt under the top, above the sheet, and shows each change
    // as it is made. The room below the grid that lets a low tile rise only exists from the next frame, so the scroll waits
    // for it; scrolling at once stopped short and left a low tile under the sheet.
    const p = L.pos[id]; if (p) requestAnimationFrame(() => requestAnimationFrame(() => scrollGridTo(p.y, 70)));
    tileRoutes().customize(page, id);
  }, [page, L, scrollGridTo]);
  const open = useCallback((id: string) => {
    const def = defs.get(id), e = store.getState().tiles.find(s => s.id === id);
    // A covered tile (Hide numbers) shows its figures on the first tap; the next one opens it.
    if (def?.cover?.covered()) { def.cover.reveal(); return; }
    if (def?.open && e) def.open(optionValues(def, e.style, e.options));
  }, [defs, store]);
  const resizeMove = useCallback((id: string, dx: number, dy: number) => {
    const e = store.getState().tiles.find(s => s.id === id), def = defs.get(id), p = L.pos[id];
    if (!e || !def || !p) return;
    const target = resizeTarget(sizesOf(def, e.style), e.size, p.x > 0, dx, dy);
    setOutline(o => { if (o?.id === id && o.size === target) return o; if (o) haptic(); return { id, size: target, pos: outlineFor(p, target) }; });
  }, [store, defs, L, haptic]);
  const resizeEnd = useCallback((id: string, cancel: boolean) => {
    setOutline(o => {
      const e = store.getState().tiles.find(s => s.id === id);
      if (o && !cancel && e && o.size !== e.size) setTimeout(() => store.setSize(id, o.size), 0);
      return null;
    });
  }, [store]);
  const cycle = useCallback((id: string) => {
    const e = store.getState().tiles.find(s => s.id === id); if (!e) return;
    const n = nextSize(cfg, e); if (n !== e.size) { haptic(); store.setSize(id, n); }
  }, [store, cfg, haptic]);
  // A tile resized in its sheet moves in the reading order, so it rises back to the top above the sheet (edApply).
  useEffect(() => {
    const id = state.flash.resized; if (!id || customizing !== id) return;
    const p = layoutTiles(state.tiles).pos[id]; if (!p) return;
    const h = setTimeout(() => scrollGridTo(p.y, 70), 60);
    return () => clearTimeout(h);
  }, [state.flash.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  // A resized tile that now runs past the bottom of the screen scrolls into view.
  useEffect(() => {
    const id = state.flash.resized; if (!id || customizing) return;
    const p = layoutTiles(state.tiles).pos[id]; if (!p) return;
    const h = setTimeout(() => scrollGridTo(p.y + p.h, win.height - 130), 120);
    return () => clearTimeout(h);
  }, [state.flash.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  // A tile just added from the tray scrolls up into view.
  useEffect(() => {
    const id = state.flash.fresh; if (!id) return;
    const p = layoutTiles(state.tiles).pos[id]; if (!p) return;
    const h = setTimeout(() => scrollGridTo(p.y, 220), 60);
    return () => clearTimeout(h);
  }, [state.flash.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the sticky Done bar ---------- */
  const barStyle = useAnimatedStyle(() => {
    if (!scrollRef || Number.isNaN(rootY0.value)) return { transform: [{ translateY: 0 }] };
    return { transform: [{ translateY: Math.max(0, stick - (rootY0.value - offset.value)) }] };
  });

  const height = useSharedValue(L.h * k);
  useEffect(() => { height.value = rm ? L.h * k : withTiming(L.h * k, { duration: 440, easing: EASE }); }, [L.h, k, rm, height]);
  const boxStyle = useAnimatedStyle(() => ({ height: height.value }));

  const label = cfg.label;
  const isHome = cfg.variant === 'home';
  return <GestureHandlerRootView style={styles.ghr}>
    <View ref={rootRef} collapsable={false} onLayout={(e: LayoutChangeEvent) => { setWidth(e.nativeEvent.layout.width); measureRoot(); }}>
      {editing ? <Animated.View style={[styles.barWrap, barStyle]}>
        <TileEditBar colors={colors} mode={mode} hidden={!!customizing} onAdd={() => tileRoutes().tray(page)} onDone={() => tileEdit.set(page, false)} />
      </Animated.View> : null}
      <Animated.View style={[styles.box, boxStyle]}>
        <Animated.View ref={gridRef} accessibilityRole="list" accessibilityLabel={fill(t('tilesGridLabel'), { page: label })}
          style={[styles.grid, { height: L.h, marginLeft: left, transform: k !== 1 ? [{ scale: k }] : [] }]}>
          {drawn.map((e, i) => {
            const def = defs.get(e.id)!;
            const pos = L.pos[e.id] ?? known.pos[e.id] ?? { x: 0, y: 0, ...FRAMES[e.size] };
            return <GridTile key={e.id} cfg={cfg} def={def} entry={e} pos={pos} index={i} colors={colors} mode={mode} rm={rm}
              editing={editing} lifted={lifted} customizing={customizing} leaving={leaving.includes(e.id)} settle={settle}
              entrance={animateIn} fresh={state.flash.fresh === e.id ? state.flash.seq : 0} resized={state.flash.resized === e.id ? state.flash.seq : 0}
              sizing={outline?.id === e.id} drag={drag} onHeld={onHeld} onLift={onLift} onDragEnd={onDragEnd} onRemove={remove}
              onCustomize={customize} onOpen={open} onMove={(id, by) => store.move(id, by)} onCycle={cycle}
              onResizeMove={resizeMove} onResizeEnd={resizeEnd} />;
          })}
          <ResizeOutline outline={outline} colors={colors} rm={rm} />
        </Animated.View>
      </Animated.View>
      {!shown.length && !editing ? <EmptyBlock icon="grid" color={colors[cfg.color] as string} colors={colors} style={styles.none}
        title={fill(t('tilesNoneTitle'), { page: label })} body={t('tilesNoneBody')} /> : null}
      <View style={[styles.foot, editing && styles.hidden]} pointerEvents={editing ? 'none' : 'auto'} importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={editing}>
        <FootButton icon="move" label={t(isHome ? 'tilesEditHome' : 'tilesEditPage')} colors={colors} mode={mode} onPress={() => enterEdit(true)} />
        <FootButton icon="grid" label={t('tilesAddTile')} colors={colors} mode={mode} onPress={() => tileRoutes().tray(page)} />
      </View>
      {customizing ? <View style={styles.cpad} /> : null}
    </View>
  </GestureHandlerRootView>;
}

/* ---------- one tile ---------- */
interface DragShared {
  id: ReturnType<typeof useSharedValue<string>>;
  base: ReturnType<typeof useSharedValue<{ x: number; y: number; w: number; h: number; off: number }>>;
  t: ReturnType<typeof useSharedValue<{ x: number; y: number; absY: number }>>;
  off: ReturnType<typeof useSharedValue<number>>;
  k: ReturnType<typeof useSharedValue<number>>;
  lastSent: ReturnType<typeof useSharedValue<{ x: number; y: number }>>;
}
interface GridTileProps {
  cfg: TilePageConfig; def: TileDef; entry: LayoutEntry; pos: TilePos; index: number;
  colors: ThemeColors; mode: ThemeMode; rm: boolean;
  editing: boolean; lifted: string | null; customizing: string | null; leaving: boolean; settle: number;
  entrance: boolean; fresh: number; resized: number; sizing: boolean; drag: DragShared;
  onHeld: () => void; onLift: (id: string) => void; onDragEnd: () => void; onRemove: (id: string) => void;
  onCustomize: (id: string) => void; onOpen: (id: string) => void; onMove: (id: string, by: -1 | 1) => void; onCycle: (id: string) => void;
  onResizeMove: (id: string, dx: number, dy: number) => void; onResizeEnd: (id: string, cancel: boolean) => void;
}

const noSubscribe = () => () => {};

const GridTile = memo(function GridTile(p: GridTileProps) {
  const { cfg, def, entry, pos, index, colors, mode, rm, editing, lifted, customizing, leaving, drag } = p;
  const id = entry.id, f = FRAMES[entry.size], wide = entry.size !== 'S';
  const isLifted = lifted === id, cz = customizing === id;

  /* position: glides to its slot; jumps there on first draw and under Reduce Motion */
  const x = useSharedValue(pos.x), y = useSharedValue(pos.y);
  useEffect(() => {
    if (rm) { x.value = pos.x; y.value = pos.y; return; }
    x.value = withTiming(pos.x, { duration: REFLOW_MS, easing: SPRING });
    y.value = withTiming(pos.y, { duration: REFLOW_MS, easing: SPRING });
  }, [pos.x, pos.y, p.settle, rm, x, y]);

  /* wiggle in edit mode (wide tiles less); every other tile a little faster and reversed, every third out of phase */
  const rot = useSharedValue(0);
  const wiggle = editing && !rm && !isLifted && !cz && !p.sizing;
  useEffect(() => {
    cancelAnimation(rot);
    if (!wiggle) { rot.value = 0; return; }
    const amp = wide ? 0.32 : 0.6, odd = index % 2 === 1, dur = odd ? 270 : 300, from = odd ? amp : -amp;
    const lead = (index + 1) % 3 === 0 ? 110 : 0;
    rot.value = from + (lead ? (-from - from) * 0.5 * (1 - Math.cos(Math.PI * lead / dur)) : 0);
    rot.value = withSequence(withTiming(-from, { duration: dur - lead, easing: Easing.inOut(Easing.ease) }),
      withRepeat(withTiming(from, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [wiggle, wide, index, rot]);

  /* lift, press, remove, arrival, resize and first-draw motion */
  const lift = useSharedValue(0), press = useSharedValue(0), out = useSharedValue(0);
  useEffect(() => { lift.value = rm ? (isLifted ? 1 : 0) : withTiming(isLifted ? 1 : 0, { duration: LIFT_MS, easing: EASE }); }, [isLifted, rm, lift]);
  useEffect(() => { if (leaving) out.value = rm ? 1 : withTiming(1, { duration: REMOVE_MS, easing: EASE }); }, [leaving, rm, out]);
  const arrive = useSharedValue(p.entrance ? 0 : 1), arriveMode = useSharedValue(p.entrance ? 1 : 0);
  useEffect(() => {
    if (p.entrance) arrive.value = withDelay(entranceDelay(index, p.cfg.variant === 'home'), withTiming(1, { duration: TILE_ENTRANCE.ms, easing: EASE }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.fresh || rm) return;
    arriveMode.set(2); arrive.set(0); arrive.set(withTiming(1, { duration: 900, easing: EASE }));
  }, [p.fresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const rs = useSharedValue(1);
  useEffect(() => { if (p.resized && !rm) { rs.value = 0; rs.value = withTiming(1, { duration: 500, easing: EASE }); } }, [p.resized]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => {
    const dragging = drag.id.value === id;
    let tx = x.value, ty = y.value;
    if (dragging) {
      const b = drag.base.value, kk = drag.k.value || 1;
      tx = b.x + drag.t.value.x / kk; ty = b.y + (drag.t.value.y + drag.off.value - b.off) / kk;
    }
    const a = arrive.value, m = arriveMode.value;
    const enterY = m === 1 ? TILE_ENTRANCE.rise * (1 - a) : m === 2 ? interpolate(a, [0, 0.55, 1], [28, -2, 0]) : 0;
    const enterS = m === 2 ? interpolate(a, [0, 0.55, 1], [0.9, 1.012, 1]) : 1;
    const enterO = m === 1 ? a : m === 2 ? interpolate(a, [0, 0.55, 1], [0, 1, 1]) : 1;
    const scale = (1 + 0.04 * lift.value) * (1 - 0.02 * press.value) * (1 - 0.14 * out.value) * enterS;
    return {
      zIndex: dragging || lift.value > 0.01 ? 5 : 1,
      opacity: enterO * (1 - out.value),
      transform: [{ translateX: tx }, { translateY: ty + enterY }, { rotate: `${dragging ? 0 : rot.value}deg` }, { scale }],
    };
  });
  const frameStyle = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * rs.value, transform: [{ scale: 0.96 + 0.04 * rs.value }] }));

  /* gestures: hold to enter edit mode (and keep moving to drag); in edit mode a 4 pt move drags. The corner arc resizes. */
  const { onHeld, onLift, onDragEnd, onResizeMove, onResizeEnd, onCycle } = p;
  const rzPan = usePanGesture({
    enabled: editing, minDistance: 6,
    onActivate: () => { 'worklet'; },
    onUpdate: e => { 'worklet'; const kk = drag.k.value || 1; runOnJS(onResizeMove)(id, e.translationX / kk, e.translationY / kk); },
    onFinalize: e => { 'worklet'; runOnJS(onResizeEnd)(id, e.canceled); },
  });
  const rzTap = useTapGesture({ enabled: editing, maxDistance: 6, onActivate: () => { 'worklet'; runOnJS(onCycle)(id); } });
  const lifting = useSharedValue(false);
  const pan = usePanGesture({
    minDistance: editing ? 4 : undefined,
    activateAfterLongPress: editing ? undefined : 480,
    failOffsetX: editing ? undefined : [-8, 8],
    failOffsetY: editing ? undefined : [-8, 8],
    requireToFail: [rzPan, rzTap],
    onActivate: () => {
      'worklet';
      if (!editing) runOnJS(onHeld)();
      lifting.value = false;
    },
    onUpdate: e => {
      'worklet';
      if (!lifting.value) {
        if (Math.hypot(e.translationX, e.translationY) < 4) return;
        lifting.value = true;
        drag.base.set({ x: x.value, y: y.value, w: f.w, h: f.h, off: drag.off.value });
        drag.lastSent.set({ x: -1e6, y: -1e6 });
        drag.id.set(id);
        runOnJS(onLift)(id);
      }
      drag.t.set({ x: e.translationX, y: e.translationY, absY: e.absoluteY });
    },
    onFinalize: () => {
      'worklet';
      if (!lifting.value) return;
      lifting.value = false;
      const b = drag.base.value, kk = drag.k.value || 1;
      x.set(b.x + drag.t.value.x / kk); y.set(b.y + (drag.t.value.y + drag.off.value - b.off) / kk);
      drag.id.set(''); drag.t.set({ x: 0, y: 0, absY: 0 });
      runOnJS(onDragEnd)();
    },
  });

  const title = def.title;
  const covered = useSyncExternalStore(def.cover?.subscribe ?? noSubscribe, () => def.cover?.covered() ?? false, () => def.cover?.covered() ?? false);
  const tapLabel = covered && !editing ? def.cover!.label(title) : `${title}. ${editing ? t('tilesCustomize') : def.label ?? t('tilesOpen')}`;
  const ok = sizesOf(def, entry.style), nx = ok[(ok.indexOf(entry.size) + 1) % ok.length];
  const rzLabel = ok.length > 1 ? fill(t('tilesResize'), { title, size: SIZE_WORD[entry.size], next: SIZE_WORD[nx] })
    : fill(t(cfg.variant === 'home' ? 'tilesResizeOnlyHome' : 'tilesResizeOnly'), { title, size: SIZE_WORD[entry.size] });
  const actions = editing
    ? [{ name: 'activate', label: t('tilesCustomize') }, { name: 'earlier', label: t('tilesMoveEarlier') }, { name: 'later', label: t('tilesMoveLater') },
      { name: 'resize', label: t('tilesResizeAction') }, { name: 'remove', label: t('tilesRemoveAction') }]
    : [{ name: 'activate', label: covered ? t('tilesShowNumbers') : def.label ?? t('tilesOpen') }, { name: 'longpress', label: t(cfg.variant === 'home' ? 'tilesEditHome' : 'tilesEditPage') }];
  const onAction = (e: AccessibilityActionEvent) => {
    switch (e.nativeEvent.actionName) {
      case 'activate': if (editing) p.onCustomize(id); else p.onOpen(id); break;
      case 'longpress': onHeld(); break;
      case 'earlier': p.onMove(id, -1); break;
      case 'later': p.onMove(id, 1); break;
      case 'resize': onCycle(id); break;
      case 'remove': p.onRemove(id); break;
    }
  };
  const hideCtl = isLifted || !!lifted;
  return <GestureDetector gesture={pan}>
    <Animated.View style={[styles.tile, { width: f.w, height: f.h }, style]} pointerEvents={leaving ? 'none' : 'auto'}>
      <Tappable dim="none" accessibilityRole="button" accessibilityLabel={tapLabel}
        accessibilityActions={actions} onAccessibilityAction={onAction}
        onPressIn={() => { if (!editing && !rm) press.value = withTiming(1, { duration: 300, easing: EASE }); }}
        onPressOut={() => { press.value = rm ? 0 : withTiming(0, { duration: 300, easing: EASE }); }}
        onPress={() => (editing ? p.onCustomize(id) : p.onOpen(id))}>
        <Animated.View style={frameStyle}>
          <TileFrame cfg={cfg} def={def} entry={entry} colors={colors} mode={mode} reduceMotion={rm} editing={editing}
            lift={isLifted ? liftShadows(colors, mode) : undefined} />
        </Animated.View>
      </Tappable>
      {cz ? <View pointerEvents="none" style={[styles.cz, { borderColor: colors.accent }]} /> : null}
      {editing ? <>
        <Tappable accessibilityRole="button" accessibilityLabel={fill(t('tilesRemoveTile'), { title })} hitSlop={8} onPress={() => p.onRemove(id)}
          style={[styles.rm, { backgroundColor: colors['surface-2'], boxShadow: `0 0 0 2px ${colors.bg}, 0 2px 6px rgba(0,0,0,0.3)`, opacity: isLifted ? 0 : 1 }]}>
          <TileIcon name="x" size={14} color={colors.text} />
        </Tappable>
        <GestureDetector gesture={rzPan}>
          <GestureDetector gesture={rzTap}>
            <View accessible accessibilityRole="button" accessibilityLabel={rzLabel} onAccessibilityTap={() => onCycle(id)}
              style={[styles.rz, { opacity: hideCtl ? 0 : 1 }]}>
              <View style={p.sizing ? styles.rzOn : null}>
                {/* the arc's soft drop shadow (1 pt down) under the arc itself */}
                <Svg width={44} height={44} viewBox="0 0 44 44" style={styles.rzSvg}>
                  <Path d={ARC} transform="translate(0 1)" fill="none" stroke={mode === 'dark' ? 'rgba(0,0,0,0.3)' : rgba(colors.text, 0.14)} strokeWidth={7} strokeLinecap="round" />
                  <Path d={ARC} transform="translate(0 1)" fill="none" stroke={mode === 'dark' ? 'rgba(0,0,0,0.3)' : rgba(colors.text, 0.14)} strokeWidth={5.5} strokeLinecap="round" />
                  <Path d={ARC} fill="none" stroke={colors.text} strokeWidth={4.5} strokeLinecap="round" />
                </Svg>
              </View>
            </View>
          </GestureDetector>
        </GestureDetector>
      </> : null}
    </Animated.View>
  </GestureDetector>;
});

/* ---------- the outline shown while a tile is resized by its corner ---------- */
function ResizeOutline({ outline, colors, rm }: { outline: { pos: TilePos; size: TileSize } | null; colors: ThemeColors; rm: boolean }) {
  const on = useSharedValue(0), ox = useSharedValue(0), oy = useSharedValue(0), w = useSharedValue(173), h = useSharedValue(176);
  // The size word stays on the outline while it fades out.
  const [last, setLast] = useState(outline);
  if (outline && outline !== last) setLast(outline);
  const word = last ? SIZE_WORD[last.size] : '';
  useEffect(() => {
    const cfg = { duration: rm ? 0 : OUTLINE_MS, easing: SPRING };
    if (outline) {
      const first = on.value < 0.01;
      if (first) { ox.value = outline.pos.x; oy.value = outline.pos.y; w.value = outline.pos.w; h.value = outline.pos.h; }
      else { ox.value = withTiming(outline.pos.x, cfg); oy.value = withTiming(outline.pos.y, cfg); w.value = withTiming(outline.pos.w, cfg); h.value = withTiming(outline.pos.h, cfg); }
      on.value = withTiming(1, { duration: rm ? 150 : 160 });
    } else on.value = withTiming(0, { duration: rm ? 150 : 160 });
  }, [outline, rm, on, ox, oy, w, h]);
  const style = useAnimatedStyle(() => ({ opacity: on.value, width: w.value, height: h.value, transform: [{ translateX: ox.value }, { translateY: oy.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.ol, { backgroundColor: `${colors.accent}1A`, borderColor: colors.accent }, style]}>
    <View style={[styles.olPill, { backgroundColor: colors.accent }]}><Text style={[styles.olText, { color: colors['on-accent'] }]}>{word}</Text></View>
  </Animated.View>;
}

/* ---------- edit bar and foot buttons ---------- */
/** The bar at the top of a page in edit mode: a hint, Add a tile and Done. */
export function TileEditBar({ colors, mode, hidden, onAdd, onDone }: { colors: ThemeColors; mode: ThemeMode; hidden?: boolean; onAdd: () => void; onDone: () => void }) {
  return <View accessibilityRole="toolbar" accessibilityLabel={t('tilesEditingLabel')} pointerEvents={hidden ? 'none' : 'auto'}
    style={[styles.bar, { backgroundColor: colors['surface-2'], boxShadow: liftShadow(colors, mode), opacity: hidden ? 0 : 1 }]}>
    <Text numberOfLines={1} style={[styles.barText, { color: colors.text }]}>{t('tilesEditingBar')}</Text>
    <Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => [styles.barBtn, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.barBtnText, { color: colors.accent }]}>{t('tilesAddTile')}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.barBtn, styles.barOk, { backgroundColor: colors.accent }, pressed && { opacity: 0.75 }]}>
      <Text style={[styles.barBtnText, { color: colors['on-accent'] }]}>{t('tilesDone')}</Text>
    </Pressable>
  </View>;
}
function FootButton({ icon, label, colors, mode, onPress }: { icon: string; label: string; colors: ThemeColors; mode: ThemeMode; onPress: () => void }) {
  // The mockup's .press: it dips to 97 percent and dims a little while held, then springs back.
  return <PressScale accessibilityRole="button" onPress={onPress}
    style={[styles.footBtn, { backgroundColor: colors.surface }, mode !== 'dark' && { boxShadow: `0 0 0 1px ${colors.hair}` }]}>
    <TileIcon name={icon} size={16} color={colors['text-muted']} />
    <Text style={[styles.footText, { color: colors['text-muted'] }]}>{label}</Text>
  </PressScale>;
}

const styles = StyleSheet.create({
  ghr: { flex: 0 },
  barWrap: { zIndex: 6, marginBottom: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 6 },
  barText: { flex: 1, minWidth: 0, fontFamily: tokens.font.bodyStrong, fontSize: 14 },
  barBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  barOk: { paddingHorizontal: 16 },
  barBtnText: { fontFamily: tokens.font.heading, fontSize: 14 },
  box: { position: 'relative' },
  grid: { position: 'relative', width: GRID_W, transformOrigin: 'left top' },
  tile: { position: 'absolute', left: 0, top: 0, borderRadius: 20 },
  cz: { position: 'absolute', left: -6, top: -6, right: -6, bottom: -6, borderWidth: 2, borderRadius: 28 },
  rm: { position: 'absolute', top: -8, left: -8, zIndex: 2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rz: { position: 'absolute', right: -8, bottom: -8, zIndex: 2, width: 44, height: 44 },
  rzSvg: { overflow: 'visible' },
  rzOn: { transform: [{ translateX: 1 }, { translateY: 1 }, { scale: 1.12 }] },
  ol: { position: 'absolute', left: 0, top: 0, zIndex: 4, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  olPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, boxShadow: '0 4px 12px -6px rgba(0,0,0,0.4)' },
  olText: { fontFamily: tokens.font.bodyStrong, fontSize: 13 },
  none: { marginTop: 4 },
  foot: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 20 },
  hidden: { opacity: 0 },
  footBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 15, borderRadius: 999 },
  footText: { fontFamily: tokens.font.bodyStrong, fontSize: 13.5 },
  cpad: { height: 440 },
});
