import { useMemo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { mix, useKit, useSelectionHaptic } from '@/components/kit';
import { tokens } from '@/design/tokens';
import { finite } from './model';
import { fmt } from './format';

/* The design's shared chart forms on Progress: the 270 degree gauge, the segmented meter, and the charts you can read by
   touch (tap or drag; VoiceOver swipes up and down). Every colour is a theme token. Dashed lines are estimates only;
   goals are solid hairlines. */

const r2 = (n: number) => Math.round(n * 100) / 100;
export const SVG_LABEL = { fontFamily: tokens.font.bodyStrong, fontSize: 10.5 } as const;

/* ---------- gauge ---------- */
export function Gauge({ frac, size = 96, sw: swIn, color = 'accent', notch, from, label, children }: {
  frac: number; size?: number; sw?: number; color?: string; /** 0..1, a comparison mark */ notch?: number | null; from?: number | null;
  label: string; children?: ReactNode;
}) {
  const k = useKit(), s = size, sw = swIn ?? Math.max(5, Math.round(s / 11)), tk = s >= 110 ? 8 : s >= 100 ? 6 : 5;
  const R = s / 2 - sw / 2 - tk - 3, cx = s / 2, cy = s / 2 + R * 0.1, f = Math.max(0, Math.min(1, frac || 0)), c = k.tok(color);
  const pt = (t: number, rr: number) => { const a = (135 + 270 * t) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const arc = (t0: number, t1: number) => { const a = pt(t0, R), b = pt(t1, R); return `M${r2(a[0])} ${r2(a[1])}A${R} ${R} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${r2(b[0])} ${r2(b[1])}`; };
  const small = s < 100, ticks: ReactNode[] = [];
  for (let t = 0; t <= 20; t++) {
    const major = t % 5 === 0; if (small && !major) continue;
    const a = pt(t / 20, R + sw / 2 + 3), b = pt(t / 20, R + sw / 2 + 3 + (major ? tk : tk * 0.6)), lit = t / 20 <= f + 1e-6 && f > 0;
    ticks.push(<Line key={t} x1={r2(a[0])} y1={r2(a[1])} x2={r2(b[0])} y2={r2(b[1])} stroke={lit ? c : major ? k.c['text-muted'] : k.c['hair-2']}
      strokeWidth={major ? 1.5 : 1} strokeLinecap="round" opacity={lit && !major ? 0.7 : 1} />);
  }
  const m0 = notch != null ? pt(notch, R - sw / 2 - 3) : null, m1 = notch != null ? pt(notch, R + sw / 2 + 3) : null;
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: s, height: s }}>
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ overflow: 'visible' }}>
      {ticks}
      <Path d={arc(0, 1)} fill="none" stroke={mix(c, k.c['surface-2'], 0.16)} strokeWidth={sw} strokeLinecap="round" />
      {f > 0.004 && <Path d={arc(0, Math.max(f, 0.012))} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" />}
      {from != null && from > 0.004 && from < f && <Path d={arc(0, from)} fill="none" stroke={mix(c, k.c.surface, 0.45)} strokeWidth={sw} strokeLinecap="round" />}
      {m0 && m1 && <>
        <Line x1={r2(m0[0])} y1={r2(m0[1])} x2={r2(m1[0])} y2={r2(m1[1])} stroke={k.c.surface} strokeWidth={5} strokeLinecap="round" />
        <Line x1={r2(m0[0])} y1={r2(m0[1])} x2={r2(m1[0])} y2={r2(m1[1])} stroke={k.c.text} strokeWidth={2} strokeLinecap="round" />
      </>}
    </Svg>
    {children ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: Math.round(R * 0.2) }}>{children}</View> : null}
  </View>;
}

