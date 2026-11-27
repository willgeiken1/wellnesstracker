import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Tappable } from '@/components/tappable';
import { SvgXml } from 'react-native-svg';
import { t } from '@/i18n/en';
import { HERO_H } from './camera';
import type { HeroView } from './model';
import { amountOf, kindOf, outCubic, ridgeColors, ridgePeaks, ridgeScene, smooth, staticRidgeState, tokens, type Kind, type RidgeState } from './ridge-scene';

/**
 * Ridgeline on Home. Every moving number is a critically damped spring, so a new day picks up from wherever the last change
 * was: the peaks, the real amounts, the day score and each readout's focus. The opening draws the ranges in while the peaks
 * rise; calm motion settles sooner; Reduce Motion shows the final frame with a short fade. Frames run only while something moves.
 */
type Group = 'v' | 'a' | 'p' | 'f';
interface Springs { x: Record<Group, number[]>; vel: Record<Group, number[]>; tg: Record<Group, number[]> }
const z3 = () => [0, 0, 0];

/** One step of the springs by dt seconds (om: stiffness of values; focus is stiffer). True while anything still moves. */
export function stepSprings(s: Springs, dt: number, om: number, now: number, start: number[]) {
  let moving = false;
  for (const g of ['v', 'a', 'p', 'f'] as Group[]) for (let i = 0; i < s.x[g].length; i++) {
    if ((g === 'v' || g === 'a') && now < start[i]) { moving = true; continue; }
    const o2 = g === 'f' ? 14 : om;
    let rem = dt;
    while (rem > 1e-6) { const h = Math.min(0.004, rem); rem -= h; const acc = -o2 * o2 * (s.x[g][i] - s.tg[g][i]) - 2 * o2 * s.vel[g][i]; s.vel[g][i] += acc * h; s.x[g][i] += s.vel[g][i] * h; }
    if (settled(s, g, i)) { s.x[g][i] = s.tg[g][i]; s.vel[g][i] = 0; } else moving = true;
  }
  return moving;
}
function settled(s: Springs, g: Group, i: number) {
  const e = g === 'a' ? Math.max(0.4, Math.abs(s.tg.a[i]) * 0.0002) : g === 'p' ? 0.3 : 0.0008;
  return Math.abs(s.x[g][i] - s.tg[g][i]) < e && Math.abs(s.vel[g][i]) < e * 6;
}

/** The scene at `now`: the springs' current values over the day's fixed parts. */
function ridgeFrame(view: HeroView, kinds: Kind[], s: Springs, a: { r0: number; rDur: number }, now: number): RidgeState {
  const rr = a.r0 < 0 ? 1 : outCubic((now - a.r0) / a.rDur);
  const base = staticRidgeState(view, t('homeHeroOf'), t('homeHeroRecovery'));
  return {
    ...base,
    v: s.x.v.map(v => Math.max(0, Math.min(1.08, v))),
    met: s.x.v.map((v, i) => view.pillars[i].met && !view.pillars[i].rest ? smooth(0.955, 0.998, v) : 0),
    tok: view.pillars.map((p, i) => p.rest ? [[t('homeHeroRest'), 'v', 0]] : settled(s, 'a', i) || kinds[i] === 'mask' ? p.arc : tokens(kinds[i], s.x.a[i])),
    pct: view.empty ? '' : String(Math.round(Math.max(0, s.x.p[0]))), r: rr, ta: a.r0 < 0 ? 1 : outCubic(((now - a.r0) / a.rDur - 0.12) / 0.55), f: s.x.f.slice(),
  };
}

export interface RidgeProps { view: HeroView; width: number; colors: Record<string, string>; mode: 'dark' | 'light'; reduceMotion: boolean; calm: boolean; labels: boolean; glow: number; detail?: 0 | 1 | 2;
  /** Told which peak was tapped (Hide numbers shows the numbers on a tap of the hidden food peak). */ onPeak?: (i: number) => void }

