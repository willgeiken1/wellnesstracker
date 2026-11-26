import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { field, fieldData, hsh, isolines, noise, svgPath, type Triple } from './field';
import type { SkyTokens } from './tones';
import { mixHex } from './tones';

/**
 * Behind Home: today's terrain again at phone scale as faint isobars (three depths), the latitude arcs of a far, very large
 * globe and, at night, a few fixed stars, over a soft wash of the accent and sleep colours. Built once per day's numbers.
 */
const P = 30;
const f1 = (n: number) => n.toFixed(1);

/** The backdrop's line work for a phone of pw x ph points: three layers of path data and the far graticule. */
export function backdropPaths(values: Triple, levels: number, pw: number, ph: number) {
  const today = fieldData(values), sc = pw / 393, w = pw + 2 * P, h = ph + 2 * P;
  const iso = isolines({ L: levels, nx: 58, ny: 124, x0: -P, x1: pw + P, y0: -P, y1: ph + P, smooth: 2, fn: (X, Y) => {
    const xm = 0.5 + (X - pw / 2) / (2 * pw), ym = (Y - 120 * sc) / pw;
    return 0.8 * field(xm, ym, today) + 0.3 * noise(X / (180 * sc) + 11.3, Y / (180 * sc) + 4.1, 5) + 0.12 * noise(X / (66 * sc) + 2.2, Y / (66 * sc) + 7.7, 9);
  } });
  const layers: { d: string; k: number }[][] = [[], [], []];
  for (const lv of iso) {
    const d = svgPath(lv.lines, w, h, { x0: -P, x1: pw + P, y0: -P, y1: ph + P });
    if (d) layers[Math.min(2, Math.floor((lv.k - 1) / 3))].push({ d, k: lv.k });
  }
  const cx = w / 2, cy = h * 1.95;
  const grat = Array.from({ length: 9 }, (_, k) => { const rr = h * 1.32 + k * 46; return { d: `M${f1(cx - rr)} ${f1(cy)}A${f1(rr)} ${f1(rr)} 0 0 1 ${f1(cx + rr)} ${f1(cy)}`, o: 0.13 - k * 0.011 }; });
  const stars = Array.from({ length: 18 }, (_, k) => ({ x: hsh(k * 3 + 1) * w, y: Math.pow(hsh(k * 3 + 2), 1.8) * h * 0.5, r: 0.7 + hsh(k * 3 + 3) * 0.5, o: 0.3 + hsh(k * 7) * 0.3 }));
  return { w, h, layers, grat, stars };
}

export interface BackdropProps {
  values: Triple; levels: number; width: number; height: number; colors: Record<string, string>; sky: SkyTokens; dark: boolean; lines: boolean;
  /** The page's scroll offset: the three line layers drift up at 4, 8.5 and 13 percent of it, so the backdrop stays nearly fixed. */
  scrollY?: SharedValue<number>; reduceMotion?: boolean;
}

/** One depth of line work, drawn 30 points past every edge and drifting with the scroll; the page-wide fade stays put. */
function BackdropLayer({ i, w, h, H, scrollY, still, children }: { i: number; w: number; h: number; H: number; scrollY?: SharedValue<number>; still: boolean; children: ReactNode }) {
  const drift = useAnimatedStyle(() => ({ transform: [{ translateY: still || !scrollY ? 0 : -Math.max(0, scrollY.value) * (0.04 + 0.045 * i) }] }));
  return <Animated.View style={[{ position: 'absolute', left: -P, top: -P, width: w, height: h }, drift]}>
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id={`hbFade${i}`} gradientUnits="userSpaceOnUse" x1="0" y1={P} x2="0" y2={P + H}>
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} /><Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.55} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.3} />
        </LinearGradient>
        <Mask id={`hbMask${i}`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}><Rect width={w} height={h} fill={`url(#hbFade${i})`} /></Mask>
      </Defs>
      <G mask={`url(#hbMask${i})`}>{children}</G>
    </Svg>
  </Animated.View>;
}

export function HeroBackdrop({ values, levels, width, height, colors: c, sky, dark, lines, scrollY, reduceMotion = false }: BackdropProps) {
  const key = values.join();
  const b = useMemo(() => backdropPaths(values, levels, width, height), [key, levels, width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lines off leaves the page plain, as the design does.
  if (!lines) return null;
  const W = width, H = height;
  const wash = dark
    ? <>
      <Rect width={W} height={H} fill="url(#hbA)" /><Rect width={W} height={H} fill="url(#hbS)" /><Rect width={W} height={H} fill="url(#hbD)" />
    </>
    : <>
      <Rect width={W} height={H} fill="url(#hbL)" /><Rect width={W} height={H} fill="url(#hbA)" /><Rect width={W} height={H} fill="url(#hbS)" />
    </>;
  const lineK = (k: number) => (dark ? 0.05 : 0.06) + 0.012 * k;
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden' }} testID="home-hero-backdrop">
    <Svg width={W} height={H}>
      <Defs>
        <RadialGradient id="hbA" gradientUnits="userSpaceOnUse" cx={W * (dark ? 0.08 : 0.06)} cy={-H * 0.04} rx={W * 0.9} ry={H * (dark ? 0.38 : 0.36)} fx={W * (dark ? 0.08 : 0.06)} fy={-H * 0.04}>
          <Stop offset="0" stopColor={c.accent} stopOpacity={dark ? 0.15 : 0.12} /><Stop offset="0.7" stopColor={c.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hbS" gradientUnits="userSpaceOnUse" cx={W * (dark ? 0.96 : 0.98)} cy={dark ? H * 0.02 : 0} rx={W * 0.8} ry={H * 0.34} fx={W * (dark ? 0.96 : 0.98)} fy={dark ? H * 0.02 : 0}>
          <Stop offset="0" stopColor={c.sleep} stopOpacity={dark ? 0.14 : 0.12} /><Stop offset="0.72" stopColor={c.sleep} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hbD" gradientUnits="userSpaceOnUse" cx={W * 0.5} cy={H * 1.18} rx={W * 1.2} ry={H * 0.5} fx={W * 0.5} fy={H * 1.18}>
          <Stop offset="0" stopColor={sky.deep} stopOpacity={0.7} /><Stop offset="0.7" stopColor={sky.deep} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="hbL" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mixHex(c.bg, c.surface, 0.4)} /><Stop offset="0.55" stopColor={c.bg} />
          <Stop offset="1" stopColor={mixHex(mixHex(c.bg, c.text, 0.07), c.accent, 0.05)} />
        </LinearGradient>
      </Defs>
      {wash}
    </Svg>
    {b.layers.map((layer, i) => <BackdropLayer key={i} i={i} w={b.w} h={b.h} H={H} scrollY={scrollY} still={reduceMotion}>
      <G fill="none" stroke={sky.line} strokeWidth={1} strokeLinejoin="round">
        {i === 0 && dark ? b.stars.map((s, k) => <Circle key={`s${k}`} cx={s.x} cy={s.y} r={s.r} fill={sky.star} stroke="none" opacity={s.o} />) : null}
        {i === 1 ? b.grat.map((g, k) => <Path key={`g${k}`} d={g.d} strokeOpacity={g.o} strokeDasharray="2 6" strokeLinecap="round" />) : null}
        {layer.map((l, k) => <Path key={`l${k}`} d={l.d} strokeOpacity={lineK(l.k)} />)}
      </G>
    </BackdropLayer>)}
  </View>;
}
