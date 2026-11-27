import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { PixelRatio, View } from 'react-native';
import { FadeG, FadeUp, useCountTo } from './text-motion';
import { Tappable } from '@/components/tappable';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
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
  focus: number; onFocus: (pi: number) => void; onTouch: () => void; onFail: () => void;
}

export function AuroraHero(p: AuroraProps) {
  const { view, width: w, colors, sky, focus } = p;
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
  // Day score or one pillar's readout, crossfading with a short slide.
  const fq = useSharedValue(focus >= 0 ? 1 : 0);
  useEffect(() => { fq.value = p.reduceMotion ? (focus >= 0 ? 1 : 0) : withTiming(focus >= 0 ? 1 : 0, { duration: 340, easing: Easing.bezier(0.2, 0.75, 0.2, 1) }); }, [focus, p.reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayStyle = useAnimatedStyle(() => ({ opacity: 1 - fq.value, transform: [{ translateY: -6 * fq.value }] }));
  const pdStyle = useAnimatedStyle(() => ({ opacity: fq.value, transform: [{ translateY: 6 * (1 - fq.value) }] }));

  const muted = colors['text-muted'], text = colors.text, pc = KEYS.map(k => colors[k]);
  const allMet = view.allMet, empty = view.empty;
  const fp = focus >= 0 ? view.pillars[focus] : null;
  // A day change moves the words too: the score counts to its new value, the caption fades up, each readout fades in.
  const textAnim = p.animate && !p.reduceMotion;
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
        const fill = r.kind === 'name' ? pc[pi] : r.kind === 'u' || zero ? muted : text;
        return <SvgText key={i} fontFamily={BODY} fontSize={type.size} letterSpacing={type.spacing} fill={fill} {...stroke}>
          <TextPath href="#heroLimbAbove" startOffset={r.at}>{r.text}</TextPath>
        </SvgText>;
      })}
      {goal.map((r, i) => <SvgText key={`g${i}`} fontFamily={r.kind === 'of' ? BODY6 : BODY} fontSize={r.kind === 'of' ? OF.size : CAP.size}
        letterSpacing={r.kind === 'of' ? OF.spacing : CAP.spacing} fill={r.kind === 'of' ? muted : pl.met ? pc[pi] : text}
        fillOpacity={r.kind === 'cap' && !pl.met ? 0.72 : 1} {...stroke}>
        <TextPath href="#heroLimbUnder" startOffset={r.at}>{r.text}</TextPath>
      </SvgText>)}
    </FadeG>;
  });

  // 12 pt above the map keeps the day's caption clear of the greeting now that the score has its full line height.
  return <View style={{ height: HERO_H, marginTop: 12, marginHorizontal: -16, marginBottom: -40 }} testID="home-hero-aurora">
    <View accessible accessibilityRole="summary" accessibilityLabel={view.label} style={{ position: 'absolute', left: 0, top: 0, width: w, height: HERO_H }} />
    {Canvas ? <Canvas motion={motion} width={w} dpr={PixelRatio.get()} mode={p.mode} colors={colors} levels={p.levels} glow={p.glow}
      values={view.values} rest={view.rest} sel={view.sel} animate={p.animate} calm={p.calm} focus={focus} paused={p.paused}
      reduceMotion={p.reduceMotion} onTapSky={() => { if (focus >= 0) p.onFocus(-1); }} onTouch={p.onTouch} onFail={p.onFail} /> : null}
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: w, height: HERO_H }, labelsStyle]}>
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
    {L.targets.map(tg => {
      const pl = view.pillars[tg.pillar];
      // The arc itself shows the tap: the chosen pillar lights up and the others fade.
      return <Tappable dim="none" key={tg.pillar} onPress={() => p.onFocus(focus === tg.pillar ? -1 : tg.pillar)} accessibilityRole="button"
        accessibilityLabel={pl.spoken} accessibilityState={{ selected: focus === tg.pillar }} testID={`home-hero-arc-${pl.key}`}
        style={{ position: 'absolute', left: tg.x, top: tg.y, width: tg.w, height: tg.h, borderRadius: 23 }} />;
    })}
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: w, top: 0, height: L.apex.y - 26, alignItems: 'center', justifyContent: 'flex-end' }, apexStyle]}>
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
  </View>;
}
