import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Icon, font, mix, useKit, type IconName } from '@/components/kit';
import type { Pose } from '../model';

/* The small pieces the Progress tiles and screens are drawn from (the mockup's .prt-* classes). */

const tab = { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] };

/** A big number with its unit after it in small grey type (.prt-n). */
export function Num({ v, unit, fs = 32, color, units }: { v: string | number; unit?: string; fs?: number; color?: string; units?: (readonly [string, string])[] }) {
  const k = useKit(), us = fs <= 22 ? Math.max(11, fs * 0.52) : 13;
  // Inline text takes no margins, so the mockup's 1 to 4 pt gaps around a unit are thin spaces.
  const small = (s: string, key?: string, before = '\u200A', after = '') =>
    <Text key={key} style={[font(600, us, 1), { color: k.c['text-muted'], letterSpacing: 0 }]}>{before}{s}{after}</Text>;
  return <Text numberOfLines={1} style={[font(700, fs, 1, -0.03), tab, { color: color ?? k.c.text }]}>
    {units ? units.map(([n, u], i) => <Text key={i}>{n}{small(u, `u${i}`, '', i < units.length - 1 ? '\u2009' : '')}</Text>) : <>{v}{unit ? small(unit) : null}</>}
  </Text>;
}
/** Hours and minutes as "6h 53m" in the big number style. */
export const HM = ({ min, fs = 32 }: { min: number; fs?: number }) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return <Num v="" fs={fs} units={[[String(h), 'h'], [String(m), 'm']]} />;
};
/** "No data" in the place of a number: a missing reading is never shown as 0. */
export const NoData = ({ fs = 32, text }: { fs?: number; text: string }) => { const k = useKit(); return <Text numberOfLines={1} style={[font(700, fs, 1, -0.03), { color: k.c['text-muted'] }]}>{text}</Text>; };

/** A grey line (.prt-s); `wrap` lets it run onto more lines. */
export function Sub({ children, wrap, style, color, size = 12.5 }: { children: ReactNode; wrap?: boolean; style?: StyleProp<TextStyle>; color?: string; size?: number }) {
  const k = useKit();
  return <Text numberOfLines={wrap ? undefined : 1} style={[font(500, size, 1.35), { color: color ?? k.c['text-muted'] }, style]}>{children}</Text>;
}
/** Bold text inside a grey line. */
export const B = ({ children }: { children: ReactNode }) => { const k = useKit(); return <Text style={[font(600, 12.5), tab, { color: k.c.text }]}>{children}</Text>; };
/** A title line (.prt-t). */
export function T({ children, style, size = 14, wrap }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; wrap?: boolean }) {
  const k = useKit();
  return <Text numberOfLines={wrap ? undefined : 1} style={[font(600, size, 1.25), { color: k.c.text }, style]}>{children}</Text>;
}
/** A small caps label (.prt-k). */
export const K = ({ children, color }: { children: ReactNode; color?: string }) => { const k = useKit(); return <Text numberOfLines={1} style={[font(700, 11, 1, 0.1), { color: color ?? k.c['text-muted'], textTransform: 'uppercase' }]}>{children}</Text>; };
/** A small value (.prt-v). */
export function V({ v, unit, fs = 18 }: { v: string; unit?: string; fs?: number }) {
  const k = useKit();
  return <Text numberOfLines={1} style={[font(700, fs, 1.1, -0.01), tab, { color: k.c.text }]}>{v}{unit ? <Text style={[font(600, 11), { color: k.c['text-muted'] }]}>{'\u200A'}{unit}</Text> : null}</Text>;
}
export const Hair = ({ style }: { style?: StyleProp<ViewStyle> }) => { const k = useKit(); return <View style={[{ height: 1, backgroundColor: k.c.hair }, style]} />; };
export const Spacer = () => <View style={{ flex: 1, minWidth: 0 }} />;
export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }, style]}>{children}</View>;

/** Columns split by hairlines (.prt-cols). */
export function Cols({ children, style }: { children: ReactNode[]; style?: StyleProp<ViewStyle> }) {
  const k = useKit(), n = children.length;
  return <View style={[{ flexDirection: 'row' }, style]}>{children.map((c, i) =>
    <View key={i} style={{ flex: 1, minWidth: 0, paddingLeft: i ? 10 : 0, paddingRight: i < n - 1 ? 10 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: k.c.hair }}>{c}</View>)}</View>;
}