export function RidgeHero({ view, width: W, colors, mode, reduceMotion, calm, labels, glow, detail = 1, onPeak }: RidgeProps) {
  const H = HERO_H, K = useMemo(() => ridgeColors(colors, mode), [colors, mode]);
  const [focus, setFocus] = useState(-1);
  const sp = useRef<Springs>({ x: { v: z3(), a: z3(), p: [0], f: [1, 1, 1] }, vel: { v: z3(), a: z3(), p: [0], f: z3() }, tg: { v: z3(), a: z3(), p: [0], f: [1, 1, 1] } });
  const anim = useRef({ raf: 0, last: 0, r0: -1, rDur: 1000, start: z3(), entered: false, dead: false });
  const [, setFrame] = useState(0);
  const kinds = useMemo(() => view.pillars.map((p, i) => { const k = kindOf(p.arc, p.rest); return k === 'rest' ? (['min', 'kcal', 'sleep'] as Kind[])[i] : k; }), [view]);

  const snap = () => { const s = sp.current; for (const g of ['v', 'a', 'p', 'f'] as Group[]) for (let i = 0; i < s.x[g].length; i++) { s.x[g][i] = s.tg[g][i]; s.vel[g][i] = 0; } anim.current.r0 = -1; };
  const kick = () => {
    const a = anim.current;
    if (a.raf || a.dead) return;
    a.last = performance.now();
    const tick = () => {
      a.raf = 0;
      const now = performance.now(), dt = Math.min(0.25, Math.max(0, (now - a.last) / 1000)); a.last = now;
      let moving = stepSprings(sp.current, dt, calm ? 11.5 : 8.4, now, a.start);
      if (a.r0 >= 0 && now - a.r0 < a.rDur) moving = true;
      setFrame(n => n + 1);
      if (moving && !a.dead) a.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const s = sp.current, a = anim.current;
    s.tg.v = view.pillars.map(p => p.rest ? 0 : Math.max(0, Math.min(1.06, p.value)));
    s.tg.a = view.pillars.map(p => amountOf(p.arc, p.rest)); s.tg.p = [view.pct];
    if (!a.entered) {
      a.entered = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reduce Motion snaps the springs held in refs; this one redraw shows the final frame at once.
      if (reduceMotion) { snap(); setFrame(n => n + 1); return; }
      a.rDur = calm ? 720 : 1000; a.r0 = performance.now(); a.start = [0, 1, 2].map(i => a.r0 + 140 + i * 80);
      kick(); return;
    }
    if (reduceMotion) { snap(); setFrame(n => n + 1); return; }
    kick();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    sp.current.tg.f = [0, 1, 2].map(j => focus < 0 || j === focus ? 1 : 0.38);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reduce Motion snaps the springs held in refs; this one redraw shows the final frame at once.
    if (reduceMotion) { snap(); setFrame(n => n + 1); } else kick();
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { anim.current.dead = true; if (anim.current.raf) cancelAnimationFrame(anim.current.raf); }, []);

  // eslint-disable-next-line react-hooks/refs, react-hooks/purity -- by design: the springs live in refs, each frame's setFrame redraws, and the picture is read from them at render time.
  const state = ridgeFrame(view, kinds, sp.current, anim.current, performance.now());
  const xml = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${ridgeScene(W, H, state, K, { uid: 'rg', detail, labels, glow })}</svg>`;
  const { xs, yb } = ridgePeaks(W, H);

  return <View style={{ height: H, marginTop: 2, marginHorizontal: -16, marginBottom: -12 }} testID="home-hero-ridge">
    <View accessible accessibilityRole="summary" accessibilityLabel={view.label} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
      <SvgXml xml={xml} width={W} height={H} />
    </View>
    {/* The peak itself shows the tap: the chosen pillar lights up and the others fade. */}
    {labels ? xs.map((x, i) => <Tappable dim="none" key={i} onPress={() => { onPeak?.(i); setFocus(f => f === i ? -1 : i); }} accessibilityRole="button"
      accessibilityLabel={view.pillars[i].spoken} accessibilityState={{ selected: focus === i }} testID={`home-hero-peak-${view.pillars[i].key}`}
      style={{ position: 'absolute', left: x - 64, top: yb + 20, width: 128, height: 62 }} />) : null}
  </View>;
}
