import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { PixelRatio, View } from 'react-native';
import { FadeG, FadeUp, useCountTo } from './text-motion';
import { Tappable } from '@/components/tappable';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { GLIDE, SWIPE, swipeDrag, swipeLean, swipeTarget } from './day-swipe';
import { spreadAt } from './scroll-spread';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Text as SvgText, TextPath } from 'react-native-svg';
import { KitText } from '@/components/themed-text';
import { t } from '@/i18n/en';
import type { AuroraCanvasProps } from './aurora-canvas-impl';
import { HERO_H } from './camera';
import { heroLayout } from './layout';
import type { HeroView } from './model';
import { CAP, goalRuns, NAME, NUM, OF, UNIT, valueRuns } from './readout-layout';
import { HeroMotion, SLOT } from './motion';
import type { SkyTokens } from './tones';

/**
 * The Aurora hero over the globe: the real values riding the limb and each goal hung under its end cap, the day score at the
 * apex (or one pillar's full readout after a tap on its arc), the three arc targets and the empty sky's two lines.
 *
 * Days glide (mockup v23): a sideways swipe on the map turns the globe with the finger and leans the day's words; let go past
 * the commit and the hero moves to the day on that side. On every day change the day's words leave toward the side the day went
 * while the new day's words come in from the other side, as the globe swings the same way (day-swipe.ts).
 */
// The canvas needs Skia; where it can't load (a check without a phone) Home falls back to another style.
let canvasModule: { AuroraCanvas: ComponentType<AuroraCanvasProps> } | null | undefined;
export function loadAuroraCanvas() {
  if (canvasModule === undefined) { try { canvasModule = require('./aurora-canvas'); } catch { canvasModule = null; } }
  return canvasModule?.AuroraCanvas ?? null;
}

const KEYS = ['training', 'food', 'sleep'] as const;
/** The big number's box runs 7 pt under its digits at a full line height; this keeps its foot where the mockup puts it. */
const SCORE_FOOT = -7;
const BODY = 'PlusJakartaSans_700Bold', BODY6 = 'PlusJakartaSans_600SemiBold';

export interface AuroraProps {
  view: HeroView; width: number; colors: Record<string, string>; mode: 'dark' | 'light'; sky: SkyTokens;
  reduceMotion: boolean; calm: boolean; paused: boolean; animate: boolean;
  levels: number; glow: number; labels: boolean;
  /** Home's scroll: the day's caption and score trail it a little more than the map (scroll-spread.ts). */
  scrollY?: SharedValue<number>;
  /** The swipe as the hero shows it, in points (Home shares it with the week's glow and clears it when the day changes). */
  swipe?: SharedValue<number>;
  /** A swipe on the map let go past the commit: the day it heads for. */
  onSwipeDay?: (sel: number) => void;
  focus: number; onFocus: (pi: number) => void; onTouch: () => void; onFail: () => void;
}

const GLIDE_IN = { duration: GLIDE.inMs, easing: Easing.bezier(0.2, 0.75, 0.2, 1) };
const GLIDE_OUT = { duration: GLIDE.outMs, easing: Easing.bezier(0.4, 0, 0.6, 1) };
const GLIDE_BACK = { duration: GLIDE.backMs, easing: Easing.bezier(0.3, 1.25, 0.5, 1) };
const FILL = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } as const;

interface WordsProps {
  view: HeroView; focus: number; w: number; colors: Record<string, string>; mode: 'dark' | 'light'; sky: SkyTokens;
  glow: number; labels: boolean; reduceMotion: boolean;
  /** Animates changes within the day (a quick log); a new day's words glide in as a whole instead. */
  textAnim: boolean;
  labelsStyle?: object; apexStyle?: object;
}

