import { useState, type ReactNode } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { Icon, KitText, PressScale, Tappable, alpha, mix, slopFor, useKit, type IconName } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';
import { plate, raised, well } from '../../tiles/depth';
import { TileSurface } from '../../tiles/tile-surface';
import { dayView, nextMealId } from '../day';
import { useFoodDay } from '../selection';
import { useFoodRevision } from '../use-food-revision';
import { readWater } from '../water';
import { capitals } from '@/components/kit-style';

/* The Food tiles' own type and parts (pagetiles-food.js: fdt-n, fdt-s, fdt-t, fdt-k, fdt-plus, fdt-btn, fdt-ic, cols). */

/** A big number with its small unit (`.fdt-n`). */
export function Num({ v, unit, fs = 32, color, style }: { v: string; unit?: string; fs?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <KitText weight={700} size={fs} lineHeight={1} tracking={-0.03} numeric color={color} numberOfLines={1} style={style}>
    {v}{unit ? <KitText weight={600} size={13} color="text-muted">{` ${unit}`}</KitText> : null}
  </KitText>;
}
/** The muted small line (`.fdt-s`). Bold parts go in <B>. */
export function Sub({ children, size = 12.5, style, lines = 1, color }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle>; lines?: number; color?: string }) {
  return <KitText weight={500} size={size} lineHeight={1.35} color={color ?? 'text-muted'} numberOfLines={lines} style={style}>{children}</KitText>;
}
export function B({ children }: { children: ReactNode }) { return <KitText weight={600} size={12.5} color="text">{children}</KitText>; }
/** A title line (`.fdt-t`). */
export function Title({ children, size = 15, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  return <KitText weight={600} size={size} lineHeight={1.25} numberOfLines={1} style={style}>{children}</KitText>;
}
/** Small capitals (`.fdt-k`). */
export function Kick({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <KitText weight={700} size={10.5} lineHeight={1} tracking={0.1} color="text-muted" numberOfLines={1} style={[capitals, style]}>{children}</KitText>;
}
export const Hair = () => { const k = useKit(); return <View style={{ height: 1, backgroundColor: k.c.hair }} />; };

/** The round quick add (`.fdt-plus`): 30 pt, grown to 44 to touch. */
export function Plus({ onPress, label, color = 'food' }: { onPress: () => void; label: string; color?: string }) {
  const k = useKit(), c = k.tok(color);
  return <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={slopFor(30, 30)}
    style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: alpha(c, 0.16) }}>
    <Icon name="plus" size={17} color={c} />
  </PressScale>;
}
/** A tile button (`.fdt-btn`): raised in the tile colour, or `ghost` as a soft tint. */
export function TileButton({ label, icon, onPress, ghost, sm, color = 'food', full }: { label: string; icon?: IconName; onPress: () => void; ghost?: boolean; sm?: boolean; color?: string; full?: boolean }) {
  const k = useKit(), c = k.tok(color), h = sm ? 32 : 36, r = sm ? 10 : 12;
  const [w, setW] = useState(0);
  return <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={slopFor(10, h)} onLayout={e => setW(e.nativeEvent.layout.width)}
    style={{ height: h, borderRadius: r, paddingHorizontal: sm ? 12 : 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: ghost ? alpha(c, 0.15) : undefined, alignSelf: full ? 'stretch' : 'flex-start' }}>
    {!ghost && w ? <TileSurface spec={raised(c, k.mode, r)} width={w} height={h} /> : null}
    {icon ? <Icon name={icon} size={17} color={ghost ? c : k.c['on-accent']} /> : null}
    <KitText weight={700} size={sm ? 13 : 14} color={ghost ? c : k.c['on-accent']} numberOfLines={1}>{label}</KitText>
  </PressScale>;
}
/** An icon in a soft square (`.fdt-ic`); `outline` for a meal not logged yet. */
export function Ic({ name, color = 'food', outline }: { name: IconName; color?: string; outline?: boolean }) {
  const k = useKit(), c = k.tok(color);
  return <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: outline ? 'transparent' : alpha(c, 0.15), borderWidth: outline ? 1.5 : 0, borderColor: alpha(c, 0.45) }}>
    <Icon name={name} size={17} color={c} />
  </View>;
}
export const Dot = ({ color, size = 8 }: { color: string; size?: number }) => <View style={{ width: size, height: size, borderRadius: 2.5, backgroundColor: color, flexShrink: 0 }} />;