/** A scale: a neutral track, the usual range tinted and the value as a marker (.prt-sc). */
export function Scale({ v, lo, hi, band, color }: { v: number; lo: number; hi: number; band?: readonly [number, number] | null; color?: string }) {
  const k = useKit(), pc = k.tok(color ?? 'recovery'), p = (x: number) => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
  return <View style={{ height: 14 }} importantForAccessibility="no-hide-descendants">
    <View style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 4, borderRadius: 2, backgroundColor: mix(k.c.text, 'transparent', 0.1) }} />
    {band ? <View style={{ position: 'absolute', top: 4, height: 6, borderRadius: 3, left: `${p(band[0])}%`, width: `${p(band[1]) - p(band[0])}%`, backgroundColor: mix(pc, 'transparent', 0.34), borderWidth: 1, borderColor: mix(pc, 'transparent', 0.55) }} /> : null}
    <View style={{ position: 'absolute', top: 0, width: 4, height: 14, marginLeft: -2, left: `${p(v)}%`, borderRadius: 2, backgroundColor: pc, boxShadow: `0px 0px 0px 2px ${k.c.surface}` }} />
  </View>;
}
/** A filled bar on a track, with an optional mark (.prt-bar). */
export function Bar({ frac, color, mark, h = 8, track }: { frac: number; color?: string; mark?: number | null; h?: number; track?: string }) {
  const k = useKit(), pc = k.tok(color ?? 'accent'), c = (x: number) => Math.max(0, Math.min(1, x)) * 100;
  return <View style={{ height: h, borderRadius: h / 2, backgroundColor: track ?? mix(pc, k.dark ? k.c['surface-2'] : k.c.bg, k.dark ? 0.14 : 0.12) }} importantForAccessibility="no-hide-descendants">
    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${c(frac)}%`, borderRadius: h / 2, backgroundColor: pc }} />
    {mark != null ? <View style={{ position: 'absolute', top: -3, bottom: -3, width: 2, marginLeft: -1, left: `${c(mark)}%`, borderRadius: 1, backgroundColor: k.c.text, opacity: 0.6 }} /> : null}
  </View>;
}
/** A stacked bar (.prt-stack). */
export function Stack({ parts, h = 10 }: { parts: { color: string; frac?: number }[]; h?: number }) {
  return <View style={{ flexDirection: 'row', gap: 2, height: h, borderRadius: h / 2, overflow: 'hidden' }}>{parts.map((p, i) =>
    <View key={i} style={[{ height: '100%', backgroundColor: p.color }, p.frac == null ? { flex: 1 } : { width: `${p.frac * 100}%` }]} />)}</View>;
}
/** A legend (.prt-lg). */
export function Legend({ items, style, between }: { items: { color?: string; label: string; value?: string }[]; style?: StyleProp<ViewStyle>; between?: boolean }) {
  const k = useKit();
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }, between && { justifyContent: 'space-between' }, style]}>{items.map((x, i) =>
    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {x.color ? <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: x.color }} /> : null}
      <Text style={[font(600, 11, 1.2), { color: k.c['text-muted'] }]}>{x.label}{x.value != null ? <Text style={[font(700, 11), tab, { color: k.c.text }]}> {x.value}</Text> : null}</Text>
    </View>)}</View>;
}
/** A small grey pill with a number (.prt-chip). */
export const Chip = ({ text }: { text: string }) => { const k = useKit(); return <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 999, justifyContent: 'center', backgroundColor: mix(k.c.text, 'transparent', 0.07) }}><Text style={[font(700, 11), tab, { color: k.c['text-muted'] }]}>{text}</Text></View>; };

/** A goal ruler: the line filled to now, quarter ticks and a ring at now (.prt-ru). */
export function Ruler({ frac, color, ticks = true }: { frac: number; color?: string; ticks?: boolean }) {
  const k = useKit(), pc = k.tok(color ?? 'recovery'), f = Math.max(0, Math.min(1, frac)) * 100;
  return <View style={{ height: 28 }} importantForAccessibility="no-hide-descendants">
    <View style={{ position: 'absolute', left: 0, right: 0, top: 9, height: 6, borderRadius: 3, backgroundColor: mix(pc, k.dark ? k.c['surface-2'] : k.c.bg, k.dark ? 0.14 : 0.12) }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${f}%`, borderRadius: 3, backgroundColor: pc }} />
      {ticks ? [25, 50, 75].map(t => <View key={t} style={{ position: 'absolute', top: -4, width: 2, height: 14, marginLeft: -1, left: `${t}%`, borderRadius: 1, backgroundColor: mix(k.c.text, 'transparent', 0.22) }} />) : null}
    </View>
    <View style={{ position: 'absolute', top: 5, width: 14, height: 14, marginLeft: -7, left: `${f}%`, borderRadius: 7, backgroundColor: k.c.surface, borderWidth: 3.5, borderColor: pc, boxShadow: `0px 0px 0px 2px ${k.c.surface}` }} />
  </View>;
}
/** The three labels under a ruler. */
export function RulerLabels({ items }: { items: ReactNode[] }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{items.map((x, i) => <Text key={i} style={[font(600, 11), { color: k.c['text-muted'] }]}>{x}</Text>)}</View>;
}
export const RB = ({ children }: { children: ReactNode }) => { const k = useKit(); return <Text style={[font(700, 11), tab, { color: k.c.text }]}>{children}</Text>; };