/** One day's words: the readout on the limb, the empty sky's lines and the apex (day score or one pillar's readout). */
function Words(p: WordsProps) {
  const { view, focus, w, colors, sky, textAnim } = p;
  const L = useMemo(() => heroLayout(w), [w]);
  // Day score or one pillar's readout, crossfading with a short slide.
  const fq = useSharedValue(focus >= 0 ? 1 : 0);
  useEffect(() => { fq.value = p.reduceMotion ? (focus >= 0 ? 1 : 0) : withTiming(focus >= 0 ? 1 : 0, { duration: 340, easing: Easing.bezier(0.2, 0.75, 0.2, 1) }); }, [focus, p.reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayStyle = useAnimatedStyle(() => ({ opacity: 1 - fq.value, transform: [{ translateY: -6 * fq.value }] }));
  const pdStyle = useAnimatedStyle(() => ({ opacity: fq.value, transform: [{ translateY: 6 * (1 - fq.value) }] }));

  const muted = colors['text-muted'], pc = KEYS.map(k => colors[k]);
  const allMet = view.allMet, empty = view.empty;
  const fp = focus >= 0 ? view.pillars[focus] : null;
  const pct = useCountTo(view.pct, textAnim);
  const readout = (halo: boolean) => SLOT.map((pi, j) => {
    const pl = view.pillars[pi], rest = pi === 0 && view.rest, zero = !(pl.value > 0) && !rest;
    const name = pl.label.toUpperCase();
    const op = !p.labels ? 0 : focus >= 0 && focus !== pi ? 0.34 : 1;
    const stroke = halo ? { stroke: sky.halo, strokeOpacity: sky.haloAlpha, strokeWidth: 3.5, strokeLinejoin: 'round' as const } : {};
    // Each run is its own text on the path, at an offset worked out from the font, so the line centres on its arc and
    // stays on screen (readout-layout.ts).
    const runs = valueRuns(name, pl.arc, L.valueAt[j], L.aboveSpan[0], L.aboveSpan[1]);
    const goal = rest ? [] : goalRuns(t('homeHeroOf'), pl.cap, L.goalAt[j], L.underSpan[0], L.underSpan[1]);
    return <FadeG key={`${halo}${pi}`} k={`${name}|${pl.arc.map(a => a[0]).join(',')}`} opacity={op} animate={textAnim}>
      {runs.map((r, i) => {
        const type = r.kind === 'name' ? NAME : r.kind === 'u' ? UNIT : NUM;
        const fill = r.kind === 'name' ? pc[pi] : r.kind === 'u' || zero ? muted : colors.text;
        return <SvgText key={i} fontFamily={BODY} fontSize={type.size} letterSpacing={type.spacing} fill={fill} {...stroke}>
          <TextPath href="#heroLimbAbove" startOffset={r.at}>{r.text}</TextPath>
        </SvgText>;
      })}
      {goal.map((r, i) => <SvgText key={`g${i}`} fontFamily={r.kind === 'of' ? BODY6 : BODY} fontSize={r.kind === 'of' ? OF.size : CAP.size}
        letterSpacing={r.kind === 'of' ? OF.spacing : CAP.spacing} fill={r.kind === 'of' ? muted : pl.met ? pc[pi] : colors.text}
        fillOpacity={r.kind === 'cap' && !pl.met ? 0.72 : 1} {...stroke}>
        <TextPath href="#heroLimbUnder" startOffset={r.at}>{r.text}</TextPath>
      </SvgText>)}
    </FadeG>;
  });

  return <>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: w, height: HERO_H }, p.labelsStyle]}>
      <Svg width={w} height={HERO_H} style={{ overflow: 'visible' }}>
        <Defs>
          <Path id="heroLimbAbove" d={L.above} fill="none" />
          <Path id="heroLimbUnder" d={L.under} fill="none" />
        </Defs>
        {readout(true)}{readout(false)}
      </Svg>
      {empty ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 38, alignItems: 'center' }} testID="home-hero-empty">
        <KitText weight={700} size={15} lineHeight={1.2} tracking={-0.02} style={{ marginBottom: 3 }}>{view.emptyTitle}</KitText>
        <KitText weight={500} size={13} lineHeight={1.35} color="text-muted">{view.emptyLine}</KitText>
      </View> : null}
    </Animated.View>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: w, top: 0, height: L.apex.y - 26, alignItems: 'center', justifyContent: 'flex-end' }, p.apexStyle]}>
      <Animated.View style={[{ alignItems: 'center', gap: 8 }, dayStyle]} testID="home-hero-score">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Svg width={14} height={6} style={sky.glow ? { shadowColor: sky.air, shadowOpacity: 0.5 * p.glow, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } } : undefined}>
            <Defs><LinearGradient id="heroCapPill" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={colors.training} /><Stop offset="0.5" stopColor={colors.sleep} /><Stop offset="1" stopColor={colors.food} /></LinearGradient></Defs>
            <Rect width={14} height={6} rx={3} fill="url(#heroCapPill)" />
          </Svg>
          <FadeUp k={view.caption} animate={textAnim}>
            <KitText weight={600} size={12.5} lineHeight={1} color={allMet ? 'text' : 'text-muted'}>{view.caption}</KitText>
          </FadeUp>
        </View>
        {/* An empty day has no score: nothing logged is never drawn as 0. */}
        {/* A full line height keeps the digits inside their box on iOS (at 0.84 they rose into the caption); the negative
            margin keeps the score's foot where it stood. */}
        {empty ? null : <KitText weight={700} size={46} lineHeight={1} tracking={-0.045} numeric
          style={{ marginBottom: SCORE_FOOT, textShadowColor: p.mode === 'dark' ? sky.deep : 'transparent', textShadowRadius: 9 }}>{String(pct)}</KitText>}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', bottom: 0, alignItems: 'center', gap: 8 }, pdStyle]} accessibilityLiveRegion="polite"
        importantForAccessibility={fp ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!fp} testID="home-hero-detail">
        {fp ? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: pc[focus] }} />
            <KitText weight={700} size={12.5} lineHeight={1} color={KEYS[focus]}>{fp.label}</KitText>
            <KitText weight={600} size={12.5} lineHeight={1} color="text-muted">{fp.status}</KitText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: SCORE_FOOT }}>
            <KitText weight={700} size={46} lineHeight={1} tracking={-0.045} numeric>
              {fp.arc.map(([s, kind], i) => kind === 'u'
                ? <KitText key={i} weight={700} size={19} lineHeight={1} tracking={0} color="text-muted">{i === fp.arc.length - 1 ? ` ${s}` : ` ${s} `}</KitText>
                : s)}
            </KitText>
            {fp.goal ? <KitText weight={700} size={15} lineHeight={1} tracking={-0.01} color="text-muted">{t('homeHeroOf')}
              <KitText weight={600} size={15} lineHeight={1} color="text">{fp.goal}</KitText></KitText> : null}
          </View>
        </> : null}
      </Animated.View>
    </Animated.View>
  </>;
}

