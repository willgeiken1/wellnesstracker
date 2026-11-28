import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { font } from '@/components/kit-style';
import { Tappable } from '@/components/tappable';
import type { ThemeColors, ThemeMode } from '@/design/tokens';
import { t } from '@/i18n/en';
import { colorMix, rgba } from '../depth';
import { FRAMES } from '../geometry';
import { TileFrame } from '../tile-frame';
import type { LayoutEntry, TileDef, TilePageConfig, TileStyle } from '../types';
import { fill } from '../ui';
import { EdGlyph } from './glyphs';

type Pick0 = Pick<LayoutEntry, 'style' | 'size' | 'options'>;
const SIZE_WORD = { S: t('tilesSizeS'), M: t('tilesSizeM'), L: t('tilesSizeL') } as const;
/** The stage's spring and slide, as the mockup's .te-win and .te-lay.go curves. */
const GROW = { duration: 460, easing: Easing.bezier(0.3, 1.2, 0.5, 1) };
const SLIDE = { duration: 420, easing: Easing.bezier(0.25, 1.15, 0.45, 1) };
const FADE_IN = { duration: 200, easing: Easing.linear }, FADE_OUT = { duration: 240, easing: Easing.linear };
/** The width a Medium tile draws at; the preview scales it down to fit the stage. */
const ROW_W = 358;

export function stageGeom(size: Pick0['size'], stageW: number) {
  const f = FRAMES[size] ?? FRAMES.M, k = Math.min(1, (stageW - 24) / ROW_W);
  return { f, k, w: (size === 'S' ? ROW_W : f.w) * k, h: f.h * k };
}
/** How a change reaches the preview: the old design slides out to one side, the frame grows or shrinks, or it crossfades. */
export type Change = { how: 'slide'; dir: 1 | -1 } | { how: 'size' } | { how: 'fade' } | null;

export interface StageProps {
  cfg: TilePageConfig; def: TileDef; pick: Pick0; styles: readonly TileStyle[]; change: Change; seq: number;
  colors: ThemeColors; mode: ThemeMode; rm: boolean; tint: string;
  /** Step to the style before (-1) or after (1). */
  onStep: (dir: 1 | -1) => void;
  onLayoutBottom?: (y: number) => void;
}

/**
 * The live preview: the tile at its real proportions on a soft stage in its colour. A Small tile sits beside an outline of
 * the half it leaves free. Swipe it (or use the arrows) to change style: the old design slides out and the next slides in
 * from the side you went. A size change grows or shrinks the frame in place; anything else crossfades. Reduce Motion fades.
 */
