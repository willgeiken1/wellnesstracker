import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Tappable } from '@/components/tappable';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { KitText } from '@/components/themed-text';
import type { HeroWeekDay } from './model';
import type { SkyTokens } from './tones';

/**
 * This week: seven days over one wide globe limb. Each day stands as three light beams (Training, Sleep, Food) as tall as
 * that pillar's progress, a small limb gauge under each beam, and the day score; the selected day is lit and a soft glow sits
 * under it. A tap picks a day; sliding across the days picks each one as the finger crosses it, with a light tick.
 */
export const WK = { H: 152, top: 84, Rr: 820, S: 56, pad: 9 } as const;
const WOFF = [-0.24, 0.24, 0], WORD = [0, 2, 1];
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
export const weekArcY = (x: number, RW: number) => { const dx = x - RW / 2; return WK.top + WK.Rr - Math.sqrt(WK.Rr * WK.Rr - dx * dx); };
const arcD = (x0: number, x1: number, RW: number) => `M${f1(x0)} ${f1(weekArcY(x0, RW))}A${WK.Rr} ${WK.Rr} 0 0 ${x1 > x0 ? 1 : 0} ${f1(x1)} ${f1(weekArcY(x1, RW))}`;
/** The day under a point x across the strip (0..6). */
export const dayAt = (x: number, RW: number) => Math.round(Math.max(0, Math.min(6, x / RW * 7 - 0.5)));
/** Where a day's beams and number stand: its centre and the three beams' x (Training, Food, Sleep). */
export function dayGeometry(i: number, RW: number) {
  const dw = (RW - 2 * WK.pad) / 7, cx = WK.pad + (i + 0.5) * dw;
  return { cx, beams: [0, 1, 2].map(k => WK.pad + (i + 0.5 + WOFF[k]) * dw) };
}

/** The week's motion (s9.js): the glow springs onto a day in 500 ms (overshooting a touch); a day's beams and gauges light up
 * from 42 and 62 percent in 340 ms; its name grows to 110 percent on a springy curve in 420 ms, with a quick 120 percent tick
 * (220 ms) as it is chosen. Under Reduce Motion each of these is instant. */
export const WEEK_MOTION = {
  settle: { duration: 500, easing: Easing.bezier(0.34, 1.3, 0.5, 1) },
  light: { duration: 340, easing: Easing.linear }, beamsOff: 0.42, gaugesOff: 0.62,
  grow: { duration: 420, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }, on: 1.1,
  tick: { up: 1.2, duration: 110, easing: Easing.bezier(0.3, 0.7, 0.3, 1) },
} as const;