/** A tile's own header, for a tile whose colour follows an option (.prt-hd). */
export function Head({ icon, title, meta, color }: { icon: string; title: string; meta?: string; color: string }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 20, marginBottom: 6 }}>
    <Icon name={icon as IconName} size={18} color={color} />
    <Text numberOfLines={1} style={[font(600, 14, 20 / 14), { color: k.c.text, flexShrink: 1 }]}>{title}</Text>
    {meta ? <Text numberOfLines={1} style={[font(500, 13, 20 / 13), { color: k.c['text-muted'], marginLeft: 'auto', paddingLeft: 4 }]}>{meta}</Text> : null}
  </View>;
}

/** A round-cornered square with an icon (.prt-ic). */
export const IconTile = ({ icon, color }: { icon: string; color: string }) => { const k = useKit(), c = k.tok(color); return <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(c, 'transparent', 0.15) }}><Icon name={icon as IconName} size={17} color={c} /></View>; };

/* ---------- progress photos ---------- */
/** The placeholder figure the sample photos and the camera's ghost are drawn with. */
export function Figure({ pose, w = 15.5, ghost, style }: { pose: Pose; w?: number; ghost?: boolean; style?: StyleProp<ViewStyle> }) {
  const k = useKit(), f = (x: number) => x.toFixed(1);
  const fill = ghost ? 'none' : mix(k.c.text, 'transparent', 0.22), stroke = ghost ? mix(k.pillInk, 'transparent', 0.62) : mix(k.c.text, 'transparent', 0.3), sw = ghost ? 1.1 : 0.8;
  let body: ReactNode;
  if (pose === 'Side') {
    const bx = 58 + (w - 14) * 1.6;
    body = <><Circle cx={51} cy={19} r={10.5} /><Path d={`M47 29L55 29L55.5 35Q62 37 63 46Q${f(bx + 1)} 58 ${f(bx)} 72Q62 84 60 92L58 136Q58 139 55 139L48 139Q45 139 45.5 136L44 92Q41 80 41.5 66Q41 50 43 42Q44 36 47 35Z`} />
      <Path d="M51 42Q47 60 49.5 82" fill="none" strokeLinecap="round" strokeWidth={sw * 1.3} /></>;
  } else {
    const L = 50 - w - 2.5, R = 50 + w + 2.5;
    body = <><Circle cx={50} cy={19} r={10.5} /><Path d={`M45 29L45 34Q34 35 28.5 39Q25 41 24.6 46L21.2 79Q21 83 23.4 83Q25.5 83 25.8 80L29.5 52Q30.5 62 ${f(L)} 72Q${f(L - 0.8)} 80 ${f(L - 0.6)} 88L35 136Q35 139 38 139L45 139Q47 139 47.2 136L50 100L52.8 136Q53 139 55 139L62 139Q65 139 65 136L${f(R + 0.6)} 88Q${f(R + 0.8)} 80 ${f(R)} 72Q69.5 62 70.5 52L74.2 80Q74.5 83 76.6 83Q79 83 78.8 79L75.4 46Q75 41 71.5 39Q66 35 55 34L55 29Z`} /></>;
  }
  return <Svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMax meet" style={style}><G fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">{body}</G></Svg>;
}
/** The soft gradient behind a photo (.pg-ph). */
export function PhotoBack({ id }: { id: string }) {
  const k = useKit(), s2 = k.c['surface-2'];
  return <Svg style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
    <Defs><LinearGradient id={id} x1="0.37" y1="0" x2="0.63" y2="1"><Stop offset="0" stopColor={mix(k.c.recovery, s2, 0.4)} /><Stop offset="0.78" stopColor={mix(k.c.sleep, s2, 0.34)} /></LinearGradient></Defs>
    <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
  </Svg>;
}
