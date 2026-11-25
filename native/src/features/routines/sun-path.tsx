import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { useKit } from '@/components/kit';
import { tokens } from '@/design/tokens';
import { hax, rItems, todayItems, type Now, type RoutinesState, isDone, isPaused } from './model';

/* The sun path (`sunPath` in the mockup): 5 AM to 11 PM on one arc, each routine's window a coloured stretch of it,
   each item a marker at its time, the sun at now. Drawn in a 292 x 162 box and scaled to the width it is given. */

const VB_W = 292, VB_H = 162;
export const spX = (h: number) => 18 + ((h - 5) * 256) / 18;
const spY = (x: number) => { const d = (x - 146) / 128; return 122 - 96 * Math.sqrt(Math.max(0, 1 - d * d)); };
export const spP = (h: number): [number, number] => { const x = spX(Math.max(5, Math.min(23, h))); return [x, spY(x)]; };
const arcD = (h1: number, h2: number) => { const a = spP(h1), b = spP(h2); return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} A128 96 0 0 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}`; };

export function SunPath({ s, n, width, only, big, caps, small, label }: {
  s: RoutinesState; n: Now; width: number;
  /** Draw only this routine (the detail screen). */
  only?: string; big: string; caps?: string; small?: boolean; label: string;
}) {
  const k = useKit(), c = k.c, gid = `rtsky${useId().replace(/[^a-z0-9]/gi, '')}`;
  const now = Math.max(5, Math.min(23, n.h));
  const rs = s.routines.filter(r => !only || r.id === only);
  const its = (only ? rItems(s, only, n) : todayItems(s, n)).slice().sort((a, b) => a.h - b.h);
  const groups: { rid: string; items: typeof its }[] = [];
  its.forEach(i => {
    const g = groups[groups.length - 1], p = spP(i.h), rid = i.routines[0];
    if (g && g.rid === rid) { const q = spP(g.items[g.items.length - 1].h); if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 11) { g.items.push(i); return; } }
    groups.push({ rid, items: [i] });
  });
  const colorOf = (rid: string) => c[s.routines.find(r => r.id === rid)?.color ?? 'sleep'];
  const sun = spP(now), height = (width * VB_H) / VB_W;
  const ticks = [];
  for (let h = 5; h <= 23; h++) {
    const x = spX(h), mj = (h - 5) % 3 === 0;
    ticks.push(<Line key={`t${h}`} x1={x} y1={125} x2={x} y2={mj ? 132 : 128} stroke={c['hair-2']} strokeWidth={1.6} strokeLinecap="round" opacity={h < now ? 0.4 : 1} />);
    if (mj) ticks.push(<SvgText key={`l${h}`} x={x} y={144} fill={c['text-muted']} fontFamily={tokens.font.bodyStrong} fontSize={10} letterSpacing={0.2} textAnchor="middle">{hax(h)}</SvgText>);
  }
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height }}>
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ overflow: 'visible' }}>
      <Defs><LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={c.warning} stopOpacity={0.12} /><Stop offset="1" stopColor={c.warning} stopOpacity={0} /></LinearGradient></Defs>
      <Path d="M18 122 A128 96 0 0 1 274 122 Z" fill={`url(#${gid})`} />
      <Path d="M18 122 A128 96 0 0 1 274 122" fill="none" stroke={c['hair-2']} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
      <Path d={arcD(5, now)} fill="none" stroke={c['text-muted']} strokeWidth={2} opacity={0.7} />
      {rs.map(r => {
        const paused = isPaused(r, n.day);
        return <Path key={r.id} d={arcD(r.from, Math.min(23, r.to))} fill="none" stroke={c[r.color]} strokeWidth={only ? 7 : 5} strokeLinecap="round"
          opacity={paused ? 0.3 : 1} strokeDasharray={paused ? '2 5' : undefined} />;
      })}
      {groups.map((g, gi) => {
        const col = colorOf(g.rid), cnt = g.items.length, done = g.items.filter(i => isDone(s, n, i)).length;
        const h = g.items.reduce((a, i) => a + i.h, 0) / cnt, [x, y] = spP(h);
        return <G key={gi}>
          <Line x1={x} y1={122} x2={x} y2={y + (cnt > 1 ? 9 : 7)} stroke={c['hair-2']} strokeWidth={1.2} opacity={0.7} />
          {cnt === 1 ? <>
            <Circle cx={x} cy={y} r={5.8} fill={c.surface} />
            {done ? <Circle cx={x} cy={y} r={4.4} fill={col} /> : <Circle cx={x} cy={y} r={3.5} fill={c.surface} stroke={col} strokeWidth={1.6} />}
          </> : <>
            <Circle cx={x} cy={y} r={8.6} fill={c.surface} />
            <Circle cx={x} cy={y} r={6.9} fill={done === cnt ? col : c.surface} stroke={done === cnt ? undefined : col} strokeWidth={1.6} />
            <SvgText x={x} y={y + 2.9} fill={done === cnt ? c.surface : col} fontFamily={tokens.font.heading} fontSize={8} textAnchor="middle">{cnt}</SvgText>
          </>}
        </G>;
      })}
      <Line x1={10} y1={122} x2={282} y2={122} stroke={c['text-muted']} strokeWidth={1.4} />
      {ticks}
      <Line x1={sun[0]} y1={120} x2={sun[0]} y2={134} stroke={c.text} strokeWidth={2.5} strokeLinecap="round" />
      {Array.from({ length: 12 }, (_, j) => {
        const a = (j * Math.PI) / 6, r2 = j % 3 === 0 ? 17 : 15;
        return <Line key={`r${j}`} x1={sun[0] + 12 * Math.cos(a)} y1={sun[1] + 12 * Math.sin(a)} x2={sun[0] + r2 * Math.cos(a)} y2={sun[1] + r2 * Math.sin(a)} stroke={c.warning} strokeWidth={2} strokeLinecap="round" />;
      })}
      <Circle cx={sun[0]} cy={sun[1]} r={8.5} fill={c.warning} stroke={c.surface} strokeWidth={3} />
      <Path d="M281 104.5a6 6 0 1 1-7.4-7.4 4.8 4.8 0 0 0 7.4 7.4z" fill={c['text-muted']} />
      <SvgText x={146} y={only ? 92 : 86} fill={c.text} fontFamily={tokens.font.heading} fontSize={small ? 19 : 36} letterSpacing={small ? -0.3 : -1.44} textAnchor="middle">{big}</SvgText>
      {caps ? <SvgText x={146} y={106} fill={c['text-muted']} fontFamily={tokens.font.heading} fontSize={10.5} letterSpacing={1.68} textAnchor="middle">{caps}</SvgText> : null}
    </Svg>
  </View>;
}