const AnimatedG = Animated.createAnimatedComponent(G);
/** One day's beams or gauges, lighting up or dimming as the day is chosen or left. */
function DayLayer({ opacity, still, children }: { opacity: number; still: boolean; children: ReactNode }) {
  const v = useSharedValue(opacity);
  useEffect(() => { v.value = still ? opacity : withTiming(opacity, WEEK_MOTION.light); }, [opacity, still, v]);
  const props = useAnimatedProps(() => ({ opacity: v.value }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}
/** A day's name: it grows when its day is chosen, with a quick tick up as it lands, and settles back when another is. */
function DayLabel({ on, still, children }: { on: boolean; still: boolean; children: ReactNode }) {
  const v = useSharedValue(on ? WEEK_MOTION.on : 1);
  const was = useRef(on);
  useEffect(() => {
    const chosen = on && !was.current;
    was.current = on;
    if (still) { v.value = on ? WEEK_MOTION.on : 1; return; }
    v.value = chosen
      ? withSequence(withTiming(WEEK_MOTION.tick.up, WEEK_MOTION.tick), withTiming(WEEK_MOTION.on, WEEK_MOTION.tick))
      : withTiming(on ? WEEK_MOTION.on : 1, WEEK_MOTION.grow);
  }, [on, still, v]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
  return <Animated.View style={[{ alignItems: 'center', transformOrigin: 'bottom' }, style]}>{children}</Animated.View>;
}

export interface WeekProps {
  width: number; week: HeroWeekDay[]; sel: number; colors: Record<string, string>; sky: SkyTokens; dark: boolean; glow: number;
  reduceMotion: boolean; build: boolean; onSelect: (i: number) => void;
}

export function HeroWeek({ width: RW, week, sel, colors, sky, dark, glow, reduceMotion, build, onSelect }: WeekProps) {
  const pc = [colors.training, colors.food, colors.sleep];
  const cx0 = RW / 2, H = WK.H;
  // The selection glow follows the finger while sliding and springs onto the chosen day.
  const selX = useSharedValue(sel), dragging = useSharedValue(0), shown = useSharedValue(build && !reduceMotion ? 0 : 1);
  useEffect(() => { if (!dragging.value) selX.value = reduceMotion ? sel : withTiming(sel, WEEK_MOTION.settle); }, [sel, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (build && !reduceMotion) shown.value = withDelay(380, withTiming(1, { duration: 640, easing: Easing.out(Easing.cubic) })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selStyle = useAnimatedStyle(() => {
    const dw = RW / 7, x = (selX.value + 0.5) * dw, dx = x - RW / 2;
    return { transform: [{ translateX: selX.value * dw }, { translateY: WK.top + WK.Rr - Math.sqrt(WK.Rr * WK.Rr - dx * dx) - WK.top }] };
  });
  const fade = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 10 }] }));

  const pick = (x: number) => { const i = dayAt(x, RW); if (i !== sel) onSelect(i); };
  const settle = () => { dragging.value = 0; selX.value = reduceMotion ? sel : withTiming(sel, WEEK_MOTION.settle); };
  const pan = usePanGesture({
    activeOffsetX: [-6, 6], failOffsetY: [-12, 12],
    onActivate: e => { 'worklet'; dragging.value = 1; runOnJS(pick)(e.x); },
    onUpdate: e => { 'worklet'; if (!reduceMotion) selX.value = Math.max(0, Math.min(6, e.x / RW * 7 - 0.5)); runOnJS(pick)(e.x); },
    onFinalize: () => { 'worklet'; runOnJS(settle)(); },
  });

  const defs = <Defs>
    <LinearGradient id="hwGlobe" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={sky.globeA} /><Stop offset="1" stopColor={sky.globeB} stopOpacity={0} /></LinearGradient>
    {pc.map((c, k) => <LinearGradient key={k} id={`hwBeam${k}`} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={c} stopOpacity={0} /><Stop offset="0.6" stopColor={c} stopOpacity={0.5} /><Stop offset="1" stopColor={c} stopOpacity={1} />
    </LinearGradient>)}
    <RadialGradient id="hwSel" cx="50%" cy="100%" rx="50%" ry="100%" fx="50%" fy="100%">
      <Stop offset="0" stopColor={sky.sel} stopOpacity={sky.selAlpha} /><Stop offset="1" stopColor={sky.sel} stopOpacity={0} />
    </RadialGradient>
  </Defs>;
  const globe = <Path d={`${arcD(-4, RW + 4, RW)}L${RW + 4} ${H}L-4 ${H}Z`} fill="url(#hwGlobe)" />;
  const grat = [1, 2, 3].map(k => <Path key={k} d={`M-4 ${f1(weekArcY(-4, RW) + k * 10)}Q${f1(RW / 2)} ${f1(WK.top + k * 10 - 18 + k * 2)} ${RW + 4} ${f1(weekArcY(RW + 4, RW) + k * 10)}`}
    fill="none" stroke={sky.line} strokeWidth={1} strokeDasharray="1.5 5" strokeLinecap="round" opacity={0.16} />);
  const limbArc = <>
    <Path d={arcD(cx0, -4, RW)} fill="none" stroke={sky.air} strokeWidth={7} strokeLinecap="round" opacity={0.13 * glow * sky.glow} />
    <Path d={arcD(cx0, RW + 4, RW)} fill="none" stroke={sky.air} strokeWidth={7} strokeLinecap="round" opacity={0.13 * glow * sky.glow} />
    <Path d={arcD(cx0, -4, RW)} fill="none" stroke={sky.air} strokeWidth={1.2} strokeLinecap="round" opacity={dark ? 0.5 : 0.35} />
    <Path d={arcD(cx0, RW + 4, RW)} fill="none" stroke={sky.air} strokeWidth={1.2} strokeLinecap="round" opacity={dark ? 0.5 : 0.35} />
  </>;

  const days = week.map((wd, i) => {
    const on = i === sel, g = dayGeometry(i, RW), beams: ReactNode[] = [], gauges: ReactNode[] = [];
    for (let q = 0; q < 3; q++) {
      const k = WORD[q], v = wd.values[k], cx = g.beams[k], by = weekArcY(cx, RW);
      const nx = (cx - cx0) / WK.Rr * 0.5, ny = -Math.sqrt(1 - nx * nx), deg = Math.atan2(nx, -ny) * 57.2958;
      const ga0 = cx - 5.6, ga1 = cx + 5.6, fr = Math.min(1, v), rk = k === 0 && wd.rest;
      gauges.push(<Path key={`t${k}`} d={arcD(ga0, ga1, RW)} fill="none" strokeWidth={1.6} strokeLinecap="round"
        {...(rk ? { stroke: pc[k], strokeDasharray: '1.4 2.4', opacity: 0.7 } : { stroke: sky.track, strokeOpacity: sky.trackAlpha })} />);
      if (fr > 0) gauges.push(<Path key={`f${k}`} d={arcD(ga0, ga0 + (ga1 - ga0) * fr, RW)} fill="none" stroke={pc[k]} strokeWidth={2.2} strokeLinecap="round" />);
      if (wd.met[k]) gauges.push(<G key={`m${k}`}>
        <Circle cx={ga1} cy={weekArcY(ga1, RW)} r={4} fill={pc[k]} opacity={0.35 * glow * sky.glow} />
        <Circle cx={ga1} cy={weekArcY(ga1, RW)} r={1.7} fill={sky.hot} stroke={pc[k]} strokeWidth={1} />
      </G>);
      if (!(v > 0)) continue;
      const hh = WK.S * Math.min(1.05, v);
      beams.push(<G key={k} transform={`translate(${f1(cx)} ${f1(by - 2)}) rotate(${deg.toFixed(2)})`}>
        <Rect x={-2.6} y={-hh} width={5.2} height={hh} rx={2.6} fill={`url(#hwBeam${k})`} />
        <Rect x={-0.6} y={-hh * 0.55} width={1.2} height={hh * 0.55} rx={0.6} fill={sky.rayHot ?? pc[k]} opacity={sky.rayHot ? 0.75 : 1} />
      </G>);
    }
    if (wd.met[0] && wd.met[1] && wd.met[2]) {
      const ja = g.beams[0] - 5.6, jb = g.beams[1] + 5.6;
      gauges.unshift(<Path key="join" d={arcD(ja, jb, RW)} fill="none" stroke={sky.air} strokeWidth={1.1} strokeLinecap="round" />);
    }
    return { on, beams, gauges, g, wd };
  });

  return <Animated.View style={[{ height: H, marginTop: 4, marginHorizontal: -16 }, fade]} testID="home-hero-week">
    <GestureDetector gesture={pan}>
      <View style={{ width: RW, height: H }}>
        <Svg width={RW} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} pointerEvents="none">
          {defs}{globe}{grat}{limbArc}
          {days.map(({ on, beams }, i) => <DayLayer key={`b${i}`} opacity={on ? 1 : WEEK_MOTION.beamsOff} still={reduceMotion}>{beams}</DayLayer>)}
          {days.map(({ on, gauges }, i) => <DayLayer key={`g${i}`} opacity={on ? 1 : WEEK_MOTION.gaugesOff} still={reduceMotion}>{gauges}</DayLayer>)}
          {days.map(({ on, g, wd }, i) => wd.empty ? null : <SvgText key={`n${i}`} x={g.cx} y={weekArcY(g.cx, RW) + 15} textAnchor="middle"
            fontFamily="PlusJakartaSans_700Bold" fontSize={11} letterSpacing={-0.11} fill={on ? colors.text : colors['text-muted']}>{String(wd.pct)}</SvgText>)}
        </Svg>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: RW / 7 }, selStyle]}>
          <Svg width={RW / 7 + 12} height={96} style={{ position: 'absolute', left: -6, top: 6 }}><Rect width={RW / 7 + 12} height={96} fill="url(#hwSel)" /></Svg>
          <View style={{ position: 'absolute', left: RW / 14 - 8, bottom: 8, width: 16, height: 2, borderRadius: 1, backgroundColor: sky.air,
            shadowColor: sky.air, shadowOpacity: sky.glow * glow, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
        </Animated.View>
        {week.map((wd, i) => {
          const on = i === sel, pb = H - weekArcY(WK.pad + (i + 0.5) * (RW - 2 * WK.pad) / 7, RW) - 37;
          // The day itself shows the tap: it grows and the arc moves to it.
          return <Tappable dim="none" key={i} onPress={() => { if (i !== sel) onSelect(i); }} accessibilityRole="button" accessibilityLabel={wd.label}
            accessibilityState={{ selected: on }} testID={`home-hero-day-${i}`}
            style={{ position: 'absolute', top: 0, bottom: 0, left: i * RW / 7, width: RW / 7, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: pb, borderRadius: 12 }}>
            <DayLabel on={on} still={reduceMotion}>
              <KitText weight={600} size={12} lineHeight={1} color={wd.today ? 'accent' : on ? 'text' : 'text-muted'}>{wd.short}</KitText>
              {wd.today ? <View style={{ position: 'absolute', top: '100%', marginTop: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} /> : null}
            </DayLabel>
          </Tappable>;
        })}
      </View>
    </GestureDetector>
  </Animated.View>;
}