/** Writes a shared value from an effect (an animation or a number). */
const put = (sv: SharedValue<number>, v: number) => { sv.value = v; };

type Layer = { id: number; view: HeroView; focus: number; dir: number; live: boolean; from: { x: number; o: number } };
/**
 * One day's words. The shown day comes in from `from` (a glide) or stands still, and leans with a swipe on the map. When another
 * day takes its place it leaves from wherever it stands (mid glide, or leaning with the swipe that let go) toward the side the
 * day went, then asks to be dropped.
 */
function DayLayer({ layer, swipe, still, onDone, children }: { layer: Layer; swipe: SharedValue<number>; still: boolean; onDone: (id: number) => void; children: ReactNode }) {
  const x = useSharedValue(layer.from.x), o = useSharedValue(layer.from.o), out = useSharedValue(0);
  useEffect(() => {
    if (layer.from.x !== 0 || layer.from.o !== 1) { x.value = withTiming(0, GLIDE_IN); o.value = withTiming(1, GLIDE_IN); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Before Home clears the swipe, the lean is folded into the leaving words, so they leave from exactly where they stand.
  useLayoutEffect(() => {
    if (layer.live) return;
    const l = still ? { x: 0, opacity: 1 } : swipeLean(swipe.value), x0 = x.value + l.x, o0 = o.value * l.opacity, id = layer.id;
    put(out, 1); put(x, x0); put(o, o0);
    put(x, withTiming(x0 - layer.dir * GLIDE.outX, GLIDE_OUT));
    put(o, withTiming(0, GLIDE_OUT, done => { if (done) runOnJS(onDone)(id); }));
  }, [layer.live]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => {
    const l = out.value || still ? { x: 0, opacity: 1 } : swipeLean(swipe.value);
    return { opacity: o.value * l.opacity, transform: [{ translateX: x.value + l.x }] };
  });
  return <Animated.View pointerEvents="none" style={[FILL, style]}
    accessibilityElementsHidden={!layer.live} importantForAccessibility={layer.live ? 'auto' : 'no-hide-descendants'}>{children}</Animated.View>;
}

export function AuroraHero(p: AuroraProps) {
  const { view, width: w, sky, focus } = p;
  const L = useMemo(() => heroLayout(w), [w]);
  const [motion] = useState(() => new HeroMotion(w, { reduceMotion: p.reduceMotion }));
  // The module loads once and is kept, so the component stays the same across renders.
  const [Canvas] = useState(loadAuroraCanvas);
  const build = !p.reduceMotion && !p.calm;
  // The words come in after the globe: the readout at 760 ms, the apex with the header's reveal.
  const labelsIn = useSharedValue(build ? 0 : 1), apexIn = useSharedValue(build ? 0 : 1);
  useEffect(() => {
    if (!build) return;
    labelsIn.value = withDelay(760, withTiming(1, { duration: 320, easing: Easing.linear }));
    apexIn.value = withDelay(182, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const labelsStyle = useAnimatedStyle(() => ({ opacity: labelsIn.value }));
  const sy = p.scrollY, still = p.reduceMotion;
  const apexStyle = useAnimatedStyle(() => ({ opacity: apexIn.value,
    transform: [{ translateY: (1 - apexIn.value) * 10 + (sy ? spreadAt('apex', sy.value, still) : 0) }] }));

  // A day change moves the words too: within a day the score counts and the lines fade up; a new day glides in as a whole.
  const textAnim = p.animate && !p.reduceMotion;
  const ownSwipe = useSharedValue(0), swipe = p.swipe ?? ownSwipe;
  const [layers, setLayers] = useState<Layer[]>(() => [{ id: 0, view, focus, dir: 0, live: true, from: { x: 0, o: 1 } }]);
  const top = layers[layers.length - 1];
  if (top.view !== view || top.focus !== focus) {
    const dir = Math.sign(view.sel - top.view.sel);
    if (dir && textAnim) setLayers([...layers.slice(0, -1).slice(-2), { ...top, live: false, dir },
      { id: top.id + 1, view, focus, dir, live: true, from: { x: dir * GLIDE.inX, o: 0 } }]);
    else setLayers([...layers.slice(0, -1), { ...top, view, focus }]);
  }
  const drop = (id: number) => setLayers(ls => ls.filter(l => l.id !== id));
  const words = (v: HeroView, f: number, anim: boolean) => <Words view={v} focus={f} w={w} colors={p.colors} mode={p.mode} sky={sky} glow={p.glow}
    labels={p.labels} reduceMotion={p.reduceMotion} textAnim={anim} labelsStyle={labelsStyle} apexStyle={apexStyle} />;

  // The swipe: the globe turns with the finger (through the motion, which asks the canvas for frames) and the words lean.
  const sel = useSharedValue(view.sel);
  useEffect(() => { sel.value = view.sel; }, [view.sel, sel]);
  const drag = useRef(0);
  const onStart = () => { p.onTouch(); motion.finishEntrance(); if (!p.reduceMotion) drag.current = motion.beginDrag(); motion.kick(); };
  const onMove = (ex: number) => { if (!motion.dragging) return; motion.dragTo(drag.current - ex * 0.005); motion.kick(); };
  const onEnd = (dx: number, vx: number, canceled: boolean) => {
    const to = canceled ? null : swipeTarget(dx, vx, view.sel);
    if (to != null && p.onSwipeDay) { motion.takeTurn(); p.onSwipeDay(to); }
    else { motion.endDrag(); swipe.value = p.reduceMotion ? 0 : withTiming(0, GLIDE_BACK); }
    motion.kick();
  };
  const rm = p.reduceMotion;
  const pan = usePanGesture({
    activeOffsetX: [-SWIPE.start, SWIPE.start], failOffsetY: [-SWIPE.cancel, SWIPE.cancel],
    onActivate: () => { 'worklet'; runOnJS(onStart)(); },
    onUpdate: e => { 'worklet'; const ex = swipeDrag(e.translationX, sel.value); if (!rm) swipe.value = ex; runOnJS(onMove)(ex); },
    onDeactivate: e => { 'worklet'; runOnJS(onEnd)(e.translationX, e.velocityX, e.canceled); },
  });

  // 12 pt above the map keeps the day's caption clear of the greeting now that the score has its full line height.
  return <GestureDetector gesture={pan}>
    <View style={{ height: HERO_H, marginTop: 12, marginHorizontal: -16, marginBottom: -40 }} testID="home-hero-aurora">
      <View accessible accessibilityRole="summary" accessibilityLabel={view.label} accessibilityHint={p.onSwipeDay ? t('homeHeroSwipeHint') : undefined}
        style={{ position: 'absolute', left: 0, top: 0, width: w, height: HERO_H }} />
      {Canvas ? <Canvas motion={motion} width={w} dpr={PixelRatio.get()} mode={p.mode} colors={p.colors} levels={p.levels} glow={p.glow}
        values={view.values} rest={view.rest} sel={view.sel} animate={p.animate} calm={p.calm} focus={focus} paused={p.paused}
        reduceMotion={p.reduceMotion} onTapSky={() => { if (focus >= 0) p.onFocus(-1); }} onTouch={p.onTouch} onFail={p.onFail} /> : null}
      {L.targets.map(tg => {
        const pl = view.pillars[tg.pillar];
        // The arc itself shows the tap: the chosen pillar lights up and the others fade.
        return <Tappable dim="none" key={tg.pillar} onPress={() => p.onFocus(focus === tg.pillar ? -1 : tg.pillar)} accessibilityRole="button"
          accessibilityLabel={pl.spoken} accessibilityState={{ selected: focus === tg.pillar }} testID={`home-hero-arc-${pl.key}`}
          style={{ position: 'absolute', left: tg.x, top: tg.y, width: tg.w, height: tg.h, borderRadius: 23 }} />;
      })}
      {layers.map(l => <DayLayer key={l.id} layer={l} swipe={swipe} still={rm} onDone={drop}>{words(l.view, l.focus, l.live && textAnim)}</DayLayer>)}
    </View>
  </GestureDetector>;
}