export function TileStage({ cfg, def, pick, styles, change, seq, colors, mode, rm, tint, onStep, onLayoutBottom }: StageProps) {
  const [stageW, setStageW] = useState(362);
  const g = stageGeom(pick.size, stageW);
  const i = Math.max(0, styles.findIndex(s => s.key === pick.style)), many = styles.length > 1, name = styles[i]?.name || fill(t('tilesStyleN'), { n: i + 1 });

  // The window springs between frame sizes.
  const w = useSharedValue(g.w), h = useSharedValue(g.h);
  useEffect(() => {
    w.value = rm ? g.w : withTiming(g.w, GROW);
    h.value = rm ? g.h : withTiming(g.h, GROW);
  }, [g.w, g.h, rm, w, h]);
  const win = useAnimatedStyle(() => ({ width: w.value, height: h.value }));

  // The outgoing design, kept for one transition beside the incoming one.
  const [old, setOld] = useState<{ pick: Pick0; seq: number } | null>(null);
  const last = useRef(pick), lastSeq = useRef(seq);
  const inX = useSharedValue(0), inO = useSharedValue(1), outX = useSharedValue(0), outO = useSharedValue(0), drag = useSharedValue(0);
  useEffect(() => {
    if (seq === lastSeq.current) { last.current = pick; return; }
    const prev = last.current; last.current = pick; lastSeq.current = seq;
    drag.value = 0;
    const how = !change ? 'none' : rm ? 'fade' : change.how;
    // The outgoing design lives for one transition, so it is set as the change lands and cleared when it has slid away.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one redraw per change, keyed to seq, never a loop.
    if (how === 'none' || how === 'size') { inX.value = 0; inO.value = 1; setOld(null); return; }
    setOld({ pick: prev, seq });
    if (how === 'slide' && change?.how === 'slide') {
      const dx = (g.w + 40) * change.dir;
      inX.value = dx; inO.value = 0; outX.value = 0; outO.value = 1;
      inX.value = withTiming(0, SLIDE); inO.value = withTiming(1, { duration: 300, easing: Easing.linear });
      outX.value = withTiming(-dx, SLIDE); outO.value = withTiming(0, { duration: 300, easing: Easing.linear });
    } else {
      inX.value = 0; outX.value = 0; inO.value = 0; outO.value = 1;
      inO.value = withTiming(1, FADE_IN); outO.value = withTiming(0, FADE_OUT);
    }
    const id = setTimeout(() => setOld(o => (o?.seq === seq ? null : o)), 460);
    return () => clearTimeout(id);
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const inStyle = useAnimatedStyle(() => ({ opacity: inO.value * Math.max(0.35, 1 - Math.abs(drag.value) / 420), transform: [{ translateX: inX.value + drag.value }] }));
  const outStyle = useAnimatedStyle(() => ({ opacity: outO.value, transform: [{ translateX: outX.value }] }));

  // Swipe between styles: it follows the finger, 60 pt or a flick commits, and it gives a little at either end.
  const first = i === 0, lastStyle = i === styles.length - 1;
  const settle = (dx: number, vx: number) => {
    const dir: 1 | -1 = dx < 0 ? 1 : -1, can = dir === 1 ? !lastStyle : !first;
    if (can && (Math.abs(dx) > 60 || Math.abs(vx) > 500)) { onStep(dir); return; }
    drag.set(rm ? 0 : withTiming(0, SLIDE));
  };
  const pan = usePanGesture({
    enabled: many, activeOffsetX: [-8, 8], failOffsetY: [-10, 10],
    onUpdate: e => { 'worklet'; const end = (e.translationX > 0 && first) || (e.translationX < 0 && lastStyle); drag.set(end ? e.translationX * 0.3 : e.translationX); },
    onDeactivate: e => { 'worklet'; runOnJS(settle)(e.translationX, e.velocityX); },
  });

  // The ghost half beside a Small tile fades in and out.
  const ghostO = useSharedValue(pick.size === 'S' ? 1 : 0);
  useEffect(() => { ghostO.value = rm ? (pick.size === 'S' ? 1 : 0) : withTiming(pick.size === 'S' ? 1 : 0, { duration: 250, easing: Easing.linear }); }, [pick.size, rm, ghostO]);
  const ghost = useAnimatedStyle(() => ({ opacity: ghostO.value }));

  const layer = (p: Pick0) => <View style={{ width: FRAMES[p.size].w, height: FRAMES[p.size].h, transform: [{ scale: g.k }], transformOrigin: 'left top' }}>
    <TileFrame cfg={cfg} def={def} entry={p} colors={colors} mode={mode} reduceMotion={rm} preview />
  </View>;
  const label = fill(t(many ? 'tePreviewSwipe' : 'tePreview'), { style: name, size: SIZE_WORD[pick.size] });
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment' && !lastStyle) onStep(1);
    if (e.nativeEvent.actionName === 'decrement' && !first) onStep(-1);
  };
  const dark = mode === 'dark';
  return <View testID="te-stage" style={[s.stage, { paddingBottom: many ? 12 : 18, boxShadow: `inset 0 0 0 1px ${rgba(colors.text, 0.06)}` }]}
    onLayout={e => { setStageW(e.nativeEvent.layout.width); onLayoutBottom?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height); }}>
    <StageGlow tint={tint} colors={colors} dark={dark} />
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole={many ? 'adjustable' : 'image'} accessibilityLabel={label}
        accessibilityActions={many ? [{ name: 'increment' }, { name: 'decrement' }] : undefined} onAccessibilityAction={onAction}>
        <Animated.View style={[s.win, win]}>
          <Animated.View pointerEvents="none" style={[s.ghost, ghost, { left: 185 * g.k, width: 173 * g.k, height: g.f.h * g.k, borderColor: rgba(colors.text, 0.16) }]}>
            <Text style={[s.ghostT, { color: colors.ghost }]}>{t('teGhost')}</Text>
          </Animated.View>
          {old ? <Animated.View key={`o${old.seq}`} pointerEvents="none" style={[s.lay, outStyle]}>{layer(old.pick)}</Animated.View> : null}
          <Animated.View pointerEvents="none" style={[s.lay, inStyle]} testID="te-live">{layer(pick)}</Animated.View>
        </Animated.View>
      </View>
    </GestureDetector>
    {many ? <>
      <View style={s.cap}>
        <Arrow dir={-1} off={first} colors={colors} onPress={() => onStep(-1)} />
        <Text accessible={false} style={s.capT}><Text style={[font(600, 13.5), { color: colors.text }]}>{name}</Text>
          <Text style={[font(500, 13), { color: colors['text-muted'] }]}>{` ${fill(t('teOf'), { i: i + 1, n: styles.length })}`}</Text></Text>
        <Arrow dir={1} off={lastStyle} colors={colors} onPress={() => onStep(1)} />
      </View>
      <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {styles.map((x, j) => <Dot key={x.key} on={j === i} tint={tint} off={rgba(colors.text, 0.2)} rm={rm} />)}
      </View>
    </> : null}
  </View>;
}