/* ---------- segmented meter ---------- */
export type Cell = 1 | 0 | 'now' | 'dim' | number;
export function meter(frac: number, n: number): Cell[] {
  const x = Math.max(0, Math.min(1, frac)) * n, out: Cell[] = [];
  for (let i = 0; i < n; i++) out.push(x >= i + 1 ? 1 : x > i ? x - i : 0);
  return out;
}
export function Cells({ states, color = 'accent', h = 8, gap = 3, r = 2.5, label }: { states: Cell[]; color?: string; h?: number; gap?: number; r?: number; label?: string }) {
  const k = useKit(), c = k.tok(color);
  const off = k.dark ? mix(c, k.c['surface-2'], 0.15) : mix(c, k.fill, 0.14), dim = mix(c, k.c['surface-2'], 0.55);
  return <View accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label} importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    style={{ flexDirection: 'row', alignItems: 'center', gap }}>
    {states.map((v, i) => <View key={i} style={{ flex: 1, minWidth: 0, height: h, borderRadius: r, overflow: 'hidden',
      backgroundColor: v === 1 ? c : v === 'now' ? 'transparent' : v === 'dim' ? dim : off, borderWidth: v === 'now' ? 1.5 : 0, borderColor: c }}>
      {typeof v === 'number' && v > 0 && v < 1 ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round(v * 100)}%`, backgroundColor: c }} /> : null}
    </View>)}
  </View>;
}

/* ---------- charts ---------- */
const niceStep = (x: number) => { const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
export interface ChartProps {
  values: (number | null)[]; kind: 'line' | 'bar' | 'heat' | 'dots'; color?: string; W?: number; H?: number; mini?: boolean;
  ticks?: string[] | null; labels?: string[]; sl?: string[] | null; fmt?: (v: number | null) => string;
  goal?: number | null; goalL?: string | null; band?: readonly [number, number] | null; base?: number | null;
  est?: number; partial?: number; sel?: number; axis?: boolean; tick?: (v: number) => string; live?: boolean; vals?: boolean;
  vfmt?: (v: number) => string; project?: { to: number; label: string; tick?: string } | null;
  /** Spoken name of a readable chart. */ label?: string; onSel?: (i: number, v: number | null) => void;
}
interface Geo { X: (i: number) => number; Y: (v: number) => number; top: number; bot: number; PW: number; hx: number; n: number; bar: boolean; W: number; H: number }

function geometry(o: ChartProps): Geo & { lo: number; hi: number; step: number } {
  const v = o.values, n = v.length, W = o.W ?? 329, H = o.H ?? 160, mini = !!o.mini, bar = o.kind === 'bar';
  const top = mini ? 4 : 32, bot = o.ticks ? 20 : 3, right = o.axis ? 34 : 0, PW = W - right;
  let nn = v.filter(finite); if (!nn.length) nn = [0, 1];
  let lo = Math.min(...nn), hi = Math.max(...nn);
  if (o.goal != null && !(mini && bar && o.goal > hi * 1.5)) { lo = Math.min(lo, o.goal); hi = Math.max(hi, o.goal); }
  if (o.project) { lo = Math.min(lo, o.project.to); hi = Math.max(hi, o.project.to); }
  if (o.band) { lo = Math.min(lo, o.band[0]); hi = Math.max(hi, o.band[1]); }
  let step = 0;
  if (o.kind === 'dots') { const b = o.base ?? (o.band ? (o.band[0] + o.band[1]) / 2 : o.goal); if (b != null) { const dd = Math.max(Math.abs(hi - b), Math.abs(lo - b)) || 1; lo = b - dd; hi = b + dd; } }
  if (bar) { lo = 0; hi = hi * 1.08 || 1; if (o.axis) { step = niceStep(hi / 3); hi = Math.max(hi, Math.ceil(hi / step) * step); } }
  else { const sp = (hi - lo) || 1; lo -= sp * 0.16; hi += sp * 0.16; if (o.axis) step = niceStep((hi - lo) / 3); }
  const ih = H - top - bot, hx = o.project ? PW * 0.7 : PW;
  const X = bar || o.kind === 'heat' || o.kind === 'dots' ? (i: number) => (hx / n) * (i + 0.5) : (i: number) => n < 2 ? hx / 2 : 8 + (hx - 16) * i / (n - 1);
  const Y = (x: number) => top + ih * (1 - (x - lo) / (hi - lo));
  return { X, Y, top, bot, PW, hx, n, bar, W, H, lo, hi, step };
}

/** A chart. `mini` draws it small with no cursor (tiles); otherwise it reads by touch and VoiceOver. */
export function Chart(o: ChartProps) {
  const k = useKit(), col = k.tok(o.color ?? 'accent'), mini = !!o.mini, v = o.values;
  const g = useMemo(() => geometry(o), [o]);
  const { X, Y, top, bot, PW, hx, n, bar, W, H } = g;
  const nowI = n - 1;
  const [sel, setSelState] = useState<number>(() => o.sel ?? nowI);
  const [id] = useState(() => `pg${Math.random().toString(36).slice(2, 8)}`);
  const [width, setWidth] = useState(W);
  const selectionTick = useSelectionHaptic();
  const select = (i: number, tick = true) => {
    const next = Math.max(0, Math.min(n - 1, i));
    if (next !== sel) { setSelState(next); if (tick) selectionTick(); }
    o.onSel?.(next, v[next]);
  };
  const els: ReactNode[] = [];
  const text = (key: string, x: number, y: number, s: string, anchor: 'start' | 'middle' | 'end' = 'middle', fill = k.c['text-muted'], extra?: object) =>
    <SvgText key={key} x={x} y={y} textAnchor={anchor} {...SVG_LABEL} fill={fill} {...extra}>{s}</SvgText>;

  if (o.axis && g.step) for (let t = Math.ceil(g.lo / g.step) * g.step, j = 0; t <= g.hi + 1e-9; t += g.step, j++) {
    const ty = Y(t); if (ty < top - 2 || ty > H - bot + 1) continue;
    els.push(<Line key={`ax${j}`} x1={0} x2={PW} y1={ty} y2={ty} stroke={k.c.hair} />, text(`at${j}`, W - 2, ty + 3.5, o.tick ? o.tick(t) : fmt(t, g.step < 1 ? 1 : 0), 'end'));
  }
  if (o.band && o.kind !== 'heat') {
    const b1 = Y(o.band[1]), b0 = Y(o.band[0]);
    els.push(<Rect key="band" x={0} y={b1} width={PW} height={b0 - b1} rx={6} fill={col} opacity={0.11} />);
    if (!mini) els.push(text('bandl', 6, b1 + 12, 'Usual range', 'start', col));
  }
  if (o.goal != null && o.kind !== 'dots' && o.kind !== 'heat') {
    const gy = Y(o.goal);
    if (gy >= top - 4 && gy <= H - bot) {
      els.push(<Line key="goal" x1={0} x2={PW} y1={gy} y2={gy} stroke={k.c.ghost} strokeWidth={1} opacity={0.7} />);
      if (!mini && o.goalL) els.push(text('gls', 4, gy - 6, o.goalL, 'start', k.c.surface, { stroke: k.c.surface, strokeWidth: 4, strokeLinejoin: 'round' }), text('gl', 4, gy - 6, o.goalL, 'start', k.c.text));
    }
  }
  if (o.kind === 'heat') {
    const cw = hx / n, gp = n > 14 ? 2 : 4, ch = H - top - bot, nn = v.filter(finite);
    const nlo = Math.min(...nn) * 0.9, nhi = Math.max(...nn), showV = n <= 7 && cw - gp >= 28 && ch >= 22;
    v.forEach((x, i) => {
      const x0 = cw * i + gp / 2, w2 = cw - gp, part = i === o.partial || (o.live && i === nowI), rx = Math.min(7, w2 / 3);
      if (x == null) { els.push(<Rect key={`h${i}`} x={x0} y={top} width={w2} height={ch} rx={rx} fill="none" stroke={k.c['hair-2']} strokeDasharray="2 3" />); return; }
      const kk = Math.max(0, Math.min(1, (x - nlo) / ((nhi - nlo) || 1))), op = 0.16 + 0.84 * kk;
      els.push(<Rect key={`h${i}`} x={x0} y={top} width={w2} height={ch} rx={rx} fill={col} fillOpacity={part ? op * 0.45 : op} stroke={part ? col : undefined} strokeWidth={part ? 1.5 : 0} />);
      if (showV) els.push(<SvgText key={`hv${i}`} x={x0 + w2 / 2} y={top + ch / 2 + 4.5} textAnchor="middle" fontFamily={tokens.font.numeral} fontSize={13}
        fill={!part && op > 0.62 ? k.c.surface : k.c.text}>{o.vfmt ? o.vfmt(x) : fmt(x)}</SvgText>);
    });
  } else if (o.kind === 'dots') {
    const base = o.base ?? (o.band ? (o.band[0] + o.band[1]) / 2 : o.goal) ?? 0, by = Y(base);
    els.push(<Line key="base" x1={0} x2={PW} y1={by} y2={by} stroke={k.c['hair-2']} />);
    v.forEach((x, i) => {
      if (x == null) return;
      const cx = X(i), cy = Y(x), part = i === o.partial, last = i === nowI, r0 = mini ? (n > 14 ? 2 : 3.2) : 4.5;
      els.push(<Line key={`ds${i}`} x1={cx} x2={cx} y1={by} y2={cy} stroke={col} strokeOpacity={last ? 1 : 0.5} strokeWidth={n > 14 ? 1.25 : 1.75} strokeLinecap="round" strokeDasharray={part ? '2 3' : undefined} />);
      els.push(<Circle key={`dc${i}`} cx={cx} cy={cy} r={last ? r0 + 0.8 : r0} fill={part ? k.c.surface : col} fillOpacity={part || last ? 1 : 0.75} stroke={part ? col : undefined} strokeWidth={part ? 1.5 : 0} />);
      if (o.vals && mini) els.push(<SvgText key={`dv${i}`} x={cx} y={x >= base ? cy - 8 : cy + 15} textAnchor="middle" fontFamily={tokens.font.numeral} fontSize={11} fill={last ? k.c.text : k.c['text-muted']}>{fmt(x)}</SvgText>);
    });
  } else if (bar) {
    const bw = Math.max(3, Math.min(26, (hx / n) * 0.6)), ih = H - top - bot;
    if (n <= 12) v.forEach((_, i) => els.push(<Rect key={`bb${i}`} x={X(i) - bw / 2} y={top} width={bw} height={ih} rx={Math.min(5, bw / 2)} fill={col} fillOpacity={0.08} />));
    v.forEach((x, i) => {
      const cx = X(i);
      if (x == null) { els.push(<Circle key={`b${i}`} cx={cx} cy={H - bot - 2} r={1.6} fill={k.c['hair-2']} />); return; }
      const h = Math.max(x > 0 ? 3 : 0, (x - g.lo) / (g.hi - g.lo) * ih), on = mini ? i === nowI : i === sel, part = i === o.partial;
      els.push(<Rect key={`b${i}`} x={cx - bw / 2} y={H - bot - h} width={bw} height={h} rx={Math.min(5, bw / 2)} fill={col}
        opacity={mini ? (part ? (on ? 0.55 : 0.3) : on ? 1 : 0.45) : (on ? (part ? 0.6 : 1) : (part ? 0.3 : 0.45))} />);
    });
  } else {
    const segs: [number, number][][] = []; let cur: [number, number][] = [];
    v.forEach((x, i) => { if (x == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(x)]); });
    if (cur.length) segs.push(cur);
    const est = o.est ?? 0, pts = (p: [number, number][]) => p.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L');
    els.push(<Defs key="defs"><LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={col} stopOpacity={0.24} /><Stop offset="1" stopColor={col} stopOpacity={0} /></LinearGradient></Defs>);
    segs.forEach((sg, si) => {
      const solid = si === segs.length - 1 && est ? sg.slice(0, sg.length - est) : sg, d = `M${pts(solid)}`;
      if (solid.length > 1) els.push(<Path key={`fa${si}`} d={`${d}L${solid[solid.length - 1][0].toFixed(1)} ${H - bot}L${solid[0][0].toFixed(1)} ${H - bot}Z`} fill={`url(#${id}g)`} />);
      els.push(<Path key={`ln${si}`} d={d} fill="none" stroke={col} strokeWidth={mini ? 2 : 2.4} strokeLinejoin="round" strokeLinecap="round" />);
      if (solid.length === 1 && segs.length > 1) els.push(<Circle key={`lp${si}`} cx={solid[0][0]} cy={solid[0][1]} r={2} fill={col} />);
      if (si === segs.length - 1 && est) els.push(<Path key="est" d={`M${pts(sg.slice(sg.length - est - 1))}`} fill="none" stroke={col} strokeWidth={2.2} strokeDasharray="4 5" strokeLinecap="round" />);
    });
    let li = n - 1; while (li > 0 && v[li] == null) li--;
    const lv = v[li];
    if ((mini || o.project) && lv != null) els.push(<Circle key="last" cx={X(li)} cy={Y(lv)} r={3.6} fill={col} stroke={k.c.surface} strokeWidth={2} />);
    if (o.project && lv != null) {
      const px = PW - 6, py = Y(o.project.to), lx = X(li), ly = Y(lv);
      els.push(<Line key="pv" x1={lx} x2={lx} y1={top} y2={H - bot} stroke={k.c['hair-2']} />,
        <Path key="pp" d={`M${lx.toFixed(1)} ${ly.toFixed(1)}L${px} ${py.toFixed(1)}`} fill="none" stroke={col} strokeWidth={2.2} strokeDasharray="4 5" strokeLinecap="round" opacity={0.9} />,
        <Circle key="pc" cx={px} cy={py} r={4} fill={k.c.surface} stroke={col} strokeWidth={2} />,
        text('pt', px, py - 9, o.project.label, 'end', k.c.text));
    }
  }
  if (o.ticks) o.ticks.forEach((tk, i) => {
    if (!tk) return;
    const tx = X(i), an = !bar && o.kind === 'line' && tx < 18 ? 'start' : (!bar && o.kind === 'line' && tx > hx - 18 ? 'end' : 'middle');
    els.push(text(`t${i}`, tx, H - 4, tk, an, i === (mini ? nowI : -1) ? k.c.text : k.c['text-muted']));
  });
  if (o.project?.tick && o.ticks) els.push(text('ptk', PW - 2, H - 4, o.project.tick, 'end'));

  const valueText = (i: number) => o.fmt ? o.fmt(v[i]) : v[i] == null ? 'No data' : fmt(v[i] as number);
  if (!mini) {
    const x = X(sel), val = v[sel], txt = `${o.sl ? o.sl[sel] + '  ' : ''}${valueText(sel)}`, tw = txt.length * 6.1 + 18, bx = Math.max(tw / 2, Math.min(W - tw / 2, x));
    els.push(<G key="cur">
      <Line x1={x} x2={x} y1={top - 4} y2={H - bot} stroke={k.c.text} strokeOpacity={0.28} strokeWidth={1} />
      {!bar && val != null && <Circle cx={x} cy={Y(val)} r={5.5} fill={col} stroke={k.c.surface} strokeWidth={2.5} />}
      <Rect x={bx - tw / 2} y={0} width={tw} height={22} rx={8} fill={k.c['surface-2']} />
      <SvgText x={bx} y={15} textAnchor="middle" fontFamily={tokens.font.numeral} fontSize={11} fill={k.c.text}>{txt}</SvgText>
    </G>);
  }
  const svg = <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>{els}</Svg>;
  if (mini) return <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: '100%', aspectRatio: W / H }}>{svg}</View>;

  const pick = (px: number) => {
    const x = px * W / (width || W);
    select(bar || o.kind === 'heat' || o.kind === 'dots' ? Math.floor(x / (hx / n)) : Math.round((x - 8) / (hx - 16) * (n - 1)));
  };
  const tap = Gesture.Tap().runOnJS(true).onEnd(e => pick(e.x));
  const pan = Gesture.Pan().runOnJS(true).activeOffsetX([-6, 6]).failOffsetY([-12, 12]).onBegin(e => pick(e.x)).onUpdate(e => pick(e.x));
  return <GestureDetector gesture={Gesture.Race(pan, tap)}>
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable"
      accessibilityLabel={`${o.label ?? 'Chart'}. Swipe up or down to move between points.`}
      accessibilityValue={{ text: `${o.labels ? o.labels[sel] + ', ' : ''}${valueText(sel)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => select(sel + (e.nativeEvent.actionName === 'increment' ? 1 : -1), false)}
      style={{ width: '100%', aspectRatio: W / H }}>
      {svg}
    </View>
  </GestureDetector>;
}