/** A row of a key and a value beside a gauge (`.fdt-kv`). */
export function KV({ k: key, v, unit, after }: { k: string; v: string; unit?: string; after?: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><KitText weight={600} size={13} color="text-muted">{key}</KitText>{after}</View>
    <KitText weight={700} size={17} tracking={-0.01} numeric>{v}{unit ? <KitText weight={600} size={11} color="text-muted">{` ${unit}`}</KitText> : null}</KitText>
  </View>;
}

/** Diagonal stripes, for a day still going or calories burned. */
export function Stripes({ w, h, color, a = 0.6, b = 0.26, step = 6 }: { w: number; h: number; color: string; a?: number; b?: number; step?: number }) {
  const id = `st${Math.round(w)}${Math.round(h)}${color.replace(/[^0-9a-z]/gi, '')}${step}`;
  return <Svg width={w} height={h} style={{ position: 'absolute', left: 0, bottom: 0 }}>
    <Defs><Pattern id={id} width={step} height={step} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <Rect width={step} height={step} fill={alpha(color, b)} /><Rect width={step / 2} height={step} fill={alpha(color, a)} />
    </Pattern></Defs>
    <Rect width={w} height={h} fill={`url(#${id})`} />
  </Svg>;
}

export interface ColsProps {
  vals: (number | null)[]; H: number; cw: number; max: number; goal?: number | null; band?: number | null; sel?: number | null; live?: number | null;
  last?: (number | null)[] | null; labels: string[]; vlab?: boolean | ((i: number) => boolean); vfmt?: (v: number) => string; color?: string;
  onDay?: (i: number) => void; aria?: (i: number, v: number | null) => string; label: string; labelSize?: number; lab?: boolean;
}
/** Capsule columns: a week of days in wells against a dashed goal line (`cols`). */
export function Cols({ vals, H, cw, max, goal, band, sel, live, last, labels, vlab, vfmt, color = 'food', onDay, aria, label, labelSize = 10.5, lab = true }: ColsProps) {
  const k = useKit(), c = k.tok(color);
  const goalY = goal != null ? goal / max * H + (lab ? 15.5 : 0) : null;
  return <View accessibilityRole="none" accessibilityLabel={label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
    {vals.map((v, i) => {
      const s = sel === i, lv = live === i, h = v ? Math.max(cw, Math.min(H, v / max * H)) : 0;
      const off = goal != null && band != null && v != null && !lv && Math.abs(v - goal) > goal * band;
      const showV = vlab && v != null && (vlab === true || vlab(i));
      const body = <>
        {vlab ? <KitText weight={700} size={10.5} lineHeight={1} numeric color={s ? c : 'text-muted'} style={{ height: 11 }} numberOfLines={1}>{showV ? (vfmt ? vfmt(v!) : String(Math.round(v!))) : ''}</KitText> : null}
        <View style={[{ width: cw, height: H, borderRadius: cw / 2 }, s && { boxShadow: `0px 0px 0px 2px ${k.c.surface}, 0px 0px 0px 3.5px ${c}` }]}>
          <TileSurface spec={well(k.c as never, k.mode, cw / 2)} width={cw} height={H} />
          {h ? <View style={{ position: 'absolute', left: 0, bottom: 0, width: cw, height: h, borderRadius: cw / 2, overflow: 'hidden', opacity: off ? 0.5 : 1,
            borderWidth: lv ? 1.5 : 0, borderColor: c }}>
            {lv ? <Stripes w={cw} h={h} color={c} /> : <TileSurface spec={raised(c, k.mode, cw / 2)} width={cw} height={h} />}
          </View> : null}
          {last?.[i] != null ? <View style={{ position: 'absolute', left: 0, right: 0, height: 2, bottom: Math.min(H - 2, last[i]! / max * H), backgroundColor: k.c.text, opacity: 0.6 }} /> : null}
        </View>
        {lab ? <KitText weight={700} size={labelSize} lineHeight={1} color={s ? c : 'text-muted'}>{labels[i]}</KitText> : null}
      </>;
      const a11y = aria ? aria(i, v) : undefined;
      return onDay
        ? <Tappable key={i} dim="fill" accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: s }} onPress={() => onDay(i)} hitSlop={{ left: 2, right: 2, top: 6, bottom: 6 }}
            style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5 }}>{body}</Tappable>
        : <View key={i} accessible={!!a11y} accessibilityLabel={a11y} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5 }}>{body}</View>;
    })}
    {goalY != null ? <Svg pointerEvents="none" width="100%" height={2} style={{ position: 'absolute', left: -2, right: -2, bottom: goalY - 0.75 }}>
      <Line x1={0} y1={1} x2={2000} y2={1} stroke={alpha(k.c.text, 0.5)} strokeWidth={1.5} strokeDasharray="4 3" />
    </Svg> : null}
  </View>;
}

/** A raised neutral plate (`.fdt-plate`) of a known size, holding its children. */
export function Plate({ w, h, children, style, radius = 14, none }: { w: number; h: number; children: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; none?: boolean }) {
  const k = useKit();
  return <View style={[{ width: w, height: h, borderRadius: radius }, none && { borderWidth: 1.5, borderColor: k.c['hair-2'] }, style]}>
    {none ? null : <TileSurface spec={plate(k.c as never, k.mode, radius)} width={w} height={h} />}
    {children}
  </View>;
}

/** Meal shades for stacked bars and legends: the food colour, then lighter mixes toward surface 2. */
const RAMP = [1, 0.74, 0.52, 0.36];
export const useShade = () => { const k = useKit(); return (i: number, color = 'food') => { const c = k.tok(color), w = RAMP[Math.min(3, i)]; return w === 1 ? c : mix(c, k.c['surface-2'], w); }; };

/** What every Food tile reads: the repository, the day picked in the strip, that day's food and water, and the next meal. */
export function useTileDay(): Repository | null {
  // Read without useAuth, which throws outside the provider: a tile drawn on its own (a preview, a test) shows no food.
  // The phone-only build swaps in its own provider, which keeps its context private, so this goes through useAuth.
  try { return useAuth().repository ?? null; } catch { return null; }
}
export function useDayData(repo: Repository) {
  useFoodRevision(repo);
  const sel = useFoodDay();
  const view = dayView(repo, sel.day, { today: sel.today, burned: sel.burned });
  const water = readWater(repo);
  return { ...sel, view, water, next: nextMealId(dayView(repo, sel.today, { today: sel.today })) };
}