/** The stage's soft ground: a faint wash with a glow of the tile's colour from the top (the mockup's .te-stage and .tgl-pv). */
export function StageGlow({ tint, colors, dark }: { tint: string; colors: ThemeColors; dark: boolean }) {
  return <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
    <Defs>
      <RadialGradient id="te-glow" cx={0.5} cy={0} fx={0.5} fy={0} r={1} gradientTransform="translate(0.5 0) scale(1.2 0.9) translate(-0.5 0)">
        <Stop offset="0" stopColor={tint} stopOpacity={dark ? 0.16 : 0.14} /><Stop offset="0.7" stopColor={tint} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={dark ? rgba(colors.text, 0.035) : colorMix(colors.text, 0.04, colors.bg)} />
    <Rect width="100%" height="100%" fill="url(#te-glow)" />
  </Svg>;
}

function Arrow({ dir, off, colors, onPress }: { dir: 1 | -1; off: boolean; colors: ThemeColors; onPress: () => void }) {
  return <Tappable dim="row" accessibilityRole="button" accessibilityLabel={t(dir < 0 ? 'tePrev' : 'teNext')} accessibilityState={{ disabled: off }} disabled={off}
    onPress={onPress} hitSlop={8} style={[s.arr, { backgroundColor: rgba(colors.text, 0.07) }, off && { opacity: 0.3 }]}>
    <EdGlyph name={dir < 0 ? 'chevron-left' : 'chevron-right'} size={15} color={colors['text-muted']} />
  </Tappable>;
}
function Dot({ on, tint, off, rm }: { on: boolean; tint: string; off: string; rm: boolean }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.value = rm ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 300 }); }, [on, rm, v]);
  const st = useAnimatedStyle(() => ({ width: 6 + 12 * v.value }));
  return <Animated.View style={[s.dot, st, { backgroundColor: on ? tint : off }]} />;
}

const s = StyleSheet.create({
  stage: { position: 'relative', marginHorizontal: -4, paddingTop: 18, borderRadius: 28, overflow: 'hidden' },
  win: { position: 'relative', alignSelf: 'center' },
  lay: { position: 'absolute', left: 0, top: 0 },
  ghost: { position: 'absolute', top: 0, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  ghostT: { ...font(600, 12.5, 1.35), textAlign: 'center' },
  cap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14, minHeight: 28 },
  capT: { textAlign: 'center' },
  arr: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot: { height: 6, borderRadius: 3 },
});