/** A routine's window on a tiny arc (`thumb`), for the Edit routines rows and the overview tile. */
export function Thumb({ from, to, color, w = 48, h = 30, tile }: { from: number; to: number; color: string; w?: number; h?: number; tile?: boolean }) {
  const k = useKit();
  if (tile) {
    const X = (v: number) => 3 + ((v - 5) * 38) / 18, Y = (x: number) => { const q = (x - 22) / 19; return 24 - 18 * Math.sqrt(Math.max(0, 1 - q * q)); };
    const a = X(from), b = X(Math.min(23, to));
    return <Svg width={44} height={28} viewBox="0 0 44 28" style={{ overflow: 'visible' }}>
      <Path d="M3 24 A19 18 0 0 1 41 24" fill="none" stroke={k.tint(k.c['text-muted'], 0.22)} strokeWidth={3} strokeLinecap="round" />
      <Path d={`M${a.toFixed(1)} ${Y(a).toFixed(1)} A19 18 0 0 1 ${b.toFixed(1)} ${Y(b).toFixed(1)}`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
    </Svg>;
  }
  const X = (v: number) => 3 + ((v - 5) * 42) / 18, Y = (x: number) => { const d = (x - 24) / 21; return 25 - 19 * Math.sqrt(Math.max(0, 1 - d * d)); };
  const a = X(from), b = X(Math.min(23, to));
  return <Svg width={w} height={h} viewBox="0 0 48 30" style={{ overflow: 'visible' }}>
    <Path d="M3 25 A21 19 0 0 1 45 25" fill="none" stroke={k.c['surface-2']} strokeWidth={3} strokeLinecap="round" />
    <Line x1={1} y1={25} x2={47} y2={25} stroke={k.c['hair-2']} strokeWidth={1} />
    <Path d={`M${a.toFixed(1)} ${Y(a).toFixed(1)} A21 19 0 0 1 ${b.toFixed(1)} ${Y(b).toFixed(1)}`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
  </Svg>;
}
